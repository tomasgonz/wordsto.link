import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { db } from '../db/connection.js';
import { RedisCache } from '../services/redis-cache.js';

dotenv.config();

const fastify = Fastify({
    logger: true
});

// CORS
await fastify.register(cors, {
    origin: true,
    credentials: true
});

// Connect to database
await db.connect();
fastify.decorate('db', db);

// Connect to Redis
const redis = new RedisCache(process.env.REDIS_URL);
await redis.connect();
fastify.decorate('cache', redis);

// Health check
fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

// Test redirect
fastify.get('/:keyword', async (request, reply) => {
    const { keyword } = request.params;
    
    // Look up in database
    const result = await fastify.db.query(
        `SELECT * FROM shortened_urls WHERE keywords @> $1::text[] AND is_active = true LIMIT 1`,
        [[keyword]]
    );
    
    if (result.rows.length > 0) {
        const url = result.rows[0];
        
        // Update click count
        await fastify.db.query(
            `UPDATE shortened_urls SET click_count = click_count + 1 WHERE id = $1`,
            [url.id]
        );
        
        return reply.redirect(302, url.original_url);
    }
    
    return reply.status(404).send({ error: 'URL not found' });
});

// Start server
try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running on http://0.0.0.0:3000');
} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}