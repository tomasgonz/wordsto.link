import { performance } from 'perf_hooks';
import Redis from 'ioredis';
import pg from 'pg';
import { nanoid } from 'nanoid';

const { Pool } = pg;

describe('Redis Cache Performance', () => {
  let redis;
  let pool;
  let testData;

  beforeAll(async () => {
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 2
    });

    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://wordsto:wordsto123@localhost:5432/wordsto_test'
    });

    await redis.flushdb();
    
    testData = Array.from({ length: 1000 }, (_, i) => ({
      key: `test_${nanoid(8)}`,
      value: {
        id: i,
        url: `https://example.com/page${i}`,
        clicks: Math.floor(Math.random() * 1000),
        data: 'x'.repeat(100)
      }
    }));
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
    await pool.end();
  });

  describe('Cache vs Database Performance', () => {
    test('compares single key retrieval performance', async () => {
      const testKey = testData[0].key;
      const testValue = JSON.stringify(testData[0].value);
      
      await redis.set(testKey, testValue);
      
      const cacheStart = performance.now();
      for (let i = 0; i < 100; i++) {
        await redis.get(testKey);
      }
      const cacheTime = performance.now() - cacheStart;
      
      const dbStart = performance.now();
      for (let i = 0; i < 100; i++) {
        await pool.query('SELECT 1');
      }
      const dbTime = performance.now() - dbStart;
      
      console.log(`Cache: ${cacheTime.toFixed(2)}ms, DB: ${dbTime.toFixed(2)}ms`);
      expect(cacheTime).toBeLessThan(dbTime);
    });

    test('measures bulk write performance', async () => {
      const pipeline = redis.pipeline();
      
      const cacheStart = performance.now();
      testData.slice(0, 100).forEach(item => {
        pipeline.set(item.key, JSON.stringify(item.value));
      });
      await pipeline.exec();
      const cacheTime = performance.now() - cacheStart;
      
      expect(cacheTime).toBeLessThan(100);
      console.log(`Bulk write 100 items: ${cacheTime.toFixed(2)}ms`);
    });

    test('measures concurrent read performance', async () => {
      const keys = testData.slice(0, 50).map(d => d.key);
      
      for (const key of keys) {
        await redis.set(key, JSON.stringify(testData.find(d => d.key === key).value));
      }
      
      const start = performance.now();
      const promises = keys.map(key => redis.get(key));
      await Promise.all(promises);
      const elapsed = performance.now() - start;
      
      expect(elapsed).toBeLessThan(50);
      console.log(`Concurrent read 50 keys: ${elapsed.toFixed(2)}ms`);
    });
  });

  describe('Cache Hit Ratio', () => {
    test('simulates realistic cache hit/miss scenario', async () => {
      const totalRequests = 1000;
      const uniqueKeys = 50;
      const keys = Array.from({ length: uniqueKeys }, (_, i) => `url_${i}`);
      
      let cacheHits = 0;
      let cacheMisses = 0;
      const times = [];
      
      for (let i = 0; i < totalRequests; i++) {
        const key = keys[Math.floor(Math.random() * uniqueKeys)];
        const start = performance.now();
        
        const cached = await redis.get(key);
        if (cached) {
          cacheHits++;
        } else {
          cacheMisses++;
          const value = JSON.stringify({ url: `https://example.com/${key}` });
          await redis.set(key, value, 'EX', 3600);
        }
        
        times.push(performance.now() - start);
      }
      
      const hitRatio = (cacheHits / totalRequests) * 100;
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      
      console.log(`Cache hit ratio: ${hitRatio.toFixed(2)}%`);
      console.log(`Average operation time: ${avgTime.toFixed(3)}ms`);
      
      expect(hitRatio).toBeGreaterThan(90);
      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('TTL and Memory Management', () => {
    test('measures memory usage with different TTL strategies', async () => {
      const shortTTL = 60;
      const longTTL = 3600;
      
      const shortStart = performance.now();
      for (let i = 0; i < 100; i++) {
        await redis.set(`short_${i}`, JSON.stringify(testData[i].value), 'EX', shortTTL);
      }
      const shortTime = performance.now() - shortStart;
      
      const longStart = performance.now();
      for (let i = 0; i < 100; i++) {
        await redis.set(`long_${i}`, JSON.stringify(testData[i].value), 'EX', longTTL);
      }
      const longTime = performance.now() - longStart;
      
      const info = await redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      
      console.log(`Short TTL write: ${shortTime.toFixed(2)}ms`);
      console.log(`Long TTL write: ${longTime.toFixed(2)}ms`);
      console.log(`Memory usage: ${memoryMatch ? memoryMatch[1] : 'unknown'}`);
      
      expect(Math.abs(shortTime - longTime)).toBeLessThan(20);
    });

    test('tests cache eviction behavior', async () => {
      const maxKeys = 100;
      const evictionKeys = [];
      
      for (let i = 0; i < maxKeys; i++) {
        const key = `evict_${i}`;
        evictionKeys.push(key);
        await redis.set(key, 'x'.repeat(1000), 'EX', 300);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const existingKeys = await Promise.all(
        evictionKeys.map(key => redis.exists(key))
      );
      
      const survivedCount = existingKeys.filter(exists => exists === 1).length;
      
      console.log(`Survived keys: ${survivedCount}/${maxKeys}`);
      expect(survivedCount).toBeGreaterThan(0);
    });
  });

  describe('Rate Limiting Performance', () => {
    test('measures rate limiting overhead', async () => {
      const key = 'rate_limit_test';
      const limit = 100;
      const window = 60;
      
      const times = [];
      
      for (let i = 0; i < limit; i++) {
        const start = performance.now();
        
        const multi = redis.multi();
        multi.incr(key);
        multi.expire(key, window);
        const [[, count]] = await multi.exec();
        
        times.push(performance.now() - start);
        
        if (count > limit) {
          break;
        }
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Average rate check: ${avgTime.toFixed(3)}ms`);
      console.log(`Max rate check: ${maxTime.toFixed(3)}ms`);
      
      expect(avgTime).toBeLessThan(2);
      expect(maxTime).toBeLessThan(10);
    });

    test('simulates concurrent rate limiting', async () => {
      const clientCount = 10;
      const requestsPerClient = 20;
      const rateLimitKey = 'concurrent_rate_';
      
      const start = performance.now();
      
      const clientPromises = Array.from({ length: clientCount }, async (_, clientId) => {
        const results = [];
        
        for (let i = 0; i < requestsPerClient; i++) {
          const key = `${rateLimitKey}${clientId}`;
          const multi = redis.multi();
          multi.incr(key);
          multi.expire(key, 60);
          const [[, count]] = await multi.exec();
          
          results.push({
            allowed: count <= 50,
            count
          });
        }
        
        return results;
      });
      
      const allResults = await Promise.all(clientPromises);
      const elapsed = performance.now() - start;
      
      const totalRequests = clientCount * requestsPerClient;
      const avgTimePerRequest = elapsed / totalRequests;
      
      console.log(`Concurrent rate limiting: ${totalRequests} requests in ${elapsed.toFixed(2)}ms`);
      console.log(`Average per request: ${avgTimePerRequest.toFixed(3)}ms`);
      
      expect(avgTimePerRequest).toBeLessThan(5);
    });
  });

  describe('Cache Warming Strategy', () => {
    test('measures cache warming performance', async () => {
      const popularUrls = testData.slice(0, 20).map(d => ({
        key: `popular_${d.key}`,
        value: d.value
      }));
      
      const warmStart = performance.now();
      const pipeline = redis.pipeline();
      
      popularUrls.forEach(({ key, value }) => {
        pipeline.set(key, JSON.stringify(value), 'EX', 7200);
      });
      
      await pipeline.exec();
      const warmTime = performance.now() - warmStart;
      
      const readStart = performance.now();
      const reads = await Promise.all(
        popularUrls.map(({ key }) => redis.get(key))
      );
      const readTime = performance.now() - readStart;
      
      console.log(`Cache warming 20 URLs: ${warmTime.toFixed(2)}ms`);
      console.log(`Reading warmed cache: ${readTime.toFixed(2)}ms`);
      
      expect(reads.every(r => r !== null)).toBe(true);
      expect(warmTime).toBeLessThan(50);
      expect(readTime).toBeLessThan(20);
    });
  });
});