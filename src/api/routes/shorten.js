import { createShortenSchema, validateRequest } from '../schemas/validation.js';
import { nanoid } from 'nanoid';

export async function shortenRoutes(fastify, opts) {
    fastify.post('/shorten', {
        preHandler: [
            fastify.authenticate,
            // TODO: Add these middlewares later
            // fastify.checkUrlLimit,
            // fastify.requireIdentifierOwnership,
            validateRequest(createShortenSchema)
        ]
    }, async (request, reply) => {
        const userId = request.user.id;
        const {
            identifier,
            keywords,
            destination_url,
            title,
            description,
            expires_at,
            custom_metadata,
            is_public
        } = request.body;

        try {
            await fastify.db.query('BEGIN');

            const existingUrl = await fastify.db.query(
                `SELECT id, original_url FROM shortened_urls 
                 WHERE ($1::varchar IS NULL OR identifier = $1) 
                   AND keywords = $2::text[] 
                   AND is_active = true`,
                [identifier, keywords]
            );

            if (existingUrl.rows.length > 0) {
                await fastify.db.query('ROLLBACK');
                
                const existing = existingUrl.rows[0];
                if (existing.original_url === destination_url) {
                    return reply.status(200).send({
                        id: existing.id,
                        message: 'URL already exists with same destination',
                        path: buildUrlPath(identifier, keywords),
                        full_url: buildFullUrl(request, identifier, keywords)
                    });
                }

                return reply.status(409).send({
                    statusCode: 409,
                    error: 'Conflict',
                    message: 'This keyword combination is already in use',
                    existing_path: buildUrlPath(identifier, keywords)
                });
            }

            const userLimits = await checkUserLimits(fastify.db, userId);
            if (!userLimits.canCreate) {
                await fastify.db.query('ROLLBACK');
                return reply.status(403).send({
                    statusCode: 403,
                    error: 'Limit Exceeded',
                    message: userLimits.message,
                    limits: userLimits.limits
                });
            }

            const shortCode = nanoid(8);
            
            const result = await fastify.db.query(
                `INSERT INTO shortened_urls (
                    user_id, identifier, keywords, original_url, short_code,
                    title, description, expires_at, custom_metadata, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *`,
                [
                    userId, identifier, keywords, destination_url, shortCode,
                    title, description, expires_at, custom_metadata, true
                ]
            );

            await fastify.db.query('COMMIT');

            const newUrl = result.rows[0];
            
            await invalidateCache(fastify.cache, identifier, keywords);

            fastify.log.info({
                event: 'url_created',
                user_id: userId,
                url_id: newUrl.id,
                identifier,
                keywords,
                short_code: shortCode
            });

            const response = {
                id: newUrl.id,
                short_code: shortCode,
                path: buildUrlPath(identifier, keywords),
                full_url: buildFullUrl(request, identifier, keywords),
                short_url: buildFullUrl(request, null, null, shortCode),
                identifier,
                keywords,
                destination_url,
                title,
                description,
                expires_at,
                created_at: newUrl.created_at
            };

            return reply.status(201).send(response);

        } catch (error) {
            await fastify.db.query('ROLLBACK');
            fastify.log.error('Failed to create shortened URL:', error);
            
            if (error.code === '23505') {
                return reply.status(409).send({
                    statusCode: 409,
                    error: 'Conflict',
                    message: 'A URL with this configuration already exists'
                });
            }

            throw error;
        }
    });

    fastify.post('/shorten/bulk', {
        preHandler: [
            fastify.authenticate,
            // TODO: Add plan check later
            // fastify.requirePlan(['business', 'enterprise'])
        ]
    }, async (request, reply) => {
        const userId = request.user.id;
        const { urls } = request.body;

        if (!Array.isArray(urls) || urls.length === 0) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'urls array is required'
            });
        }

        if (urls.length > 100) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Maximum 100 URLs per bulk request'
            });
        }

        const results = [];
        const errors = [];

        for (let i = 0; i < urls.length; i++) {
            try {
                const validated = await createShortenSchema.parseAsync(urls[i]);
                
                const shortCode = nanoid(8);
                const result = await fastify.db.query(
                    `INSERT INTO shortened_urls (
                        user_id, identifier, keywords, original_url, short_code,
                        title, description, expires_at, custom_metadata, is_active
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (identifier, keywords) DO NOTHING
                    RETURNING *`,
                    [
                        userId, validated.identifier, validated.keywords, 
                        validated.destination_url, shortCode,
                        validated.title, validated.description, 
                        validated.expires_at, validated.custom_metadata, true
                    ]
                );

                if (result.rows.length > 0) {
                    const newUrl = result.rows[0];
                    results.push({
                        index: i,
                        success: true,
                        id: newUrl.id,
                        path: buildUrlPath(validated.identifier, validated.keywords),
                        full_url: buildFullUrl(request, validated.identifier, validated.keywords)
                    });
                } else {
                    errors.push({
                        index: i,
                        error: 'URL already exists',
                        data: urls[i]
                    });
                }
            } catch (error) {
                errors.push({
                    index: i,
                    error: error.message,
                    data: urls[i]
                });
            }
        }

        return reply.status(207).send({
            statusCode: 207,
            message: 'Bulk operation completed',
            total: urls.length,
            successful: results.length,
            failed: errors.length,
            results,
            errors
        });
    });
}

