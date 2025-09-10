import { 
    normalizeIdentifier, 
    normalizeKeywords, 
    sanitizeUrl,
    createUrlSchema,
    updateUrlSchema 
} from '../../utils/validation.js';

export async function apiRoutes(fastify, opts) {
    fastify.post('/urls', {
        schema: {
            body: createUrlSchema
        }
    }, async (request, reply) => {
        try {
            const { 
                identifier, 
                keywords, 
                original_url, 
                short_code,
                title, 
                description, 
                expires_at,
                custom_metadata
            } = request.body;
            
            const normalizedIdentifier = identifier ? normalizeIdentifier(identifier) : null;
            const normalizedKeywords = normalizeKeywords(keywords);
            const sanitizedUrl = sanitizeUrl(original_url);
            
            const userId = request.user?.id || null;
            
            const existingUrl = await fastify.db.findShortenedUrl(
                normalizedIdentifier, 
                normalizedKeywords
            );
            
            if (existingUrl) {
                return reply.status(409).send({
                    statusCode: 409,
                    error: 'Conflict',
                    message: 'This identifier and keyword combination already exists',
                    existing: {
                        id: existingUrl.id,
                        identifier: existingUrl.identifier,
                        keywords: existingUrl.keywords
                    }
                });
            }
            
            const newUrl = await fastify.db.createShortenedUrl({
                user_id: userId,
                identifier: normalizedIdentifier,
                keywords: normalizedKeywords,
                original_url: sanitizedUrl,
                short_code,
                title,
                description,
                expires_at,
                custom_metadata
            });
            
            const cacheKeys = [];
            if (normalizedIdentifier) {
                normalizedKeywords.forEach(keyword => {
                    cacheKeys.push(`url:${normalizedIdentifier}:${keyword}`);
                });
                cacheKeys.push(`url:${normalizedIdentifier}:${normalizedKeywords.join(':')}`);
            } else {
                normalizedKeywords.forEach(keyword => {
                    cacheKeys.push(`url:${keyword}`);
                });
                cacheKeys.push(`url:${normalizedKeywords.join(':')}`);
            }
            
            for (const key of cacheKeys) {
                await fastify.cache.del(key);
            }
            
            reply.status(201).send({
                id: newUrl.id,
                identifier: newUrl.identifier,
                keywords: newUrl.keywords,
                original_url: newUrl.original_url,
                short_code: newUrl.short_code,
                created_at: newUrl.created_at,
                urls: generateUrlExamples(newUrl)
            });
            
        } catch (error) {
            fastify.log.error('Failed to create URL:', error);
            
            if (error.message.includes('Invalid')) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Bad Request',
                    message: error.message
                });
            }
            
            throw error;
        }
    });

    fastify.get('/urls/:id', async (request, reply) => {
        const { id } = request.params;
        
        try {
            const result = await fastify.db.query(
                'SELECT * FROM shortened_urls WHERE id = $1',
                [id]
            );
            
            if (result.rows.length === 0) {
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'URL not found'
                });
            }
            
            const url = result.rows[0];
            
            const analyticsResult = await fastify.db.query(
                `SELECT 
                    COUNT(*) as total_clicks,
                    COUNT(DISTINCT visitor_id) as unique_visitors,
                    MAX(clicked_at) as last_clicked
                 FROM analytics_events
                 WHERE shortened_url_id = $1`,
                [id]
            );
            
            const analytics = analyticsResult.rows[0];
            
            return {
                ...url,
                analytics: {
                    total_clicks: parseInt(analytics.total_clicks),
                    unique_visitors: parseInt(analytics.unique_visitors),
                    last_clicked: analytics.last_clicked
                },
                urls: generateUrlExamples(url)
            };
        } catch (error) {
            fastify.log.error('Failed to get URL:', error);
            throw error;
        }
    });

    fastify.put('/urls/:id', {
        schema: {
            body: updateUrlSchema
        }
    }, async (request, reply) => {
        const { id } = request.params;
        const updates = request.body;
        
        try {
            const existingResult = await fastify.db.query(
                'SELECT * FROM shortened_urls WHERE id = $1',
                [id]
            );
            
            if (existingResult.rows.length === 0) {
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'URL not found'
                });
            }
            
            const existing = existingResult.rows[0];
            
            const updateFields = [];
            const updateValues = [];
            let paramCount = 1;
            
            if (updates.keywords) {
                const normalizedKeywords = normalizeKeywords(updates.keywords);
                updateFields.push(`keywords = $${paramCount++}`);
                updateValues.push(normalizedKeywords);
            }
            
            if (updates.original_url) {
                const sanitizedUrl = sanitizeUrl(updates.original_url);
                updateFields.push(`original_url = $${paramCount++}`);
                updateValues.push(sanitizedUrl);
            }
            
            if (updates.title !== undefined) {
                updateFields.push(`title = $${paramCount++}`);
                updateValues.push(updates.title);
            }
            
            if (updates.description !== undefined) {
                updateFields.push(`description = $${paramCount++}`);
                updateValues.push(updates.description);
            }
            
            if (updates.is_active !== undefined) {
                updateFields.push(`is_active = $${paramCount++}`);
                updateValues.push(updates.is_active);
            }
            
            if (updates.expires_at !== undefined) {
                updateFields.push(`expires_at = $${paramCount++}`);
                updateValues.push(updates.expires_at);
            }
            
            if (updates.custom_metadata !== undefined) {
                updateFields.push(`custom_metadata = $${paramCount++}`);
                updateValues.push(updates.custom_metadata);
            }
            
            if (updateFields.length === 0) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Bad Request',
                    message: 'No valid fields to update'
                });
            }
            
            updateFields.push(`updated_at = NOW()`);
            updateValues.push(id);
            
            const updateQuery = `
                UPDATE shortened_urls 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *`;
            
            const result = await fastify.db.query(updateQuery, updateValues);
            const updated = result.rows[0];
            
            const cacheKeys = [];
            if (existing.identifier) {
                existing.keywords.forEach(keyword => {
                    cacheKeys.push(`url:${existing.identifier}:${keyword}`);
                });
                if (updated.keywords) {
                    updated.keywords.forEach(keyword => {
                        cacheKeys.push(`url:${existing.identifier}:${keyword}`);
                    });
                }
            } else {
                existing.keywords.concat(updated.keywords || []).forEach(keyword => {
                    cacheKeys.push(`url:${keyword}`);
                });
            }
            
            for (const key of cacheKeys) {
                await fastify.cache.del(key);
            }
            
            return {
                ...updated,
                urls: generateUrlExamples(updated)
            };
            
        } catch (error) {
            fastify.log.error('Failed to update URL:', error);
            
            if (error.message.includes('Invalid')) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Bad Request',
                    message: error.message
                });
            }
            
            throw error;
        }
    });

    fastify.delete('/urls/:id', async (request, reply) => {
        const { id } = request.params;
        
        try {
            const result = await fastify.db.query(
                'SELECT * FROM shortened_urls WHERE id = $1',
                [id]
            );
            
            if (result.rows.length === 0) {
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'URL not found'
                });
            }
            
            const url = result.rows[0];
            
            await fastify.db.query(
                'UPDATE shortened_urls SET is_active = false WHERE id = $1',
                [id]
            );
            
            const cacheKeys = [];
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
            
            for (const key of cacheKeys) {
                await fastify.cache.del(key);
            }
            
            reply.status(204).send();
            
        } catch (error) {
            fastify.log.error('Failed to delete URL:', error);
            throw error;
        }
    });

    fastify.get('/urls/:id/analytics', async (request, reply) => {
        const { id } = request.params;
        const { period = '30d' } = request.query;
        
        try {
            const urlResult = await fastify.db.query(
                'SELECT * FROM shortened_urls WHERE id = $1',
                [id]
            );
            
            if (urlResult.rows.length === 0) {
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'URL not found'
                });
            }
            
            const [
                timeline,
                referrers,
                devices,
                geography,
                campaigns
            ] = await Promise.all([
                fastify.analytics.getClickTimeline(id, period),
                fastify.analytics.getTopReferrers(id),
                fastify.analytics.getDeviceStats(id),
                fastify.analytics.getGeographicStats(id),
                fastify.analytics.getUtmCampaignStats(id)
            ]);
            
            return {
                url: urlResult.rows[0],
                period,
                timeline,
                referrers,
                devices,
                geography,
                campaigns
            };
            
        } catch (error) {
            fastify.log.error('Failed to get analytics:', error);
            throw error;
        }
    });
}

function generateUrlExamples(url) {
    const baseUrl = process.env.BASE_URL || 'https://wordsto.link';
    const examples = [];
    
    if (url.short_code) {
        examples.push(`${baseUrl}/s/${url.short_code}`);
    }
    
    if (url.identifier) {
        url.keywords.forEach(keyword => {
            examples.push(`${baseUrl}/${url.identifier}/${keyword}`);
        });
        
        if (url.keywords.length > 1) {
            examples.push(`${baseUrl}/${url.identifier}/${url.keywords.join('/')}`);
        }
    } else {
        url.keywords.forEach(keyword => {
            examples.push(`${baseUrl}/${keyword}`);
        });
        
        if (url.keywords.length > 1) {
            examples.push(`${baseUrl}/${url.keywords.join('/')}`);
        }
    }
    
    return examples.slice(0, 5);
}