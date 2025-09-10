import { registerAuth } from '../api/middleware/auth.js';
import { shortenRoutes } from './routes/shorten.js';
import { urlsRoutes } from './routes/urls.js';
import { analyticsRoutes } from './routes/analytics.js';
import { userRoutes } from './routes/user.js';
import { authRoutes } from './routes/auth.js';

export async function registerApiRoutes(fastify, opts) {
    // Register authentication middleware first
    await registerAuth(fastify);

    fastify.setErrorHandler((error, request, reply) => {
        request.log.error(error);

        if (error.validation) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Validation error',
                details: error.validation
            });
        }

        if (error.name === 'ZodError') {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: 'Invalid request data',
                issues: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }))
            });
        }

        if (error.statusCode === 429) {
            return reply.status(429).send({
                statusCode: 429,
                error: 'Too Many Requests',
                message: error.message || 'Rate limit exceeded'
            });
        }

        if (error.code === '23505') {
            return reply.status(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'Resource already exists'
            });
        }

        if (error.code === '23503') {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Invalid reference to related resource'
            });
        }

        if (error.code === '22P02') {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Invalid input syntax'
            });
        }

        const statusCode = error.statusCode || 500;
        const message = statusCode === 500 
            ? 'An unexpected error occurred' 
            : error.message;

        reply.status(statusCode).send({
            statusCode,
            error: error.name || 'Error',
            message,
            ...(process.env.NODE_ENV === 'development' && {
                stack: error.stack,
                details: error
            })
        });
    });

    fastify.addHook('onRequest', async (request, reply) => {
        request.startTime = Date.now();
        
        request.log.info({
            method: request.method,
            url: request.url,
            ip: request.ip,
            userAgent: request.headers['user-agent']
        });
    });

    fastify.addHook('onResponse', async (request, reply) => {
        const responseTime = Date.now() - request.startTime;
        
        request.log.info({
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTime,
            userId: request.user?.id
        });
    });

    fastify.addHook('preHandler', async (request, reply) => {
        reply.header('X-Response-Time', Date.now() - request.startTime);
        reply.header('X-Request-Id', request.id);
    });

    await fastify.register(authRoutes);
    await fastify.register(shortenRoutes);
    await fastify.register(urlsRoutes);
    await fastify.register(analyticsRoutes);
    await fastify.register(userRoutes);

    fastify.get('/health', async (request, reply) => {
        const checks = {
            api: true,
            database: false,
            redis: false
        };

        try {
            await fastify.db.query('SELECT 1');
            checks.database = true;
        } catch (error) {
            fastify.log.error('Database health check failed:', error);
        }

        try {
            const redisHealth = await fastify.cache.healthCheck();
            checks.redis = redisHealth.healthy;
        } catch (error) {
            fastify.log.error('Redis health check failed:', error);
        }

        const healthy = Object.values(checks).every(v => v === true);
        
        return reply.status(healthy ? 200 : 503).send({
            status: healthy ? 'healthy' : 'unhealthy',
            checks,
            timestamp: new Date().toISOString()
        });
    });

    fastify.get('/status', async (request, reply) => {
        const memUsage = process.memoryUsage();
        
        return {
            status: 'operational',
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            memory: {
                used: Math.round(memUsage.heapUsed / 1024 / 1024),
                total: Math.round(memUsage.heapTotal / 1024 / 1024),
                unit: 'MB'
            },
            timestamp: new Date().toISOString()
        };
    });

    fastify.post('/auth/verify', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        return {
            valid: true,
            user: {
                id: request.user.id,
                email: request.user.email,
                subscription_tier: request.user.subscription_tier,
                features: request.user.features
            }
        };
    });
}