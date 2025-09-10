export async function userRoutes(fastify, opts) {
    // Get user profile with identifiers
    fastify.get('/user/profile', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        const userId = request.user.id;

        try {
            const result = await fastify.db.query(
                `SELECT 
                    u.*,
                    sp.name as plan_name,
                    sp.max_urls,
                    sp.max_clicks_per_month,
                    sp.max_custom_domains,
                    sp.features,
                    array_agg(
                        DISTINCT jsonb_build_object(
                            'identifier', ui.identifier,
                            'is_primary', ui.is_primary,
                            'claimed_at', ui.claimed_at
                        )
                    ) FILTER (WHERE ui.identifier IS NOT NULL) as identifiers,
                    (SELECT COUNT(*) FROM shortened_urls WHERE user_id = u.id AND is_active = true) as active_urls_count,
                    (SELECT SUM(click_count) FROM shortened_urls WHERE user_id = u.id) as total_clicks
                 FROM users u
                 LEFT JOIN subscription_plans sp ON u.subscription_tier = sp.name
                 LEFT JOIN user_identifiers ui ON u.id = ui.user_id AND ui.is_active = true
                 WHERE u.id = $1
                 GROUP BY u.id, sp.name, sp.max_urls, sp.max_clicks_per_month, sp.max_custom_domains, sp.features`,
                [userId]
            );

            if (result.rows.length === 0) {
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'User profile not found'
                });
            }

            return reply.send(result.rows[0]);
        } catch (error) {
            fastify.log.error('Failed to get user profile:', error);
            throw error;
        }
    });

    // Get user's identifiers
    fastify.get('/user/identifiers', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        const userId = request.user.id;

        try {
            const result = await fastify.db.query(
                `SELECT 
                    ui.identifier,
                    ui.is_primary,
                    ui.claimed_at,
                    COUNT(s.id) as urls_count,
                    SUM(s.click_count) as total_clicks
                 FROM user_identifiers ui
                 LEFT JOIN shortened_urls s ON ui.identifier = s.identifier AND s.user_id = $1
                 WHERE ui.user_id = $1 AND ui.is_active = true
                 GROUP BY ui.identifier, ui.is_primary, ui.claimed_at
                 ORDER BY ui.is_primary DESC, ui.claimed_at ASC`,
                [userId]
            );

            return reply.send({
                identifiers: result.rows,
                count: result.rows.length,
                max_allowed: request.user.max_identifiers || 1
            });
        } catch (error) {
            fastify.log.error('Failed to get user identifiers:', error);
            throw error;
        }
    });

    // Claim a new identifier
    fastify.post('/user/identifiers', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        const userId = request.user.id;
        const { identifier } = request.body;

        if (!identifier || !validateIdentifier(identifier)) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Invalid identifier format'
            });
        }

        try {
            // Check if user has reached their identifier limit
            const countResult = await fastify.db.query(
                'SELECT COUNT(*) as count FROM user_identifiers WHERE user_id = $1 AND is_active = true',
                [userId]
            );

            const currentCount = parseInt(countResult.rows[0].count);
            const maxIdentifiers = request.user.max_identifiers || 1;

            if (maxIdentifiers !== -1 && currentCount >= maxIdentifiers) {
                return reply.status(403).send({
                    statusCode: 403,
                    error: 'Limit Exceeded',
                    message: `You can only claim ${maxIdentifiers} identifier(s) on your current plan`,
                    upgrade_url: '/settings/billing'
                });
            }

            // Try to claim the identifier
            const result = await fastify.db.query(
                'SELECT * FROM claim_identifier($1, $2)',
                [userId, identifier]
            );

            const { success, message } = result.rows[0];

            if (!success) {
                return reply.status(409).send({
                    statusCode: 409,
                    error: 'Conflict',
                    message
                });
            }

            fastify.log.info(`User ${userId} claimed identifier: ${identifier}`);

            return reply.status(201).send({
                identifier,
                message,
                claimed_at: new Date().toISOString()
            });
        } catch (error) {
            fastify.log.error('Failed to claim identifier:', error);
            throw error;
        }
    });

    // Release an identifier
    fastify.delete('/user/identifiers/:identifier', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        const userId = request.user.id;
        const { identifier } = request.params;

        try {
            const result = await fastify.db.query(
                'SELECT * FROM release_identifier($1, $2)',
                [userId, identifier]
            );

            const { success, message } = result.rows[0];

            if (!success) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Bad Request',
                    message
                });
            }

            fastify.log.info(`User ${userId} released identifier: ${identifier}`);

            return reply.status(204).send();
        } catch (error) {
            fastify.log.error('Failed to release identifier:', error);
            throw error;
        }
    });

    // Check identifier availability
    fastify.get('/user/identifiers/check/:identifier', async (request, reply) => {
        const { identifier } = request.params;
        const userId = request.user?.id;

        if (!validateIdentifier(identifier)) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Invalid identifier format'
            });
        }

        try {
            const result = await fastify.db.query(
                'SELECT * FROM check_identifier_availability($1, $2)',
                [identifier, userId]
            );

            const availability = result.rows[0];

            return reply.send({
                identifier,
                is_available: availability.is_available,
                owner_id: availability.owner_id,
                claimed_at: availability.claimed_at
            });
        } catch (error) {
            fastify.log.error('Failed to check identifier availability:', error);
            throw error;
        }
    });

    // Update user profile
    fastify.patch('/user/profile', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        const userId = request.user.id;
        const { username, full_name, metadata } = request.body;

        try {
            const updates = [];
            const values = [];
            let paramCount = 1;

            if (username !== undefined) {
                updates.push(`username = $${paramCount++}`);
                values.push(username);
            }

            if (full_name !== undefined) {
                updates.push(`full_name = $${paramCount++}`);
                values.push(full_name);
            }

            if (metadata !== undefined) {
                updates.push(`metadata = $${paramCount++}`);
                values.push(metadata);
            }

            if (updates.length === 0) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Bad Request',
                    message: 'No valid fields to update'
                });
            }

            updates.push('updated_at = NOW()');
            values.push(userId);

            const query = `
                UPDATE users 
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *`;

            const result = await fastify.db.query(query, values);

            return reply.send(result.rows[0]);
        } catch (error) {
            fastify.log.error('Failed to update user profile:', error);
            throw error;
        }
    });
}

function validateIdentifier(identifier) {
    if (!identifier) return false;
    
    const normalized = identifier.toLowerCase();
    
    if (normalized.length < 2 || normalized.length > 20) {
        return false;
    }
    
    return /^[a-z0-9][a-z0-9-_]*[a-z0-9]$/.test(normalized);
}