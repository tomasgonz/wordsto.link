import { validateIdentifier, validateKeyword } from '../../utils/validation.js';
import { parseUserAgent, getClientIp, extractUtmParams } from '../../utils/request-utils.js';
import { nanoid } from 'nanoid';

export async function redirectHandler(fastify, opts) {
    const cache = createCacheAdapter(fastify);
    const RESERVED_KEYWORDS = new Set([
        'admin','api','app','auth','dashboard','login','logout','register','settings','profile','account','billing',
        'terms','privacy','help','support','docs','documentation'
    ]);
    fastify.get('/*', async (request, reply) => {
        const startTime = Date.now();
        const rawSegments = request.params['*'].split('/').filter(Boolean);
        const pathSegments = rawSegments.map(s => {
            try { return decodeURIComponent(s); } catch { return s; }
        });
        // Early reject traversal patterns
        if (rawSegments.some(s => s.includes('..') || s.startsWith('.'))) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'URL path contains invalid traversal characters'
            });
        }
        
        if (pathSegments.length === 0) {
            return reply.callNotFound();
        }

        if (pathSegments.length > 6) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'URL path too long (max 6 segments)'
            });
        }

        let identifier = null;
        let keywords = [];
        let lookupResult = null;
        let cacheKey = null;

        try {
            if (pathSegments.length === 1) {
                const keyword = pathSegments[0].toLowerCase();

                if (keyword.includes('..') || keyword.startsWith('.')) {
                    return reply.status(400).send({
                        statusCode: 400,
                        error: 'Bad Request',
                        message: 'URL path contains invalid traversal characters'
                    });
                }
                
                keywords = [keyword];
                cacheKey = `url:keywords:${keyword}`;
            } else {
                const firstSegment = pathSegments[0].toLowerCase();
                
                if (validateIdentifier(firstSegment) && !RESERVED_KEYWORDS.has(firstSegment)) {
                    identifier = firstSegment;
                    keywords = pathSegments.slice(1).map(k => k.toLowerCase());
                    
                    if (keywords.some(k => k.includes('..') || k.startsWith('.'))) {
                        return reply.status(400).send({
                            statusCode: 400,
                            error: 'Bad Request',
                            message: 'URL path contains invalid traversal characters'
                        });
                    }
                    
                    if (keywords.length > 5) {
                        return reply.status(400).send({
                            statusCode: 400,
                            error: 'Too many keywords',
                            message: 'Maximum 5 keywords allowed per URL'
                        });
                    }
                    
                    cacheKey = `url:identifier:${identifier}:keywords:${keywords.join(':')}`;
                } else {
                    keywords = pathSegments.map(k => k.toLowerCase());
                    
                    if (keywords.some(k => k.includes('..') || k.startsWith('.'))) {
                        return reply.status(400).send({
                            statusCode: 400,
                            error: 'Bad Request',
                            message: 'URL path contains invalid traversal characters'
                        });
                    }
                    
                    cacheKey = `url:keywords:${keywords.join(':')}`;
                }
            }

            // Try cache first
            let cached = null;
            try {
                cached = await cache.get(cacheKey);
            } catch (e) {
                fastify.log.warn('Cache get failed, falling back to DB:', e?.message);
            }
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    const target = parsed?.original_url || parsed?.url || parsed?.destination || '';
                    if (target) {
                        reply.header('Cache-Control', 'public, max-age=3600');
                        reply.header('X-Robots-Tag', 'noindex, nofollow');
                        return reply.redirect(302, target);
                    }
                    lookupResult = parsed;
                    fastify.log.debug(`Cache hit for ${cacheKey}`);
                } catch (parseError) {
                    fastify.log.error('Failed to parse cache:', parseError);
                }
            }
            
            // If not in cache or cache parse failed, query database
            if (!lookupResult) {
                if (identifier) {
                    if (fastify.db?.findShortenedUrl) {
                        lookupResult = await fastify.db.findShortenedUrl(identifier, keywords);
                    } else if (fastify.db?.query) {
                        const res = await fastify.db.query(
                            'SELECT id, original_url FROM shortened_urls WHERE identifier = $1 AND keywords @> $2::text[] AND is_active = true',
                            [identifier, keywords]
                        );
                        lookupResult = res.rows[0] || null;
                    }
                }
                if (!lookupResult && fastify.db?.query) {
                    const res = await fastify.db.query(
                        'SELECT id, original_url FROM shortened_urls WHERE keywords @> $1::text[] AND identifier IS NULL AND is_active = true',
                        [keywords]
                    );
                    lookupResult = res.rows[0] || null;
                }

                if (lookupResult) {
                    await cache.set(cacheKey, JSON.stringify(lookupResult), 3600);
                    fastify.log.debug(`Cache miss for ${cacheKey}, cached for 3600s`);
                }
            }

            if (!lookupResult) {
                const suggestions = await getSuggestions(fastify.db, identifier, keywords);
                
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'not found',
                    path: request.url,
                    identifier,
                    keywords,
                    suggestions: suggestions.length > 0 ? suggestions : undefined
                });
            }

            const responseTime = Date.now() - startTime;

            // Visitor tracking
            const visitorId = nanoid(16);
            
            const userAgentData = parseUserAgent(request.headers['user-agent']);
            const clientIp = getClientIp(request);
            const utmParams = extractUtmParams(request.query);

            // Track analytics if available
            if (fastify.analytics && fastify.analytics.track) {
                fastify.analytics.track({
                    shortened_url_id: lookupResult.id,
                    visitor_id: visitorId,
                    ip_address: clientIp,
                    user_agent: request.headers['user-agent'],
                    referer: request.headers.referer || request.headers.referrer,
                    ...userAgentData,
                    ...utmParams,
                    response_time_ms: responseTime
                }).catch(err => {
                    fastify.log.error('Failed to track analytics:', err);
                });
            } else if (fastify.db?.query) {
                // Fallback: write analytics event directly
                try {
                    await fastify.db.query(
                        'INSERT INTO analytics_events (shortened_url_id, visitor_id, ip_address, browser_name, browser_version, os_name, is_bot, clicked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
                        [
                            lookupResult.id,
                            visitorId,
                            clientIp,
                            userAgentData.browser_name || null,
                            userAgentData.browser_version || null,
                            userAgentData.os_name || null,
                            userAgentData.is_bot || false
                        ]
                    );
                } catch (err) {
                    fastify.log.error('Fallback analytics insert failed:', err);
                }
            }

            // Update click count
            if (fastify.db?.query) {
                try {
                    await fastify.db.query(
                        'UPDATE shortened_urls SET click_count = click_count + 1, last_clicked_at = NOW() WHERE id = $1',
                        [lookupResult.id]
                    );
                } catch (err) {
                    fastify.log.error('Failed to increment click count:', err);
                }
            }

            // Unique visitor counting via Redis if available
            if (fastify.redis?.incr && fastify.redis?.expire) {
                const uvKey = `visitor:${lookupResult.id}:${clientIp || 'unknown'}`;
                try {
                    await fastify.redis.incr(uvKey);
                    await fastify.redis.expire(uvKey, 86400);
                } catch (err) {
                    fastify.log.warn('Visitor counter failed:', err?.message);
                }
            }

            reply.header('Cache-Control', 'public, max-age=3600');
            reply.header('X-Robots-Tag', 'noindex, nofollow');
            
            return reply.redirect(302, lookupResult.original_url);

        } catch (error) {
            fastify.log.error('Redirect handler error object:', {
                message: error?.message || 'No message',
                stack: error?.stack || 'No stack',
                name: error?.name || 'No name',
                code: error?.code || 'No code',
                fullError: JSON.stringify(error, null, 2)
            });
            
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'An error occurred while processing your request',
                debug: process.env.NODE_ENV === 'development' ? error?.message : undefined
            });
        }
    });
}

