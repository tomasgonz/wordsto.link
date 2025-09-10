import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import env from '@fastify/env';
import { config } from '../config/index.js';
import { db } from '../db/connection.js';
import { RedisCache } from '../services/redis-cache.js';
import { AnalyticsTracker } from '../services/analytics-tracker.js';
import { redirectHandler } from './routes/redirect-handler.js';
import { healthRoutes } from './routes/health.js';
import { registerApiRoutes } from '../api/index.js';
import { parseUserAgent, getClientIp } from '../utils/request-utils.js';

const envSchema = {
    type: 'object',
    required: ['DATABASE_URL', 'REDIS_URL'],
    properties: {
        NODE_ENV: { type: 'string', default: 'development' },
        PORT: { type: 'number', default: 3000 },
        HOST: { type: 'string', default: '0.0.0.0' },
        DATABASE_URL: { type: 'string' },
        REDIS_URL: { type: 'string' },
        RATE_LIMIT_MAX: { type: 'number', default: 100 },
        RATE_LIMIT_TIME_WINDOW: { type: 'number', default: 60000 }
    }
};

export async function createServer() {
    const fastify = Fastify({
        logger: {
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
            transport: process.env.NODE_ENV !== 'production' ? {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname'
                }
            } : undefined
        },
        trustProxy: true,
        requestIdLogLabel: 'reqId',
        disableRequestLogging: false,
        bodyLimit: 1048576 // 1MB
    });

    try {
        await fastify.register(env, {
            schema: envSchema,
            dotenv: true
        });

        await fastify.register(cors, {
            origin: (origin, cb) => {
                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:3001',
                    'http://10.0.1.2:3000',
                    'http://10.0.1.2:3001',
                    'http://ubuntu-server-1-hetzner-fsn1:3000',
                    'http://ubuntu-server-1-hetzner-fsn1:3001',
                    'https://wordsto.link',
                    'https://www.wordsto.link'
                ];
                
                if (!origin || allowedOrigins.includes(origin)) {
                    cb(null, true);
                } else if (process.env.NODE_ENV === 'development') {
                    cb(null, true);
                } else {
                    cb(new Error('Not allowed by CORS'));
                }
            },
            credentials: true
        });

        await fastify.register(helmet, {
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false
        });

        await fastify.register(rateLimit, {
            global: true,
            max: fastify.config.RATE_LIMIT_MAX,
            timeWindow: fastify.config.RATE_LIMIT_TIME_WINDOW,
            cache: 10000,
            skipSuccessfulRequests: false,
            keyGenerator: (request) => {
                return request.ip;
            },
            errorResponseBuilder: (request, context) => {
                return {
                    statusCode: 429,
                    error: 'Too Many Requests',
                    message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
                    retryAfter: context.ttl
                };
            }
        });

        // Initialize database connection
        await db.connect();
        fastify.decorate('db', db);

        const redisCache = new RedisCache(fastify.config.REDIS_URL);
        await redisCache.connect();
        fastify.decorate('cache', redisCache);

        const analyticsTracker = new AnalyticsTracker(db, fastify.log);
        fastify.decorate('analytics', analyticsTracker);

        fastify.addHook('onRequest', async (request, reply) => {
            request.startTime = Date.now();
        });

        fastify.addHook('onResponse', async (request, reply) => {
            const responseTime = Date.now() - request.startTime;
            request.log.info({
                method: request.method,
                url: request.url,
                statusCode: reply.statusCode,
                responseTime
            });
        });

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

            if (error.statusCode === 429) {
                return reply.status(429).send(error);
            }

            const statusCode = error.statusCode || 500;
            const message = statusCode === 500 ? 'Internal Server Error' : error.message;

            reply.status(statusCode).send({
                statusCode,
                error: error.name || 'Error',
                message
            });
        });

        fastify.setNotFoundHandler((request, reply) => {
            reply.status(404).send({
                statusCode: 404,
                error: 'Not Found',
                message: 'The requested resource was not found',
                path: request.url
            });
        });

        await fastify.register(healthRoutes, { prefix: '/_health' });
        await fastify.register(registerApiRoutes, { prefix: '/api' });
        
        await fastify.register(redirectHandler);

        fastify.addHook('onClose', async (instance) => {
            await instance.cache.disconnect();
            await instance.db.close();
        });

        return fastify;
    } catch (error) {
        fastify.log.error(error);
        throw error;
    }
}

export async function startServer() {
    const server = await createServer();
    
    try {
        const address = await server.listen({
            port: server.config.PORT,
            host: server.config.HOST
        });
        
        server.log.info(`Server running at ${address}`);
        return server;
    } catch (error) {
        server.log.error(error);
        process.exit(1);
    }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    startServer();
}