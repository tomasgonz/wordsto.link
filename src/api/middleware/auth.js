import jwt from '@fastify/jwt';
import fastifyAuth from '@fastify/auth';

export async function registerAuth(fastify) {
    await fastify.register(jwt, {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this',
        sign: {
            expiresIn: '7d'
        }
    });

    await fastify.register(fastifyAuth);

    fastify.decorate('authenticate', async function(request, reply) {
        try {
            const token = extractToken(request);
            
            if (!token) {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Authentication token required'
                });
            }

            const decoded = await request.jwtVerify();
            
            const userResult = await fastify.db.query(
                `SELECT 
                    u.*,
                    sp.name as plan_name,
                    sp.max_urls,
                    sp.max_clicks_per_month,
                    sp.features
                 FROM users u
                 LEFT JOIN subscription_plans sp ON u.subscription_tier = sp.name
                 WHERE u.id = $1`,
                [decoded.id || decoded.sub]
            );

            if (userResult.rows.length === 0) {
                if (decoded.clerk_user_id) {
                    const newUser = await createUserFromClerk(fastify.db, decoded);
                    request.user = newUser;
                } else {
                    return reply.status(401).send({
                        statusCode: 401,
                        error: 'Unauthorized',
                        message: 'User not found'
                    });
                }
            } else {
                request.user = userResult.rows[0];
            }

            await fastify.db.query(
                'UPDATE users SET last_login_at = NOW() WHERE id = $1',
                [request.user.id]
            );

        } catch (err) {
            if (err.name === 'JsonWebTokenError') {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Invalid token'
                });
            }
            
            if (err.name === 'TokenExpiredError') {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Token expired'
                });
            }
            
            throw err;
        }
    });

    fastify.decorate('requirePlan', function(allowedPlans) {
        return async function(request, reply) {
            if (!request.user) {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Authentication required'
                });
            }

            if (!allowedPlans.includes(request.user.subscription_tier)) {
                return reply.status(403).send({
                    statusCode: 403,
                    error: 'Forbidden',
                    message: `This feature requires one of the following plans: ${allowedPlans.join(', ')}`,
                    current_plan: request.user.subscription_tier,
                    required_plans: allowedPlans
                });
            }
        };
    });

    fastify.decorate('optionalAuth', async function(request, reply) {
        try {
            const token = extractToken(request);
            
            if (!token) {
                request.user = null;
                return;
            }

            await fastify.authenticate(request, reply);
        } catch (err) {
            request.user = null;
        }
    });

    fastify.decorate('apiKeyAuth', async function(request, reply) {
        const apiKey = request.headers['x-api-key'];
        
        if (!apiKey) {
            return reply.status(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'API key required'
            });
        }

        try {
            const hashedKey = await hashApiKey(apiKey);
            
            const result = await fastify.db.query(
                `SELECT 
                    ak.*,
                    u.id as user_id,
                    u.email,
                    u.subscription_tier
                 FROM api_keys ak
                 JOIN users u ON ak.user_id = u.id
                 WHERE ak.key_hash = $1 
                   AND ak.is_active = true
                   AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
                [hashedKey]
            );

            if (result.rows.length === 0) {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Invalid or expired API key'
                });
            }

            const apiKeyData = result.rows[0];

            const rateLimitKey = `api_rate:${apiKeyData.id}`;
            const { allowed, remaining, resetIn } = await fastify.cache.rateLimit(
                rateLimitKey,
                apiKeyData.rate_limit,
                3600
            );

            if (!allowed) {
                return reply.status(429).send({
                    statusCode: 429,
                    error: 'Too Many Requests',
                    message: 'API rate limit exceeded',
                    limit: apiKeyData.rate_limit,
                    remaining: 0,
                    reset_in: resetIn
                });
            }

            reply.header('X-RateLimit-Limit', apiKeyData.rate_limit);
            reply.header('X-RateLimit-Remaining', remaining);
            reply.header('X-RateLimit-Reset', Date.now() + (resetIn * 1000));

            await fastify.db.query(
                'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
                [apiKeyData.id]
            );

            request.user = {
                id: apiKeyData.user_id,
                email: apiKeyData.email,
                subscription_tier: apiKeyData.subscription_tier,
                api_key_id: apiKeyData.id,
                api_key_permissions: apiKeyData.permissions
            };

        } catch (err) {
            fastify.log.error('API key authentication error:', err);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Authentication failed'
            });
        }
    });

    fastify.decorate('verifyPermission', function(permission) {
        return async function(request, reply) {
            if (!request.user) {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Authentication required'
                });
            }

            if (request.user.api_key_permissions) {
                const hasPermission = request.user.api_key_permissions[permission] === true;
                
                if (!hasPermission) {
                    return reply.status(403).send({
                        statusCode: 403,
                        error: 'Forbidden',
                        message: `API key does not have '${permission}' permission`,
                        required_permission: permission
                    });
                }
            }
        };
    });
}

function extractToken(request) {
    const authHeader = request.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    
    if (request.cookies && request.cookies.token) {
        return request.cookies.token;
    }
    
    if (request.query && request.query.token) {
        return request.query.token;
    }
    
    return null;
}

async function createUserFromClerk(db, clerkData) {
    const result = await db.query(
        `INSERT INTO users (
            clerk_user_id,
            email,
            username,
            full_name,
            avatar_url,
            subscription_tier
        ) VALUES ($1, $2, $3, $4, $5, 'free')
        ON CONFLICT (clerk_user_id) 
        DO UPDATE SET
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            avatar_url = EXCLUDED.avatar_url,
            last_login_at = NOW()
        RETURNING *`,
        [
            clerkData.clerk_user_id || clerkData.sub,
            clerkData.email,
            clerkData.username || clerkData.email.split('@')[0],
            clerkData.name || clerkData.full_name,
            clerkData.picture || clerkData.avatar_url
        ]
    );

    return result.rows[0];
}

async function hashApiKey(apiKey) {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}