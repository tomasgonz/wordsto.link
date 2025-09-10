import { getGeoLocation } from '../utils/geo-location.js';

export class AnalyticsTracker {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger;
        this.queue = [];
        this.processing = false;
        this.batchSize = 10;
        this.flushInterval = 5000;
        
        this.startBatchProcessor();
    }

    async track(eventData) {
        try {
            const enrichedData = await this.enrichEventData(eventData);
            
            this.queue.push({
                data: enrichedData,
                timestamp: Date.now()
            });
            
            if (this.queue.length >= this.batchSize) {
                this.processBatch();
            }
            
            return true;
        } catch (error) {
            this.logger.error('Failed to queue analytics event:', error);
            return false;
        }
    }

    async enrichEventData(eventData) {
        const enriched = { ...eventData };
        
        if (eventData.ip_address) {
            try {
                const geoData = await getGeoLocation(eventData.ip_address);
                Object.assign(enriched, geoData);
            } catch (error) {
                this.logger.debug('Failed to get geo location:', error.message);
            }
        }
        
        if (!enriched.clicked_at) {
            enriched.clicked_at = new Date().toISOString();
        }
        
        return enriched;
    }

    startBatchProcessor() {
        setInterval(() => {
            if (this.queue.length > 0 && !this.processing) {
                this.processBatch();
            }
        }, this.flushInterval);
    }

    async processBatch() {
        if (this.processing || this.queue.length === 0) {
            return;
        }
        
        this.processing = true;
        const batch = this.queue.splice(0, this.batchSize);
        
        try {
            await Promise.all(
                batch.map(item => this.saveEvent(item.data))
            );
            
            this.logger.debug(`Processed ${batch.length} analytics events`);
        } catch (error) {
            this.logger.error('Failed to process analytics batch:', error);
            
            this.queue.unshift(...batch);
        } finally {
            this.processing = false;
        }
    }

    async saveEvent(eventData) {
        try {
            await this.db.trackClick(eventData.shortened_url_id, eventData);
        } catch (error) {
            this.logger.error('Failed to save analytics event:', error);
            throw error;
        }
    }

    async flush() {
        while (this.queue.length > 0) {
            await this.processBatch();
        }
    }

    getQueueSize() {
        return this.queue.length;
    }

    async getRealtimeStats(urlId, minutes = 5) {
        try {
            const result = await this.db.query(
                `SELECT 
                    COUNT(*) as total_clicks,
                    COUNT(DISTINCT visitor_id) as unique_visitors,
                    AVG(response_time_ms) as avg_response_time
                 FROM analytics_events
                 WHERE shortened_url_id = $1
                    AND clicked_at > NOW() - INTERVAL '${minutes} minutes'`,
                [urlId]
            );
            
            return result.rows[0];
        } catch (error) {
            this.logger.error('Failed to get realtime stats:', error);
            return null;
        }
    }

    async getTopReferrers(urlId, limit = 10) {
        try {
            const result = await this.db.query(
                `SELECT 
                    referer,
                    COUNT(*) as count
                 FROM analytics_events
                 WHERE shortened_url_id = $1
                    AND referer IS NOT NULL
                    AND referer != ''
                 GROUP BY referer
                 ORDER BY count DESC
                 LIMIT $2`,
                [urlId, limit]
            );
            
            return result.rows;
        } catch (error) {
            this.logger.error('Failed to get top referrers:', error);
            return [];
        }
    }

    async getDeviceStats(urlId) {
        try {
            const result = await this.db.query(
                `SELECT 
                    device_type,
                    browser_name,
                    os_name,
                    COUNT(*) as count
                 FROM analytics_events
                 WHERE shortened_url_id = $1
                 GROUP BY device_type, browser_name, os_name
                 ORDER BY count DESC`,
                [urlId]
            );
            
            return result.rows;
        } catch (error) {
            this.logger.error('Failed to get device stats:', error);
            return [];
        }
    }

    async getGeographicStats(urlId) {
        try {
            const result = await this.db.query(
                `SELECT 
                    country_code,
                    country_name,
                    city,
                    COUNT(*) as count,
                    COUNT(DISTINCT visitor_id) as unique_visitors
                 FROM analytics_events
                 WHERE shortened_url_id = $1
                    AND country_code IS NOT NULL
                 GROUP BY country_code, country_name, city
                 ORDER BY count DESC
                 LIMIT 50`,
                [urlId]
            );
            
            return result.rows;
        } catch (error) {
            this.logger.error('Failed to get geographic stats:', error);
            return [];
        }
    }

    async getClickTimeline(urlId, period = '24h') {
        const intervals = {
            '1h': { interval: '5 minutes', range: '1 hour' },
            '24h': { interval: '1 hour', range: '24 hours' },
            '7d': { interval: '6 hours', range: '7 days' },
            '30d': { interval: '1 day', range: '30 days' },
            '90d': { interval: '1 week', range: '90 days' }
        };
        
        const { interval, range } = intervals[period] || intervals['24h'];
        
        try {
            const result = await this.db.query(
                `SELECT 
                    DATE_TRUNC('${interval}', clicked_at) as time_bucket,
                    COUNT(*) as clicks,
                    COUNT(DISTINCT visitor_id) as unique_visitors
                 FROM analytics_events
                 WHERE shortened_url_id = $1
                    AND clicked_at > NOW() - INTERVAL '${range}'
                 GROUP BY time_bucket
                 ORDER BY time_bucket DESC`,
                [urlId]
            );
            
            return result.rows;
        } catch (error) {
            this.logger.error('Failed to get click timeline:', error);
            return [];
        }
    }

    async getUtmCampaignStats(urlId) {
        try {
            const result = await this.db.query(
                `SELECT 
                    utm_source,
                    utm_medium,
                    utm_campaign,
                    COUNT(*) as clicks,
                    COUNT(DISTINCT visitor_id) as unique_visitors
                 FROM analytics_events
                 WHERE shortened_url_id = $1
                    AND (utm_source IS NOT NULL 
                         OR utm_medium IS NOT NULL 
                         OR utm_campaign IS NOT NULL)
                 GROUP BY utm_source, utm_medium, utm_campaign
                 ORDER BY clicks DESC`,
                [urlId]
            );
            
            return result.rows;
        } catch (error) {
            this.logger.error('Failed to get UTM campaign stats:', error);
            return [];
        }
    }
}

export default AnalyticsTracker;