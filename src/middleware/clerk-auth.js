import pkg from '@clerk/backend';
const { Clerk } = pkg;

const clerkClient = new Clerk({
    secretKey: process.env.CLERK_SECRET_KEY
});

export async function clerkAuthPlugin(fastify, opts) {
    fastify.decorate('clerkClient', clerkClient);
    
    fastify.decorate('authenticate', async function (request, reply) {
        try {
            const authHeader = request.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Missing authentication token'
                });
            }

            const token = authHeader.substring(7);
            
            let sessionClaims;
            try {
                sessionClaims = await clerkClient.verifyToken(token);
            } catch (err) {
                fastify.log.error('Token verification failed:', err);
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Invalid authentication token'
                });
            }

            const userId = sessionClaims.sub;
            
            let user = await fastify.db.getUserByClerkId(userId);
            
            if (!user) {
                const clerkUser = await clerkClient.users.getUser(userId);
                
                user = await fastify.db.createUser({
                    clerk_user_id: userId,
                    email: clerkUser.emailAddresses[0]?.emailAddress,
                    username: clerkUser.username || clerkUser.emailAddresses[0]?.emailAddress.split('@')[0],
                    full_name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim(),
                    avatar_url: clerkUser.imageUrl
                });
                
                fastify.log.info('Created new user from Clerk:', user.id);
            }

            const subscriptionInfo = await fastify.db.query(
                `SELECT 
                    u.*,
                    sp.max_urls,
                    sp.max_clicks_per_month,
                    sp.max_custom_domains,
                    sp.features,
                    (SELECT array_agg(identifier) FROM user_identifiers WHERE user_id = u.id) as identifiers
                 FROM users u
                 LEFT JOIN subscription_plans sp ON u.subscription_tier = sp.name
                 WHERE u.id = $1`,
                [user.id]
            );

            request.user = {
                ...subscriptionInfo.rows[0],
                clerk_user_id: userId,
                session_claims: sessionClaims
            };

        } catch (error) {
            fastify.log.error('Authentication error:', error);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Authentication failed'
            });
        }
    });

    fastify.decorate('optionalAuth', async function (request, reply) {
        const authHeader = request.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            request.user = null;
            return;
        }

        try {
            await fastify.authenticate(request, reply);
        } catch (err) {
            request.user = null;
        }
    });

    fastify.decorate('requireIdentifierOwnership', async function (request, reply) {
        const { identifier } = request.body || request.params;
        
        if (!identifier) {
            return;
        }

        if (!request.user) {
            return reply.status(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Authentication required'
            });
        }

        const ownershipResult = await fastify.db.query(
            `SELECT user_id FROM user_identifiers WHERE identifier = $1`,
            [identifier]
        );

        if (ownershipResult.rows.length === 0) {
            const claimResult = await fastify.db.query(
                `INSERT INTO user_identifiers (user_id, identifier, is_primary, claimed_at) 
                 VALUES ($1, $2, false, NOW())
                 ON CONFLICT (identifier) DO NOTHING
                 RETURNING id`,
                [request.user.id, identifier]
            );

            if (claimResult.rows.length > 0) {
                fastify.log.info(`User ${request.user.id} claimed identifier: ${identifier}`);
                request.identifierClaimed = true;
                return;
            }

            const owner = ownershipResult.rows[0];
            if (owner.user_id !== request.user.id) {
                return reply.status(403).send({
                    statusCode: 403,
                    error: 'Forbidden',
                    message: `The identifier "${identifier}" is already claimed by another user`
                });
            }
        } else {
            const owner = ownershipResult.rows[0];
            if (owner.user_id !== request.user.id) {
                return reply.status(403).send({
                    statusCode: 403,
                    error: 'Forbidden',
                    message: `You don't have permission to use the identifier "${identifier}"`
                });
            }
        }
    });

    fastify.decorate('requirePlan', function (allowedPlans) {
        return async function (request, reply) {
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
                    required_plans: allowedPlans,
                    upgrade_url: '/settings/billing'
                });
            }
        };
    });

    fastify.decorate('checkUrlLimit', async function (request, reply) {
        if (!request.user) {
            return reply.status(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Authentication required'
            });
        }

        const result = await fastify.db.query(
            `SELECT 
                COUNT(*) as current_urls,
                $2 as max_urls
             FROM shortened_urls 
             WHERE user_id = $1 AND is_active = true`,
            [request.user.id, request.user.max_urls]
        );

        const { current_urls, max_urls } = result.rows[0];

        if (max_urls !== -1 && parseInt(current_urls) >= max_urls) {
            return reply.status(403).send({
                statusCode: 403,
                error: 'Limit Exceeded',
                message: `You've reached your limit of ${max_urls} URLs. Please upgrade your plan or delete unused URLs.`,
                current_count: parseInt(current_urls),
                limit: max_urls,
                upgrade_url: '/settings/billing'
            });
        }

        request.urlUsage = {
            current: parseInt(current_urls),
            limit: max_urls,
            remaining: max_urls === -1 ? 'unlimited' : max_urls - parseInt(current_urls)
        };
    });

    fastify.decorate('webhookAuth', async function (request, reply) {
        const svixId = request.headers['svix-id'];
        const svixTimestamp = request.headers['svix-timestamp'];
        const svixSignature = request.headers['svix-signature'];

        if (!svixId || !svixTimestamp || !svixSignature) {
            return reply.status(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Missing webhook headers'
            });
        }

        try {
            const crypto = await import('crypto');
            const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
            
            const signedContent = `${svixId}.${svixTimestamp}.${JSON.stringify(request.body)}`;
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret.split('_')[1])
                .update(signedContent)
                .digest('base64');

            const signatures = svixSignature.split(' ');
            const valid = signatures.some(sig => {
                const [version, signature] = sig.split('=');
                return version === 'v1' && signature === expectedSignature;
            });

            if (!valid) {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Invalid webhook signature'
                });
            }
        } catch (error) {
            fastify.log.error('Webhook verification error:', error);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Webhook verification failed'
            });
        }
    });
}

