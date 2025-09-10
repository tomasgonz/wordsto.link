import Fastify from 'fastify';
import { jest } from '@jest/globals';
import urlRoutes from '../../src/api/routes/urls.js';
import { clerkAuthPlugin } from '../../src/middleware/clerk-auth.js';

const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn()
};

describe('URL API Endpoints', () => {
  let app;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    
    app.decorate('db', mockDb);
    app.decorate('redis', mockRedis);
    
    await app.register(clerkAuthPlugin);
    await app.register(urlRoutes, { prefix: '/api/urls' });
    
    mockDb.query.mockClear();
    mockRedis.get.mockClear();
    mockRedis.set.mockClear();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/urls', () => {
    const validPayload = {
      identifier: 'john',
      keywords: ['portfolio', '2024'],
      destination: 'https://example.com/john-portfolio',
      title: 'John Portfolio 2024',
      description: 'My professional portfolio'
    };

    test('creates a new shortened URL', async () => {
      app.decorateRequest('user', {
        userId: 'user_123',
        identifiers: ['john', 'johndoe']
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ 
          rows: [{
            id: 1,
            short_code: 'abc123',
            identifier: 'john',
            keywords: ['portfolio', '2024'],
            original_url: 'https://example.com/john-portfolio',
            created_at: new Date()
          }]
        });

      const response = await app.inject({
        method: 'POST',
        url: '/api/urls',
        payload: validPayload,
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.shortUrl).toContain('wordsto.link/john/portfolio/2024');
    });

    test('validates identifier ownership', async () => {
      app.decorateRequest('user', {
        userId: 'user_123',
        identifiers: ['jane']
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/urls',
        payload: validPayload,
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('not own this identifier');
    });

    test('enforces URL limits for free tier', async () => {
      app.decorateRequest('user', {
        userId: 'user_123',
        identifiers: ['john'],
        subscriptionTier: 'free'
      });

      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });

      const response = await app.inject({
        method: 'POST',
        url: '/api/urls',
        payload: validPayload,
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('URL limit reached');
    });

    test('validates required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/urls',
        payload: {
          keywords: ['test']
        },
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('destination');
    });

    test('validates URL format', async () => {
      app.decorateRequest('user', {
        userId: 'user_123',
        identifiers: []
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/urls',
        payload: {
          ...validPayload,
          identifier: null,
          destination: 'not-a-valid-url'
        },
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('Invalid URL');
    });
  });

  describe('GET /api/urls', () => {
    test('retrieves user URLs with pagination', async () => {
      app.decorateRequest('user', {
        userId: 'user_123'
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            short_code: 'abc123',
            identifier: 'john',
            keywords: ['portfolio'],
            original_url: 'https://example.com',
            click_count: 42,
            created_at: new Date()
          }
        ]
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/urls?page=1&limit=10',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].clickCount).toBe(42);
    });

    test('filters URLs by identifier', async () => {
      app.decorateRequest('user', {
        userId: 'user_123'
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/api/urls?identifier=john',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND identifier = $2'),
        expect.arrayContaining(['user_123', 'john'])
      );
    });

    test('searches URLs by keyword', async () => {
      app.decorateRequest('user', {
        userId: 'user_123'
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/api/urls?search=portfolio',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('@>'),
        expect.arrayContaining(['user_123', ['portfolio']])
      );
    });
  });

  describe('DELETE /api/urls/:id', () => {
    test('deletes a URL owned by user', async () => {
      app.decorateRequest('user', {
        userId: 'user_123'
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 1 }]
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/urls/1',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(mockRedis.del).toHaveBeenCalled();
    });

    test('returns 404 for non-existent URL', async () => {
      app.decorateRequest('user', {
        userId: 'user_123'
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/urls/999',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/urls/:id', () => {
    test('updates URL properties', async () => {
      app.decorateRequest('user', {
        userId: 'user_123',
        identifiers: ['john', 'newidentifier']
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 1, identifier: 'john' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            identifier: 'newidentifier',
            keywords: ['updated'],
            original_url: 'https://updated.com'
          }]
        });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/urls/1',
        payload: {
          identifier: 'newidentifier',
          keywords: ['updated'],
          destination: 'https://updated.com'
        },
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.identifier).toBe('newidentifier');
    });

    test('prevents changing to unowned identifier', async () => {
      app.decorateRequest('user', {
        userId: 'user_123',
        identifiers: ['john']
      });

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, identifier: 'john' }] });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/urls/1',
        payload: {
          identifier: 'notowned'
        },
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(403);
    });
  });
});