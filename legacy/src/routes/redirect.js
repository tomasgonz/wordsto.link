import { nanoid } from 'nanoid';

export async function redirectRouter(fastify, opts) {
  fastify.get('/:keyword', async (request, reply) => {
    const { keyword } = request.params;
    
    const cacheKey = `link:${keyword}`;
    const cached = await fastify.redis.get(cacheKey);
    
    if (cached) {
      await trackClick(fastify, JSON.parse(cached).id);
      return reply.redirect(301, JSON.parse(cached).url);
    }

    const result = await fastify.pg.query(
      'SELECT id, original_url FROM shortened_urls WHERE keywords @> ARRAY[$1]::text[] AND identifier IS NULL AND is_active = true',
      [keyword]
    );

    if (result.rows.length > 0) {
      const link = result.rows[0];
      await fastify.redis.setex(cacheKey, 300, JSON.stringify({ id: link.id, url: link.original_url }));
      await trackClick(fastify, link.id);
      return reply.redirect(301, link.original_url);
    }

    return reply.code(404).send({ error: 'Link not found' });
  });

  fastify.get('/:identifier/:keyword', async (request, reply) => {
    const { identifier, keyword } = request.params;
    
    const cacheKey = `link:${identifier}:${keyword}`;
    const cached = await fastify.redis.get(cacheKey);
    
    if (cached) {
      await trackClick(fastify, JSON.parse(cached).id);
      return reply.redirect(301, JSON.parse(cached).url);
    }

    const result = await fastify.pg.query(
      'SELECT id, original_url FROM shortened_urls WHERE identifier = $1 AND keywords @> ARRAY[$2]::text[] AND is_active = true',
      [identifier, keyword]
    );

    if (result.rows.length > 0) {
      const link = result.rows[0];
      await fastify.redis.setex(cacheKey, 300, JSON.stringify({ id: link.id, url: link.original_url }));
      await trackClick(fastify, link.id);
      return reply.redirect(301, link.original_url);
    }

    return reply.code(404).send({ error: 'Link not found' });
  });

  fastify.get('/:identifier/:keyword1/:keyword2', handleMultiKeyword);
  fastify.get('/:identifier/:keyword1/:keyword2/:keyword3', handleMultiKeyword);
  fastify.get('/:identifier/:keyword1/:keyword2/:keyword3/:keyword4', handleMultiKeyword);
  fastify.get('/:identifier/:keyword1/:keyword2/:keyword3/:keyword4/:keyword5', handleMultiKeyword);

  async function handleMultiKeyword(request, reply) {
    const params = Object.values(request.params);
    const identifier = params[0];
    const keywords = params.slice(1).filter(Boolean);
    
    const cacheKey = `link:${identifier}:${keywords.join(':')}`;
    const cached = await fastify.redis.get(cacheKey);
    
    if (cached) {
      await trackClick(fastify, JSON.parse(cached).id);
      return reply.redirect(301, JSON.parse(cached).url);
    }

    const result = await fastify.pg.query(
      'SELECT id, original_url FROM shortened_urls WHERE identifier = $1 AND keywords @> $2::text[] AND is_active = true',
      [identifier, keywords]
    );

    if (result.rows.length > 0) {
      const link = result.rows[0];
      await fastify.redis.setex(cacheKey, 300, JSON.stringify({ id: link.id, url: link.original_url }));
      await trackClick(fastify, link.id);
      return reply.redirect(301, link.original_url);
    }

    return reply.code(404).send({ error: 'Link not found' });
  }

  async function trackClick(fastify, linkId) {
    try {
      await fastify.pg.query(
        'UPDATE shortened_urls SET click_count = click_count + 1, last_clicked_at = NOW() WHERE id = $1',
        [linkId]
      );
      
      await fastify.pg.query(
        'INSERT INTO analytics_events (shortened_url_id, clicked_at, visitor_id) VALUES ($1, NOW(), gen_random_uuid())',
        [linkId]
      );
    } catch (err) {
      fastify.log.error('Error tracking click:', err);
    }
  }
}