export default redirectHandler;

function createCacheAdapter(fastify) {
    // Prefer explicit cache if provided, else adapt redis client
    if (fastify.cache && typeof fastify.cache.get === 'function') {
        return fastify.cache;
    }

    const redis = fastify.redis;
    if (redis) {
        return {
            async get(key) {
                return await redis.get(key);
            },
            async set(key, value, ttlSeconds) {
                // Use EX for TTL semantics like node-redis v3
                return await redis.set(key, value, 'EX', ttlSeconds);
            },
            async del(key) {
                return await redis.del(key);
            }
        };
    }

    // Fallback no-op cache to avoid crashes in tests without a cache
    return {
        async get() { return null; },
        async set() { return true; },
        async del() { return true; }
    };
}

async function getSuggestions(db, identifier, keywords) {
    try {
        const suggestions = [];
        
        if (identifier && keywords.length > 0) {
            const identifierUrls = await db.query(
                `SELECT DISTINCT keywords FROM shortened_urls 
                 WHERE identifier = $1 AND is_active = true 
                 LIMIT 5`,
                [identifier]
            );
            
            if (identifierUrls.rows.length > 0) {
                suggestions.push({
                    type: 'identifier_keywords',
                    message: `Found URLs for identifier "${identifier}" with different keywords`,
                    examples: identifierUrls.rows.map(r => `${identifier}/${r.keywords.join('/')}`)
                });
            }
        }
        
        if (keywords.length === 1) {
            const similarKeywords = await db.query(
                `SELECT DISTINCT keywords FROM shortened_urls 
                 WHERE keywords @> ARRAY[$1]::text[] 
                    OR $1 % ANY(keywords)
                 AND is_active = true 
                 LIMIT 5`,
                [keywords[0]]
            );
            
            if (similarKeywords.rows.length > 0) {
                suggestions.push({
                    type: 'similar_keywords',
                    message: 'Similar keywords found',
                    examples: similarKeywords.rows.flatMap(r => r.keywords)
                });
            }
        }
        
        if (keywords.length > 1) {
            for (const keyword of keywords) {
                const partialMatch = await db.query(
                    `SELECT identifier, keywords FROM shortened_urls 
                     WHERE keywords @> ARRAY[$1]::text[] 
                     AND is_active = true 
                     LIMIT 3`,
                    [keyword]
                );
                
                if (partialMatch.rows.length > 0) {
                    suggestions.push({
                        type: 'partial_match',
                        message: `URLs containing keyword "${keyword}"`,
                        examples: partialMatch.rows.map(r => 
                            r.identifier ? `${r.identifier}/${r.keywords.join('/')}` : r.keywords.join('/')
                        )
                    });
                    break;
                }
            }
        }
        
        return suggestions.slice(0, 3);
    } catch (error) {
        console.error('Error getting suggestions:', error);
        return [];
    }
}
