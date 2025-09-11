import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

class Database {
    constructor() {
        this.pool = null;
    }

    async connect() {
        if (this.pool) {
            return this.pool;
        }

        try {
            this.pool = new Pool({
                connectionString: config.database.url || this.buildConnectionString(),
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            });

            this.pool.on('error', (err, client) => {
                console.error('Unexpected error on idle client', err);
            });

            await this.pool.query('SELECT NOW()');
            console.log('Database connected successfully');

            return this.pool;
        } catch (error) {
            console.error('Database connection failed:', error);
            throw error;
        }
    }

    buildConnectionString() {
        const { host, port, name, user, password } = config.database;
        return `postgresql://${user}:${password}@${host}:${port}/${name}`;
    }

    async query(text, params) {
        const pool = await this.connect();
        const start = Date.now();
        
        try {
            const result = await pool.query(text, params);
            const duration = Date.now() - start;
            
            if (process.env.NODE_ENV === 'development') {
                console.log('Query executed', { text, duration, rows: result.rowCount });
            }
            
            return result;
        } catch (error) {
            console.error('Query error', { text, error: error.message });
            throw error;
        }
    }

    async transaction(callback) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async findShortenedUrl(identifier, keywords) {
        const query = identifier
            ? `SELECT * FROM shortened_urls 
               WHERE identifier = $1 AND keywords = $2::text[] 
               AND is_active = true 
               AND (expires_at IS NULL OR expires_at > NOW())`
            : `SELECT * FROM shortened_urls 
               WHERE identifier IS NULL AND keywords = $1::text[] 
               AND is_active = true 
               AND (expires_at IS NULL OR expires_at > NOW())`;
        
        const params = identifier ? [identifier, keywords] : [keywords];
        const result = await this.query(query, params);
        
        return result.rows[0] || null;
    }

    async createShortenedUrl(data) {
        const {
            user_id,
            identifier,
            keywords,
            original_url,
            short_code,
            title,
            description,
            expires_at,
            custom_metadata
        } = data;

        const query = `
            INSERT INTO shortened_urls (
                user_id, identifier, keywords, original_url, 
                short_code, title, description, expires_at, custom_metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`;

        const params = [
            user_id,
            identifier || null,
            keywords,
            original_url,
            short_code || null,
            title || null,
            description || null,
            expires_at || null,
            custom_metadata || {}
        ];

        const result = await this.query(query, params);
        return result.rows[0];
    }

    async trackClick(shortenedUrlId, eventData) {
        return this.transaction(async (client) => {
            await client.query(
                `UPDATE shortened_urls 
                 SET click_count = click_count + 1, 
                     last_clicked_at = NOW() 
                 WHERE id = $1`,
                [shortenedUrlId]
            );

            if (!eventData.is_bot) {
                const checkVisitor = await client.query(
                    `SELECT 1 FROM analytics_events 
                     WHERE shortened_url_id = $1 AND visitor_id = $2 
                     AND clicked_at > NOW() - INTERVAL '24 hours'`,
                    [shortenedUrlId, eventData.visitor_id]
                );

                if (checkVisitor.rows.length === 0) {
                    await client.query(
                        `UPDATE shortened_urls 
                         SET unique_visitors = unique_visitors + 1 
                         WHERE id = $1`,
                        [shortenedUrlId]
                    );
                }
            }

            const insertQuery = `
                INSERT INTO analytics_events (
                    shortened_url_id, visitor_id, ip_address, user_agent,
                    referer, country_code, country_name, city, region,
                    device_type, browser_name, os_name, is_bot,
                    utm_source, utm_medium, utm_campaign, response_time_ms
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING id`;

            const result = await client.query(insertQuery, [
                shortenedUrlId,
                eventData.visitor_id,
                eventData.ip_address,
                eventData.user_agent,
                eventData.referer,
                eventData.country_code,
                eventData.country_name,
                eventData.city,
                eventData.region,
                eventData.device_type,
                eventData.browser_name,
                eventData.os_name,
                eventData.is_bot,
                eventData.utm_source,
                eventData.utm_medium,
                eventData.utm_campaign,
                eventData.response_time_ms
            ]);

            return result.rows[0];
        });
    }

    async getUserByClerkId(clerkUserId) {
        const result = await this.query(
            'SELECT * FROM users WHERE clerk_user_id = $1',
            [clerkUserId]
        );
        return result.rows[0] || null;
    }

    async createUser(userData) {
        const {
            clerk_user_id,
            email,
            username,
            full_name,
            avatar_url
        } = userData;

        const query = `
            INSERT INTO users (
                clerk_user_id, email, username, full_name, avatar_url
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (clerk_user_id) 
            DO UPDATE SET 
                email = EXCLUDED.email,
                full_name = EXCLUDED.full_name,
                avatar_url = EXCLUDED.avatar_url,
                last_login_at = NOW()
            RETURNING *`;

        const result = await this.query(query, [
            clerk_user_id,
            email,
            username || null,
            full_name || null,
            avatar_url || null
        ]);

        return result.rows[0];
    }

    async getAnalytics(shortenedUrlId, period = '30d') {
        const intervals = {
            '24h': '1 hour',
            '7d': '1 day',
            '30d': '1 day',
            '90d': '1 week',
            '1y': '1 month'
        };

        const interval = intervals[period] || '1 day';
        const periodMap = {
            '24h': "NOW() - INTERVAL '24 hours'",
            '7d': "NOW() - INTERVAL '7 days'",
            '30d': "NOW() - INTERVAL '30 days'",
            '90d': "NOW() - INTERVAL '90 days'",
            '1y': "NOW() - INTERVAL '1 year'"
        };

        const startDate = periodMap[period] || periodMap['30d'];

        const query = `
            SELECT 
                DATE_TRUNC('${interval}', clicked_at) as time_bucket,
                COUNT(*) as clicks,
                COUNT(DISTINCT visitor_id) as unique_visitors,
                COUNT(DISTINCT country_code) as countries,
                AVG(response_time_ms) as avg_response_time
            FROM analytics_events
            WHERE shortened_url_id = $1
                AND clicked_at >= ${startDate}
            GROUP BY time_bucket
            ORDER BY time_bucket DESC`;

        const result = await this.query(query, [shortenedUrlId]);
        return result.rows;
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            console.log('Database connection closed');
        }
    }
}

export const db = new Database();
export default db;