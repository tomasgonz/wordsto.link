import { listUrlsSchema, updateUrlSchema, validateQueryParams, validateRequest } from '../schemas/validation.js';
import { subDays, format } from 'date-fns';

export async function urlsRoutes(fastify, opts) {
    fastify.get('/urls', {
        preHandler: [
            fastify.authenticate,
            validateQueryParams(listUrlsSchema)
        ]
    }, async (request, reply) => {
        const userId = request.user.id;
        const {
            page,
            limit,
            search,
            identifier,
            sort_by,
            order,
            is_active,
            has_expired
        } = request.validatedQuery;

        const offset = (page - 1) * limit;

        let whereConditions = ['s.user_id = $1'];
        let queryParams = [userId];
        let paramCounter = 2;

        if (search) {
            whereConditions.push(`(
                s.title ILIKE $${paramCounter} OR 
                s.description ILIKE $${paramCounter} OR 
                s.original_url ILIKE $${paramCounter} OR
                $${paramCounter + 1} = ANY(s.keywords)
            )`);
            queryParams.push(`%${search}%`, search.toLowerCase());
            paramCounter += 2;
        }

        if (identifier !== undefined) {
            if (identifier === 'null' || identifier === '') {
                whereConditions.push('s.identifier IS NULL');
            } else {
                whereConditions.push(`s.identifier = $${paramCounter}`);
                queryParams.push(identifier);
                paramCounter++;
            }
        }

        if (is_active !== undefined) {
            whereConditions.push(`s.is_active = $${paramCounter}`);
            queryParams.push(is_active);
            paramCounter++;
        }

        if (has_expired === true) {
            whereConditions.push('s.expires_at < NOW()');
        } else if (has_expired === false) {
            whereConditions.push('(s.expires_at IS NULL OR s.expires_at >= NOW())');
        }

        const whereClause = whereConditions.join(' AND ');

        const sortColumn = {
            'created_at': 's.created_at',
            'click_count': 's.click_count',
            'last_clicked_at': 's.last_clicked_at',
            'title': 's.title'
        }[sort_by] || 's.created_at';

        const countQuery = `
            SELECT COUNT(*) as total
            FROM shortened_urls s
            WHERE ${whereClause}
        `;

        const dataQuery = `
            SELECT 
                s.*,
                CASE 
                    WHEN s.identifier IS NOT NULL THEN 
                        s.identifier || '/' || array_to_string(s.keywords, '/')
                    ELSE 
                        array_to_string(s.keywords, '/')
                END as full_path,
                CASE 
                    WHEN s.expires_at < NOW() THEN true 
                    ELSE false 
                END as is_expired,
                (
                    SELECT COUNT(*) 
                    FROM analytics_events 
                    WHERE shortened_url_id = s.id 
                    AND clicked_at > NOW() - INTERVAL '24 hours'
                ) as clicks_24h,
                (
                    SELECT COUNT(DISTINCT visitor_id) 
                    FROM analytics_events 
                    WHERE shortened_url_id = s.id 
                    AND clicked_at > NOW() - INTERVAL '24 hours'
                ) as unique_visitors_24h
            FROM shortened_urls s
            WHERE ${whereClause}
            ORDER BY ${sortColumn} ${order.toUpperCase()}
            LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
        `;

        queryParams.push(limit, offset);

        try {
            const [countResult, dataResult] = await Promise.all([
                fastify.db.query(countQuery, queryParams.slice(0, -2)),
                fastify.db.query(dataQuery, queryParams)
            ]);

            const total = parseInt(countResult.rows[0].total);
            const totalPages = Math.ceil(total / limit);

            const urls = dataResult.rows.map(url => ({
                id: url.id,
                path: url.full_path,
                short_code: url.short_code,
                identifier: url.identifier,
                keywords: url.keywords,
                destination_url: url.original_url,
                title: url.title,
                description: url.description,
                click_count: parseInt(url.click_count),
                unique_visitors: parseInt(url.unique_visitors),
                clicks_24h: parseInt(url.clicks_24h),
                unique_visitors_24h: parseInt(url.unique_visitors_24h),
                last_clicked_at: url.last_clicked_at,
                is_active: url.is_active,
                is_expired: url.is_expired,
                expires_at: url.expires_at,
                created_at: url.created_at,
                updated_at: url.updated_at,
                full_url: buildFullUrl(request, url.identifier, url.keywords),
                short_url: url.short_code ? buildFullUrl(request, null, null, url.short_code) : null
            }));

            const response = {
                urls,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: totalPages,
                    has_next: page < totalPages,
                    has_prev: page > 1
                },
                filters: {
                    search,
                    identifier,
                    is_active,
                    has_expired,
                    sort_by,
                    order
                }
            };

            const stats = await getUserStats(fastify.db, userId);
            response.stats = stats;

            return reply.send(response);

        } catch (error) {
            fastify.log.error('Failed to list URLs:', error);
            throw error;
        }
    });

    fastify.get('/urls/:id', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        const userId = request.user.id;
        const { id } = request.params;

        try {
            const result = await fastify.db.query(
                `SELECT 
                    s.*,
                    CASE 
                        WHEN s.identifier IS NOT NULL THEN 
                            s.identifier || '/' || array_to_string(s.keywords, '/')
                        ELSE 
                            array_to_string(s.keywords, '/')
                    END as full_path,
                    (
                        SELECT json_build_object(
                            'total_clicks', COUNT(*),
                            'unique_visitors', COUNT(DISTINCT visitor_id),
                            'clicks_today', COUNT(CASE WHEN clicked_at > CURRENT_DATE THEN 1 END),
                            'clicks_this_week', COUNT(CASE WHEN clicked_at > CURRENT_DATE - INTERVAL '7 days' THEN 1 END),
                            'clicks_this_month', COUNT(CASE WHEN clicked_at > CURRENT_DATE - INTERVAL '30 days' THEN 1 END)
                        )
                        FROM analytics_events
                        WHERE shortened_url_id = s.id
                    ) as analytics_summary
                FROM shortened_urls s
                WHERE s.id = $1 AND s.user_id = $2`,
                [id, userId]
            );

            if (result.rows.length === 0) {
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'URL not found or you do not have permission to view it'
                });
            }

            const url = result.rows[0];

            return reply.send({
                id: url.id,
                path: url.full_path,
                short_code: url.short_code,
                identifier: url.identifier,
                keywords: url.keywords,
                destination_url: url.original_url,
                title: url.title,
                description: url.description,
                custom_metadata: url.custom_metadata,
                click_count: parseInt(url.click_count),
                unique_visitors: parseInt(url.unique_visitors),
                last_clicked_at: url.last_clicked_at,
                is_active: url.is_active,
                expires_at: url.expires_at,
                created_at: url.created_at,
                updated_at: url.updated_at,
                analytics_summary: url.analytics_summary,
                full_url: buildFullUrl(request, url.identifier, url.keywords),
                short_url: url.short_code ? buildFullUrl(request, null, null, url.short_code) : null,
                qr_code_url: url.qr_code_url
            });

        } catch (error) {
            fastify.log.error('Failed to get URL:', error);
            throw error;
        }
    });

    fastify.patch('/urls/:id', {
        preHandler: [
            fastify.authenticate,
            validateRequest(updateUrlSchema)
        ]
    }, async (request, reply) => {
        const userId = request.user.id;
        const { id } = request.params;
        const updates = request.validated;

        try {
            const existingResult = await fastify.db.query(
                'SELECT * FROM shortened_urls WHERE id = $1 AND user_id = $2',
                [id, userId]
            );

            if (existingResult.rows.length === 0) {
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'URL not found or you do not have permission to update it'
                });
            }

            const existing = existingResult.rows[0];

            if (updates.keywords && existing.identifier) {
                const conflictCheck = await fastify.db.query(
                    `SELECT id FROM shortened_urls 
                     WHERE identifier = $1 AND keywords = $2 AND id != $3`,
                    [existing.identifier, updates.keywords, id]
                );

                if (conflictCheck.rows.length > 0) {
                    return reply.status(409).send({
                        statusCode: 409,
                        error: 'Conflict',
                        message: 'This keyword combination is already in use for this identifier'
                    });
                }
            }

            const updateFields = [];
            const updateValues = [];
            let paramCount = 1;

            Object.entries(updates).forEach(([key, value]) => {
                if (value !== undefined) {
                    const columnName = key === 'destination_url' ? 'original_url' : key;
                    updateFields.push(`${columnName} = $${paramCount++}`);
                    updateValues.push(value);
                }
            });

            if (updateFields.length === 0) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Bad Request',
                    message: 'No valid fields to update'
                });
            }

            updateFields.push('updated_at = NOW()');
            updateValues.push(id, userId);

            const updateQuery = `
                UPDATE shortened_urls 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
                RETURNING *`;

            const result = await fastify.db.query(updateQuery, updateValues);
            const updated = result.rows[0];

            await invalidateCache(fastify.cache, existing, updated);

            fastify.log.info({
                event: 'url_updated',
                user_id: userId,
                url_id: id,
                updates: Object.keys(updates)
            });

            return reply.send({
                id: updated.id,
                path: buildUrlPath(updated.identifier, updated.keywords),
                short_code: updated.short_code,
                identifier: updated.identifier,
                keywords: updated.keywords,
                destination_url: updated.original_url,
                title: updated.title,
                description: updated.description,
                is_active: updated.is_active,
                expires_at: updated.expires_at,
                updated_at: updated.updated_at,
                full_url: buildFullUrl(request, updated.identifier, updated.keywords),
                short_url: updated.short_code ? buildFullUrl(request, null, null, updated.short_code) : null
            });

        } catch (error) {
            fastify.log.error('Failed to update URL:', error);
            throw error;
        }
    });

    fastify.delete('/urls/:id', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        const userId = request.user.id;
        const { id } = request.params;
        const { permanent } = request.query;

        try {
            const result = await fastify.db.query(
                'SELECT * FROM shortened_urls WHERE id = $1 AND user_id = $2',
                [id, userId]
            );

            if (result.rows.length === 0) {
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'URL not found or you do not have permission to delete it'
                });
            }

            const url = result.rows[0];

            if (permanent === 'true') {
                await fastify.db.query(
                    'DELETE FROM shortened_urls WHERE id = $1 AND user_id = $2',
                    [id, userId]
                );
            } else {
                await fastify.db.query(
                    'UPDATE shortened_urls SET is_active = false, updated_at = NOW() WHERE id = $1 AND user_id = $2',
                    [id, userId]
                );
            }

            await invalidateCache(fastify.cache, url);

            fastify.log.info({
                event: permanent === 'true' ? 'url_deleted' : 'url_deactivated',
                user_id: userId,
                url_id: id
            });

            return reply.status(204).send();

        } catch (error) {
            fastify.log.error('Failed to delete URL:', error);
            throw error;
        }
    });
}