async function checkUserLimits(db, userId) {
    const result = await db.query(
        `SELECT 
            u.subscription_tier,
            sp.max_urls,
            sp.max_clicks_per_month,
            COUNT(s.id) as current_urls,
            COUNT(CASE WHEN s.created_at > NOW() - INTERVAL '30 days' THEN 1 END) as monthly_urls
         FROM users u
         LEFT JOIN subscription_plans sp ON u.subscription_tier = sp.name
         LEFT JOIN shortened_urls s ON u.id = s.user_id AND s.is_active = true
         WHERE u.id = $1
         GROUP BY u.id, u.subscription_tier, sp.max_urls, sp.max_clicks_per_month`,
        [userId]
    );

    if (result.rows.length === 0) {
        return {
            canCreate: false,
            message: 'User not found'
        };
    }

    const limits = result.rows[0];
    
    if (limits.max_urls !== -1 && limits.current_urls >= limits.max_urls) {
        return {
            canCreate: false,
            message: `You have reached your limit of ${limits.max_urls} URLs. Please upgrade your plan.`,
            limits: {
                tier: limits.subscription_tier,
                max_urls: limits.max_urls,
                current_urls: parseInt(limits.current_urls)
            }
        };
    }

    return {
        canCreate: true,
        limits: {
            tier: limits.subscription_tier,
            max_urls: limits.max_urls,
            current_urls: parseInt(limits.current_urls),
            remaining: limits.max_urls === -1 ? 'unlimited' : limits.max_urls - parseInt(limits.current_urls)
        }
    };
}

async function invalidateCache(cache, identifier, keywords) {
    const cacheKeys = [];
    
    if (identifier) {
        keywords.forEach(keyword => {
            cacheKeys.push(`url:${identifier}:${keyword}`);
        });
        cacheKeys.push(`url:${identifier}:${keywords.join(':')}`);
    } else {
        keywords.forEach(keyword => {
            cacheKeys.push(`url:${keyword}`);
        });
        cacheKeys.push(`url:${keywords.join(':')}`);
    }
    
    await Promise.all(cacheKeys.map(key => cache.del(key)));
}

function buildUrlPath(identifier, keywords) {
    if (identifier) {
        return `${identifier}/${keywords.join('/')}`;
    }
    return keywords.join('/');
}

function buildFullUrl(request, identifier, keywords, shortCode = null) {
    // Always use wordsto.link unless we're on localhost
    const requestHost = request.headers.host || '';
    const isLocalhost = requestHost.startsWith('localhost') || requestHost.startsWith('127.0.0.1');
    
    const protocol = isLocalhost ? 'http' : 'https';
    const host = isLocalhost ? requestHost : 'wordsto.link';
    const baseUrl = `${protocol}://${host}`;
    
    if (shortCode) {
        return `${baseUrl}/s/${shortCode}`;
    }
    
    const path = buildUrlPath(identifier, keywords);
    return `${baseUrl}/${path}`;
}