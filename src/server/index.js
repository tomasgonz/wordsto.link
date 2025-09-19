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
        PORT: { type: 'number', default: 8080 },
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

        const nodeEnv = (fastify.config?.NODE_ENV || 'development').toLowerCase();
        const isDevelopment = nodeEnv === 'development';

        // Log the environment mode for debugging
        fastify.log.info(`CORS Configuration - NODE_ENV: ${nodeEnv}, isDevelopment: ${isDevelopment}`);

        await fastify.register(cors, {
            origin: (origin, cb) => {
                // Log incoming origin for debugging
                fastify.log.debug(`CORS request from origin: ${origin}`);

                // Allow all origins in development
                if (isDevelopment) {
                    cb(null, true);
                    return;
                }

                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:3001',
                    'http://localhost:8080',
                    'http://127.0.0.1:3000',
                    'http://127.0.0.1:3001',
                    'http://127.0.0.1:8080',
                    'http://0.0.0.0:3000',
                    'http://0.0.0.0:3001',
                    'http://0.0.0.0:8080',
                    'http://100.84.239.89:3000',  // Tailscale IP
                    'http://100.84.239.89:3001',
                    'http://100.84.239.89:8080',
                    'http://ubuntu-server-1-hetzner-fsn1:3000',
                    'http://ubuntu-server-1-hetzner-fsn1:3001',
                    'http://ubuntu-server-1-hetzner-fsn1:8080',
                    'http://10.0.1.2:3000',
                    'http://10.0.1.2:3001',
                    'http://10.0.1.2:8080',
                    'http://138.201.206.113:3000',
                    'http://138.201.206.113:3001',
                    'http://138.201.206.113:8080',
                    'https://138.201.206.113:3000',
                    'https://138.201.206.113:3001',
                    'https://138.201.206.113:8080',
                    'https://wordsto.link',
                    'https://www.wordsto.link'
                ];

                if (!origin || allowedOrigins.includes(origin)) {
                    cb(null, true);
                } else {
                    cb(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With', 'Cache-Control', 'Pragma'],
            exposedHeaders: ['Content-Length', 'Content-Type', 'X-Request-Id'],
            preflightContinue: false,
            optionsSuccessStatus: 204,
            maxAge: 86400 // 24 hours
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
        const configuredHost = server.config.HOST || '::';
        const hostCandidates = configuredHost === '0.0.0.0'
            ? ['::', '0.0.0.0']
            : [configuredHost];

        for (const host of hostCandidates) {
            try {
                const address = await server.listen({
                    port: server.config.PORT,
                    host
                });
                server.log.info({ address, host, port: server.config.PORT }, 'Server running');
                return server;
            } catch (err) {
                if (host !== hostCandidates[hostCandidates.length - 1]) {
                    server.log.warn({ error: err, host }, 'Failed to bind host, retrying with next option');
                    continue;
                }
                server.log.error(err);
                process.exit(1);
            }
        }
    } catch (error) {
        server.log.error(error);
        process.exit(1);
    }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    startServer();
}
