import { nanoid } from 'nanoid';

export async function apiRouter(fastify, opts) {
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  fastify.get('/links', async (request, reply) => {
    const userId = request.user.id;
    
    const result = await fastify.pg.query(
      'SELECT * FROM links WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    return { links: result.rows };
  });

  fastify.post('/links', async (request, reply) => {
    const userId = request.user.id;
    const { identifier, keywords, destination_url, title, description } = request.body;
    
    const userResult = await fastify.pg.query(
      'SELECT subscription_tier FROM users WHERE id = $1',
      [userId]
    );
    
    const tier = userResult.rows[0].subscription_tier;
    const maxKeywords = fastify.config.subscriptions[tier].maxKeywords;
    
    const linkCountResult = await fastify.pg.query(
      'SELECT COUNT(*) FROM links WHERE user_id = $1',
      [userId]
    );
    
    if (parseInt(linkCountResult.rows[0].count) >= maxKeywords) {
      return reply.code(403).send({ 
        error: `You have reached your limit of ${maxKeywords} links. Please upgrade your plan.` 
      });
    }
    
    try {
      const result = await fastify.pg.query(
        `INSERT INTO links (user_id, identifier, keywords, destination_url, title, description) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [userId, identifier, keywords, destination_url, title, description]
      );
      
      const cacheKeys = [];
      if (identifier) {
        keywords.forEach(keyword => {
          cacheKeys.push(`link:${identifier}:${keyword}`);
        });
        if (keywords.length > 1) {
          cacheKeys.push(`link:${identifier}:${keywords.join(':')}`);
        }
      } else {
        keywords.forEach(keyword => {
          cacheKeys.push(`link:${keyword}`);
        });
      }
      
      for (const key of cacheKeys) {
        await fastify.redis.del(key);
      }
      
      return { link: result.rows[0] };
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ 
          error: 'This identifier and keyword combination already exists' 
        });
      }
      throw err;
    }
  });

  fastify.put('/links/:id', async (request, reply) => {
    const userId = request.user.id;
    const linkId = request.params.id;
    const { keywords, destination_url, title, description, active } = request.body;
    
    const checkResult = await fastify.pg.query(
      'SELECT * FROM links WHERE id = $1 AND user_id = $2',
      [linkId, userId]
    );
    
    if (checkResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Link not found' });
    }
    
    const oldLink = checkResult.rows[0];
    
    const result = await fastify.pg.query(
      `UPDATE links 
       SET keywords = $1, destination_url = $2, title = $3, description = $4, active = $5, updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [keywords, destination_url, title, description, active, linkId, userId]
    );
    
    const cacheKeys = [];
    if (oldLink.identifier) {
      oldLink.keywords.forEach(keyword => {
        cacheKeys.push(`link:${oldLink.identifier}:${keyword}`);
      });
      keywords.forEach(keyword => {
        cacheKeys.push(`link:${oldLink.identifier}:${keyword}`);
      });
    } else {
      oldLink.keywords.concat(keywords).forEach(keyword => {
        cacheKeys.push(`link:${keyword}`);
      });
    }
    
    for (const key of cacheKeys) {
      await fastify.redis.del(key);
    }
    
    return { link: result.rows[0] };
  });

  fastify.delete('/links/:id', async (request, reply) => {
    const userId = request.user.id;
    const linkId = request.params.id;
    
    const checkResult = await fastify.pg.query(
      'SELECT * FROM links WHERE id = $1 AND user_id = $2',
      [linkId, userId]
    );
    
    if (checkResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Link not found' });
    }
    
    const link = checkResult.rows[0];
    
    await fastify.pg.query(
      'DELETE FROM links WHERE id = $1 AND user_id = $2',
      [linkId, userId]
    );
    
    const cacheKeys = [];
    if (link.identifier) {
      link.keywords.forEach(keyword => {
        cacheKeys.push(`link:${link.identifier}:${keyword}`);
      });
    } else {
      link.keywords.forEach(keyword => {
        cacheKeys.push(`link:${keyword}`);
      });
    }
    
    for (const key of cacheKeys) {
      await fastify.redis.del(key);
    }
    
    return { message: 'Link deleted successfully' };
  });

  fastify.get('/analytics/:id', async (request, reply) => {
    const userId = request.user.id;
    const linkId = request.params.id;
    
    const linkResult = await fastify.pg.query(
      'SELECT * FROM links WHERE id = $1 AND user_id = $2',
      [linkId, userId]
    );
    
    if (linkResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Link not found' });
    }
    
    const analyticsResult = await fastify.pg.query(
      `SELECT 
        DATE(clicked_at) as date,
        COUNT(*) as clicks,
        COUNT(DISTINCT ip_address) as unique_visitors
       FROM click_analytics 
       WHERE link_id = $1 
       GROUP BY DATE(clicked_at)
       ORDER BY date DESC
       LIMIT 30`,
      [linkId]
    );
    
    return { 
      link: linkResult.rows[0],
      analytics: analyticsResult.rows 
    };
  });
}