export async function registerClerkWebhooks(fastify) {
    fastify.post('/api/webhooks/clerk', {
        preHandler: fastify.webhookAuth
    }, async (request, reply) => {
        const { type, data } = request.body;

        try {
            switch (type) {
                case 'user.created':
                    await handleUserCreated(fastify, data);
                    break;
                case 'user.updated':
                    await handleUserUpdated(fastify, data);
                    break;
                case 'user.deleted':
                    await handleUserDeleted(fastify, data);
                    break;
                case 'session.created':
                    await handleSessionCreated(fastify, data);
                    break;
                default:
                    fastify.log.info(`Unhandled webhook type: ${type}`);
            }

            return reply.send({ received: true });
        } catch (error) {
            fastify.log.error('Webhook processing error:', error);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Failed to process webhook'
            });
        }
    });
}

async function handleUserCreated(fastify, data) {
    const user = await fastify.db.createUser({
        clerk_user_id: data.id,
        email: data.email_addresses[0]?.email_address,
        username: data.username || data.email_addresses[0]?.email_address.split('@')[0],
        full_name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
        avatar_url: data.image_url
    });

    fastify.log.info('User created via webhook:', user.id);
}

async function handleUserUpdated(fastify, data) {
    await fastify.db.query(
        `UPDATE users 
         SET email = $2, username = $3, full_name = $4, avatar_url = $5, updated_at = NOW()
         WHERE clerk_user_id = $1`,
        [
            data.id,
            data.email_addresses[0]?.email_address,
            data.username,
            `${data.first_name || ''} ${data.last_name || ''}`.trim(),
            data.image_url
        ]
    );

    fastify.log.info('User updated via webhook:', data.id);
}

async function handleUserDeleted(fastify, data) {
    await fastify.db.query(
        `UPDATE users SET is_active = false, deleted_at = NOW() WHERE clerk_user_id = $1`,
        [data.id]
    );

    fastify.log.info('User deleted via webhook:', data.id);
}

async function handleSessionCreated(fastify, data) {
    await fastify.db.query(
        `UPDATE users SET last_login_at = NOW() WHERE clerk_user_id = $1`,
        [data.user_id]
    );
}