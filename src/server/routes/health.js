export async function healthRoutes(fastify, opts) {
    fastify.get('/', async (request, reply) => {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development'
        };
    });

    fastify.get('/live', async (request, reply) => {
        return { status: 'ok' };
    });

    fastify.get('/ready', async (request, reply) => {
        const checks = {
            database: false,
            redis: false
        };
        
        try {
            const dbResult = await fastify.db.query('SELECT 1');
            checks.database = dbResult.rows.length === 1;
        } catch (error) {
            fastify.log.error('Database health check failed:', error);
        }
        
        try {
            const redisHealth = await fastify.cache.healthCheck();
            checks.redis = redisHealth.healthy;
        } catch (error) {
            fastify.log.error('Redis health check failed:', error);
        }
        
        const allHealthy = Object.values(checks).every(v => v === true);
        
        if (!allHealthy) {
            reply.code(503);
        }
        
        return {
            status: allHealthy ? 'ready' : 'not ready',
            checks,
            timestamp: new Date().toISOString()
        };
    });

    fastify.get('/metrics', async (request, reply) => {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        let dbStats = null;
        let redisStats = null;
        let analyticsQueueSize = 0;
        
        try {
            const dbResult = await fastify.db.query(`
                SELECT 
                    (SELECT COUNT(*) FROM shortened_urls) as total_urls,
                    (SELECT COUNT(*) FROM shortened_urls WHERE is_active = true) as active_urls,
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM analytics_events WHERE clicked_at > NOW() - INTERVAL '1 hour') as recent_clicks
            `);
            dbStats = dbResult.rows[0];
        } catch (error) {
            fastify.log.error('Failed to get DB stats:', error);
        }
        
        try {
            redisStats = await fastify.cache.healthCheck();
        } catch (error) {
            fastify.log.error('Failed to get Redis stats:', error);
        }
        
        try {
            analyticsQueueSize = fastify.analytics.getQueueSize();
        } catch (error) {
            fastify.log.error('Failed to get analytics queue size:', error);
        }
        
        return {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024)
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            database: dbStats,
            redis: redisStats,
            analytics: {
                queueSize: analyticsQueueSize
            }
        };
    });
}