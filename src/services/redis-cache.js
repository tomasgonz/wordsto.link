import Redis from 'ioredis';

export class RedisCache {
    constructor(redisUrl) {
        this.redisUrl = redisUrl;
        this.client = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            this.client = new Redis(this.redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                reconnectOnError: (err) => {
                    const targetError = 'READONLY';
                    if (err.message.includes(targetError)) {
                        return true;
                    }
                    return false;
                },
                lazyConnect: false,
                enableOfflineQueue: true,
                connectTimeout: 10000,
                disconnectTimeout: 2000,
                commandTimeout: 5000,
                keepAlive: 30000
            });

            this.client.on('connect', () => {
                console.log('Redis client connected');
                this.isConnected = true;
            });

            this.client.on('error', (err) => {
                console.error('Redis client error:', err);
                this.isConnected = false;
            });

            this.client.on('close', () => {
                console.log('Redis client connection closed');
                this.isConnected = false;
            });

            this.client.on('reconnecting', (delay) => {
                console.log(`Redis client reconnecting in ${delay}ms`);
            });

            await this.client.ping();
            console.log('Redis connection verified');
            
            return this.client;
        } catch (error) {
            console.error('Failed to connect to Redis:', error);
            throw error;
        }
    }

    async get(key) {
        if (!this.isConnected) {
            console.warn('Redis not connected, skipping cache get');
            return null;
        }

        try {
            const value = await this.client.get(key);
            if (value) {
                await this.client.expire(key, 300);
            }
            return value;
        } catch (error) {
            console.error(`Redis get error for key ${key}:`, error);
            return null;
        }
    }

    async set(key, value, ttl = 300) {
        if (!this.isConnected) {
            console.warn('Redis not connected, skipping cache set');
            return false;
        }

        try {
            if (typeof value === 'object') {
                value = JSON.stringify(value);
            }
            
            if (ttl) {
                await this.client.setex(key, ttl, value);
            } else {
                await this.client.set(key, value);
            }
            
            return true;
        } catch (error) {
            console.error(`Redis set error for key ${key}:`, error);
            return false;
        }
    }

    async del(key) {
        if (!this.isConnected) {
            console.warn('Redis not connected, skipping cache delete');
            return false;
        }

        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error(`Redis delete error for key ${key}:`, error);
            return false;
        }
    }

    async deletePattern(pattern) {
        if (!this.isConnected) {
            console.warn('Redis not connected, skipping pattern delete');
            return 0;
        }

        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                const pipeline = this.client.pipeline();
                keys.forEach(key => pipeline.del(key));
                await pipeline.exec();
                return keys.length;
            }
            return 0;
        } catch (error) {
            console.error(`Redis delete pattern error for ${pattern}:`, error);
            return 0;
        }
    }

    async exists(key) {
        if (!this.isConnected) {
            return false;
        }

        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            console.error(`Redis exists error for key ${key}:`, error);
            return false;
        }
    }

    async expire(key, seconds) {
        if (!this.isConnected) {
            return false;
        }

        try {
            await this.client.expire(key, seconds);
            return true;
        } catch (error) {
            console.error(`Redis expire error for key ${key}:`, error);
            return false;
        }
    }

    async ttl(key) {
        if (!this.isConnected) {
            return -1;
        }

        try {
            return await this.client.ttl(key);
        } catch (error) {
            console.error(`Redis TTL error for key ${key}:`, error);
            return -1;
        }
    }

    async increment(key, amount = 1) {
        if (!this.isConnected) {
            return 0;
        }

        try {
            return await this.client.incrby(key, amount);
        } catch (error) {
            console.error(`Redis increment error for key ${key}:`, error);
            return 0;
        }
    }

    async rateLimit(key, limit, window) {
        if (!this.isConnected) {
            return { allowed: true, remaining: limit, resetIn: 0 };
        }

        try {
            const multi = this.client.multi();
            const now = Date.now();
            const windowStart = now - window * 1000;
            
            multi.zremrangebyscore(key, '-inf', windowStart);
            multi.zadd(key, now, `${now}-${Math.random()}`);
            multi.zcard(key);
            multi.expire(key, window + 1);
            
            const results = await multi.exec();
            const count = results[2][1];
            
            const allowed = count <= limit;
            const remaining = Math.max(0, limit - count);
            const oldestScore = await this.client.zrange(key, 0, 0, 'WITHSCORES');
            const resetIn = oldestScore.length > 1 
                ? Math.ceil((parseInt(oldestScore[1]) + window * 1000 - now) / 1000)
                : window;
            
            return { allowed, remaining, resetIn };
        } catch (error) {
            console.error(`Redis rate limit error for key ${key}:`, error);
            return { allowed: true, remaining: limit, resetIn: 0 };
        }
    }

    async healthCheck() {
        if (!this.client || !this.isConnected) {
            return { healthy: false, message: 'Redis not connected' };
        }

        try {
            const start = Date.now();
            await this.client.ping();
            const latency = Date.now() - start;
            
            const info = await this.client.info('server');
            const version = info.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown';
            
            return {
                healthy: true,
                latency,
                version,
                connected: this.isConnected
            };
        } catch (error) {
            return {
                healthy: false,
                message: error.message,
                connected: false
            };
        }
    }

    async disconnect() {
        if (this.client) {
            try {
                await this.client.quit();
                this.isConnected = false;
                console.log('Redis client disconnected');
            } catch (error) {
                console.error('Error disconnecting Redis:', error);
                this.client.disconnect();
            }
        }
    }
}

export default RedisCache;