async function getUserStats(db, userId) {
    const result = await db.query(
        `SELECT 
            COUNT(*) FILTER (WHERE is_active = true) as active_urls,
            COUNT(*) FILTER (WHERE is_active = false) as inactive_urls,
            COUNT(*) as total_urls,
            SUM(click_count) as total_clicks,
            SUM(unique_visitors) as total_unique_visitors,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as urls_created_this_month,
            COUNT(*) FILTER (WHERE last_clicked_at > NOW() - INTERVAL '24 hours') as urls_clicked_today
         FROM shortened_urls
         WHERE user_id = $1`,
        [userId]
    );

    return {
        active_urls: parseInt(result.rows[0].active_urls),
        inactive_urls: parseInt(result.rows[0].inactive_urls),
        total_urls: parseInt(result.rows[0].total_urls),
        total_clicks: parseInt(result.rows[0].total_clicks || 0),
        total_unique_visitors: parseInt(result.rows[0].total_unique_visitors || 0),
        urls_created_this_month: parseInt(result.rows[0].urls_created_this_month),
        urls_clicked_today: parseInt(result.rows[0].urls_clicked_today)
    };
}

async function invalidateCache(cache, ...urls) {
    const cacheKeys = [];
    
    for (const url of urls) {
        if (!url) continue;
        
        if (url.identifier) {
            url.keywords.forEach(keyword => {
                cacheKeys.push(`url:${url.identifier}:${keyword}`);
            });
            cacheKeys.push(`url:${url.identifier}:${url.keywords.join(':')}`);
        } else {
            url.keywords.forEach(keyword => {
                cacheKeys.push(`url:${keyword}`);
            });
            cacheKeys.push(`url:${url.keywords.join(':')}`);
        }
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
    // In production, always use wordsto.link
    const isProduction = process.env.NODE_ENV === 'production';
    const protocol = isProduction ? 'https' : (request.headers['x-forwarded-proto'] || 'http');
    const host = isProduction ? 'wordsto.link' : request.headers.host;
    const baseUrl = `${protocol}://${host}`;
    
    if (shortCode) {
        return `${baseUrl}/s/${shortCode}`;
    }
    
    if (identifier || keywords) {
        const path = buildUrlPath(identifier, keywords);
        return `${baseUrl}/${path}`;
    }
    
    return null;
}