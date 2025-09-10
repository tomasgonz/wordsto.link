import Fastify from 'fastify';
import { jest } from '@jest/globals';
import redirectHandler from '../../src/server/routes/redirect-handler.js';

const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn()
};

describe('E2E Redirect Flow', () => {
  let app;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    
    app.decorate('db', mockDb);
    app.decorate('redis', mockRedis);
    
    await app.register(redirectHandler);
    
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Single keyword redirects', () => {
    test('redirects to destination URL', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 'user_123',
          original_url: 'https://github.com/example',
          click_count: 10
        }]
      });

      const response = await app.inject({
        method: 'GET',
        url: '/github',
        headers: {
          'user-agent': 'Mozilla/5.0',
          'x-forwarded-for': '192.168.1.1'
        }
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://github.com/example');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('keywords @> $1'),
        [['github']]
      );
    });

    test('caches redirect data in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 'user_123',
          original_url: 'https://example.com',
          click_count: 0
        }]
      });

      await app.inject({
        method: 'GET',
        url: '/test'
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'url:keywords:test',
        expect.stringContaining('https://example.com'),
        'EX',
        3600
      );
    });

    test('uses cached data when available', async () => {
      const cachedData = JSON.stringify({
        url_id: 1,
        user_id: 'user_123',
        destination: 'https://cached.com'
      });
      
      mockRedis.get.mockResolvedValue(cachedData);

      const response = await app.inject({
        method: 'GET',
        url: '/cached'
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://cached.com');
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('returns 404 for non-existent URL', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent'
      });

      expect(response.statusCode).toBe(404);
      expect(response.payload).toContain('not found');
    });
  });

  describe('Identifier + keyword redirects', () => {
    test('redirects with identifier pattern', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 2,
          user_id: 'user_456',
          original_url: 'https://portfolio.com',
          click_count: 25
        }]
      });

      const response = await app.inject({
        method: 'GET',
        url: '/john/portfolio'
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://portfolio.com');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('identifier = $1 AND keywords @> $2'),
        ['john', ['portfolio']]
      );
    });

    test('caches identifier pattern correctly', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 3,
          user_id: 'user_789',
          original_url: 'https://example.com/doc',
          click_count: 0
        }]
      });

      await app.inject({
        method: 'GET',
        url: '/company/docs'
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'url:identifier:company:keywords:docs',
        expect.any(String),
        'EX',
        3600
      );
    });
  });

  describe('Multiple keywords redirects', () => {
    test('redirects with multiple keywords', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 4,
          user_id: 'user_111',
          original_url: 'https://docs.example.com/api/v2',
          click_count: 100
        }]
      });

      const response = await app.inject({
        method: 'GET',
        url: '/docs/api/v2'
      });

      expect(response.statusCode).toBe(302);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('keywords @> $1'),
        [['docs', 'api', 'v2']]
      );
    });

    test('handles identifier with multiple keywords', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 5,
          user_id: 'user_222',
          original_url: 'https://product.launch/2024',
          click_count: 50
        }]
      });

      const response = await app.inject({
        method: 'GET',
        url: '/company/product/launch/2024'
      });

      expect(response.statusCode).toBe(302);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('identifier = $1 AND keywords @> $2'),
        ['company', ['product', 'launch', '2024']]
      );
    });
  });

  describe('Analytics tracking', () => {
    test('increments click count', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 6,
            user_id: 'user_333',
            original_url: 'https://track.me',
            click_count: 5
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      await app.inject({
        method: 'GET',
        url: '/track'
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE shortened_urls SET click_count'),
        [6]
      );
    });

    test('tracks analytics event', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 7,
            user_id: 'user_444',
            original_url: 'https://analytics.test',
            click_count: 0
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      await app.inject({
        method: 'GET',
        url: '/analytics',
        headers: {
          'user-agent': 'Chrome/91.0',
          'x-forwarded-for': '10.0.0.1',
          'referer': 'https://google.com'
        }
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics_events'),
        expect.arrayContaining([
          7,
          expect.any(String),
          '10.0.0.1',
          'Chrome',
          expect.any(String)
        ])
      );
    });

    test('tracks unique visitors', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);
      
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 8,
            user_id: 'user_555',
            original_url: 'https://unique.test',
            click_count: 10
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      await app.inject({
        method: 'GET',
        url: '/unique',
        headers: {
          'x-forwarded-for': '192.168.1.100'
        }
      });

      expect(mockRedis.incr).toHaveBeenCalledWith(
        expect.stringContaining('visitor:')
      );
      expect(mockRedis.expire).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    test('handles database errors gracefully', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDb.query.mockRejectedValue(new Error('Database connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/error'
      });

      expect(response.statusCode).toBe(500);
      expect(response.payload).toContain('error');
    });

    test('handles Redis errors and falls back to database', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 9,
          user_id: 'user_666',
          original_url: 'https://fallback.test',
          click_count: 0
        }]
      });

      const response = await app.inject({
        method: 'GET',
        url: '/fallback'
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://fallback.test');
    });

    test('validates URL format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/../etc/passwd'
      });

      expect(response.statusCode).toBe(400);
    });

    test('handles special characters in keywords', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/test%20space'
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        [['test space']]
      );
    });
  });

  describe('Bot detection', () => {
    test('identifies bot traffic', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 10,
            user_id: 'user_777',
            original_url: 'https://bot.test',
            click_count: 0
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      await app.inject({
        method: 'GET',
        url: '/bot',
        headers: {
          'user-agent': 'Googlebot/2.1'
        }
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics_events'),
        expect.arrayContaining([
          expect.any(Number),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          true
        ])
      );
    });
  });
});