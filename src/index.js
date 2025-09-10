import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import env from '@fastify/env';
import postgres from '@fastify/postgres';
import redis from '@fastify/redis';
import { config } from './config/index.js';
import { redirectRouter } from './routes/redirect.js';
import { apiRouter } from './routes/api.js';
import { authRouter } from './routes/auth.js';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
});

const schema = {
  type: 'object',
  required: ['PORT', 'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'],
  properties: {
    PORT: { type: 'number', default: 3000 },
    HOST: { type: 'string', default: '0.0.0.0' },
    DATABASE_URL: { type: 'string' },
    REDIS_URL: { type: 'string' },
    JWT_SECRET: { type: 'string' },
    NODE_ENV: { type: 'string', default: 'development' },
    RATE_LIMIT_MAX: { type: 'number', default: 100 },
    RATE_LIMIT_TIME_WINDOW: { type: 'number', default: 60000 }
  }
};

async function start() {
  try {
    await fastify.register(env, {
      schema,
      dotenv: true
    });

    await fastify.register(cors, {
      origin: true,
      credentials: true
    });

    await fastify.register(helmet, {
      contentSecurityPolicy: false
    });

    await fastify.register(rateLimit, {
      max: fastify.config.RATE_LIMIT_MAX,
      timeWindow: fastify.config.RATE_LIMIT_TIME_WINDOW
    });

    await fastify.register(postgres, {
      connectionString: fastify.config.DATABASE_URL
    });

    await fastify.register(redis, {
      url: fastify.config.REDIS_URL,
      closeClient: true
    });

    fastify.register(authRouter, { prefix: '/api/auth' });
    fastify.register(apiRouter, { prefix: '/api' });
    fastify.register(redirectRouter);

    fastify.get('/health', async (request, reply) => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    await fastify.listen({ 
      port: fastify.config.PORT, 
      host: fastify.config.HOST 
    });

    console.log(`Server running at http://${fastify.config.HOST}:${fastify.config.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();