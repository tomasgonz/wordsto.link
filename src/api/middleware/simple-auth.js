export async function registerSimpleAuth(fastify) {
    // Add a simple authenticate decorator that doesn't do anything for now
    fastify.decorate('authenticate', async function(request, reply) {
        // For now, just pass through without authentication
        // This allows the routes to work while we fix the auth system
        request.user = {
            id: 'demo-user',
            email: 'demo@wordsto.link',
            subscription_tier: 'free'
        };
    });

    // Add other decorators that routes might need
    fastify.decorate('requirePlan', function(allowedPlans) {
        return async function(request, reply) {
            // For now, just pass through
            return;
        };
    });

    fastify.decorate('optionalAuth', async function(request, reply) {
        // For now, just set a demo user
        request.user = {
            id: 'demo-user',
            email: 'demo@wordsto.link',
            subscription_tier: 'free'
        };
    });

    fastify.decorate('apiKeyAuth', async function(request, reply) {
        // For now, just pass through
        request.user = {
            id: 'demo-user',
            email: 'demo@wordsto.link',
            subscription_tier: 'free'
        };
    });

    fastify.decorate('verifyPermission', function(permission) {
        return async function(request, reply) {
            // For now, just pass through
            return;
        };
    });
}