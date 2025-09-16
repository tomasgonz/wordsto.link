import { pathParamsSchema, analyticsQuerySchema, validateQueryParams } from '../schemas/validation.js';
import { startOfDay, endOfDay, subDays, subMonths, format } from 'date-fns';

export async function analyticsRoutes(fastify, opts) {
    fastify.get('/analytics/*', {
        preHandler: [
            fastify.authenticate,
            validateQueryParams(analyticsQuerySchema)
        ]
    }, async (request, reply) => {
        const userId = request.user.id;
        const pathString = request.params['*'];
        
        if (!pathString) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Path parameter is required'
            });
        }

        try {
            const { path: parsedPath } = pathParamsSchema.parse({ path: pathString });
            const { identifier, keywords } = parsedPath;
            const query = request.validatedQuery;

            const urlResult = await fastify.db.query(
                `SELECT * FROM shortened_urls 
                 WHERE user_id = $1 
                   AND ($2::varchar IS NULL OR identifier = $2)
                   AND keywords = $3::text[]
                   AND is_active = true`,
                [userId, identifier, keywords]
            );

            if (urlResult.rows.length === 0) {
                return reply.status(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'URL not found or you do not have permission to view its analytics'
                });
            }

            const url = urlResult.rows[0];
            const { startDate, endDate } = getDateRange(query.period, query.start_date, query.end_date);

            const [
                overview,
                timeline,
                geographic,
                devices,
                referrers,
                campaigns
            ] = await Promise.all([
                getAnalyticsOverview(fastify.db, url.id, startDate, endDate, query.include_bots),
                getClickTimeline(fastify.db, url.id, startDate, endDate, query.period, query.group_by),
                getGeographicData(fastify.db, url.id, startDate, endDate, query.include_bots),
                getDeviceData(fastify.db, url.id, startDate, endDate, query.include_bots),
                getReferrerData(fastify.db, url.id, startDate, endDate, query.include_bots),
                getCampaignData(fastify.db, url.id, startDate, endDate)
            ]);

            const response = {
                url: {
                    id: url.id,
                    path: buildUrlPath(identifier, keywords),
                    identifier: url.identifier,
                    keywords: url.keywords,
                    destination_url: url.original_url,
                    title: url.title,
                    created_at: url.created_at
                },
                period: {
                    type: query.period,
                    start_date: startDate,
                    end_date: endDate,
                    timezone: query.timezone
                },
                overview,
                timeline,
                geographic,
                devices,
                referrers,
                campaigns
            };

            if (query.period === '24h' || query.period === '1h') {
                response.realtime = await getRealtimeData(fastify.db, url.id);
            }

            return reply.send(response);

        } catch (error) {
            if (error.name === 'ZodError') {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Bad Request',
                    message: 'Invalid path format',
                    details: error.errors
                });
            }
            
            fastify.log.error('Failed to get analytics:', error);
            throw error;
        }
    });

    fastify.get('/analytics/summary', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        const userId = request.user.id;
        const { period = '30d' } = request.query;

        const { startDate, endDate } = getDateRange(period);

        try {
            const result = await fastify.db.query(
                `SELECT 
                    COUNT(DISTINCT s.id) as total_urls,
                    COUNT(DISTINCT a.id) as total_clicks,
                    COUNT(DISTINCT a.visitor_id) as unique_visitors,
                    COUNT(DISTINCT a.country_code) as countries_reached,
                    AVG(a.response_time_ms) as avg_response_time,
                    json_build_object(
                        'desktop', COUNT(a.id) FILTER (WHERE a.device_type = 'desktop'),
                        'mobile', COUNT(a.id) FILTER (WHERE a.device_type = 'mobile'),
                        'tablet', COUNT(a.id) FILTER (WHERE a.device_type = 'tablet')
                    ) as device_breakdown,
                    json_build_object(
                        'direct', COUNT(a.id) FILTER (WHERE a.referer IS NULL),
                        'social', COUNT(a.id) FILTER (WHERE a.referer LIKE '%facebook%' OR a.referer LIKE '%twitter%' OR a.referer LIKE '%linkedin%'),
                        'search', COUNT(a.id) FILTER (WHERE a.referer LIKE '%google%' OR a.referer LIKE '%bing%' OR a.referer LIKE '%yahoo%'),
                        'other', COUNT(a.id) FILTER (WHERE a.referer IS NOT NULL AND a.referer NOT LIKE '%facebook%' AND a.referer NOT LIKE '%twitter%' AND a.referer NOT LIKE '%google%')
                    ) as traffic_sources
                 FROM shortened_urls s
                 LEFT JOIN analytics_events a ON s.id = a.shortened_url_id
                    AND a.clicked_at BETWEEN $2 AND $3
                    AND a.is_bot = false
                 WHERE s.user_id = $1`,
                [userId, startDate, endDate]
            );

            const topUrls = await fastify.db.query(
                `SELECT 
                    s.id,
                    CASE 
                        WHEN s.identifier IS NOT NULL THEN 
                            s.identifier || '/' || array_to_string(s.keywords, '/')
                        ELSE 
                            array_to_string(s.keywords, '/')
                    END as path,
                    s.title,
                    COUNT(a.id) as clicks,
                    COUNT(DISTINCT a.visitor_id) as unique_visitors
                 FROM shortened_urls s
                 LEFT JOIN analytics_events a ON s.id = a.shortened_url_id
                    AND a.clicked_at BETWEEN $2 AND $3
                    AND a.is_bot = false
                 WHERE s.user_id = $1
                 GROUP BY s.id
                 ORDER BY clicks DESC
                 LIMIT 10`,
                [userId, startDate, endDate]
            );

            const growthData = await getGrowthData(fastify.db, userId, period);

            return reply.send({
                period: {
                    type: period,
                    start_date: startDate,
                    end_date: endDate
                },
                overview: {
                    total_urls: parseInt(result.rows[0].total_urls),
                    total_clicks: parseInt(result.rows[0].total_clicks),
                    unique_visitors: parseInt(result.rows[0].unique_visitors),
                    countries_reached: parseInt(result.rows[0].countries_reached),
                    avg_response_time: parseFloat(result.rows[0].avg_response_time || 0),
                    device_breakdown: result.rows[0].device_breakdown,
                    traffic_sources: result.rows[0].traffic_sources
                },
                top_urls: topUrls.rows,
                growth: growthData
            });

        } catch (error) {
            fastify.log.error('Failed to get analytics summary:', error);
            throw error;
        }
    });

    fastify.get('/analytics/export', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        const userId = request.user.id;
        const { format = 'json', period = '30d' } = request.query;

        const { startDate, endDate } = getDateRange(period);

        try {
            const data = await fastify.db.query(
                `SELECT 
                    s.id,
                    s.identifier,
                    s.keywords,
                    s.original_url,
                    s.title,
                    s.click_count,
                    s.unique_visitors,
                    s.created_at,
                    json_agg(
                        json_build_object(
                            'clicked_at', a.clicked_at,
                            'country', a.country_name,
                            'city', a.city,
                            'device', a.device_type,
                            'browser', a.browser_name,
                            'referer', a.referer
                        ) ORDER BY a.clicked_at DESC
                    ) FILTER (WHERE a.id IS NOT NULL) as clicks
                 FROM shortened_urls s
                 LEFT JOIN analytics_events a ON s.id = a.shortened_url_id
                    AND a.clicked_at BETWEEN $2 AND $3
                 WHERE s.user_id = $1
                 GROUP BY s.id
                 ORDER BY s.created_at DESC`,
                [userId, startDate, endDate]
            );

            if (format === 'csv') {
                const csv = convertToCSV(data.rows);
                reply.header('Content-Type', 'text/csv');
                reply.header('Content-Disposition', `attachment; filename="analytics-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
                return reply.send(csv);
            }

            return reply.send({
                export_date: new Date().toISOString(),
                period: { start_date: startDate, end_date: endDate },
                data: data.rows
            });

        } catch (error) {
            fastify.log.error('Failed to export analytics:', error);
            throw error;
        }
    });
}

async function getAnalyticsOverview(db, urlId, startDate, endDate, includeBots) {
    const botFilter = includeBots ? '' : 'AND is_bot = false';
    
    const result = await db.query(
        `SELECT 
            COUNT(*) as total_clicks,
            COUNT(DISTINCT visitor_id) as unique_visitors,
            COUNT(DISTINCT DATE(clicked_at)) as days_active,
            AVG(response_time_ms) as avg_response_time,
            MIN(clicked_at) as first_click,
            MAX(clicked_at) as last_click,
            COUNT(DISTINCT country_code) as countries,
            COUNT(DISTINCT device_type) as device_types,
            COUNT(*) FILTER (WHERE is_bot = true) as bot_clicks,
            COUNT(*) FILTER (WHERE utm_source IS NOT NULL) as campaign_clicks
         FROM analytics_events
         WHERE shortened_url_id = $1
           AND clicked_at BETWEEN $2 AND $3
           ${botFilter}`,
        [urlId, startDate, endDate]
    );

    return {
        total_clicks: parseInt(result.rows[0].total_clicks),
        unique_visitors: parseInt(result.rows[0].unique_visitors),
        days_active: parseInt(result.rows[0].days_active),
        avg_response_time: parseFloat(result.rows[0].avg_response_time || 0),
        first_click: result.rows[0].first_click,
        last_click: result.rows[0].last_click,
        countries: parseInt(result.rows[0].countries),
        device_types: parseInt(result.rows[0].device_types),
        bot_clicks: parseInt(result.rows[0].bot_clicks),
        campaign_clicks: parseInt(result.rows[0].campaign_clicks)
    };
}

async function getClickTimeline(db, urlId, startDate, endDate, period, groupBy) {
    const interval = groupBy || getTimeInterval(period);
    
    const result = await db.query(
        `SELECT 
            DATE_TRUNC($1, clicked_at) as time_bucket,
            COUNT(*) as clicks,
            COUNT(DISTINCT visitor_id) as unique_visitors,
            AVG(response_time_ms) as avg_response_time
         FROM analytics_events
         WHERE shortened_url_id = $2
           AND clicked_at BETWEEN $3 AND $4
           AND is_bot = false
         GROUP BY time_bucket
         ORDER BY time_bucket ASC`,
        [interval, urlId, startDate, endDate]
    );

    return result.rows.map(row => ({
        timestamp: row.time_bucket,
        clicks: parseInt(row.clicks),
        unique_visitors: parseInt(row.unique_visitors),
        avg_response_time: parseFloat(row.avg_response_time || 0)
    }));
}

async function getGeographicData(db, urlId, startDate, endDate, includeBots) {
    const botFilter = includeBots ? '' : 'AND is_bot = false';
    
    const result = await db.query(
        `SELECT 
            country_code,
            country_name,
            COUNT(*) as clicks,
            COUNT(DISTINCT visitor_id) as unique_visitors,
            json_agg(DISTINCT city) FILTER (WHERE city IS NOT NULL) as cities
         FROM analytics_events
         WHERE shortened_url_id = $1
           AND clicked_at BETWEEN $2 AND $3
           ${botFilter}
         GROUP BY country_code, country_name
         ORDER BY clicks DESC
         LIMIT 50`,
        [urlId, startDate, endDate]
    );

    return result.rows.map(row => ({
        country_code: row.country_code,
        country_name: row.country_name,
        clicks: parseInt(row.clicks),
        unique_visitors: parseInt(row.unique_visitors),
        cities: row.cities || []
    }));
}

async function getDeviceData(db, urlId, startDate, endDate, includeBots) {
    const botFilter = includeBots ? '' : 'AND is_bot = false';
    
    const result = await db.query(
        `SELECT 
            device_type,
            browser_name,
            os_name,
            COUNT(*) as clicks,
            COUNT(DISTINCT visitor_id) as unique_visitors
         FROM analytics_events
         WHERE shortened_url_id = $1
           AND clicked_at BETWEEN $2 AND $3
           ${botFilter}
         GROUP BY device_type, browser_name, os_name
         ORDER BY clicks DESC`,
        [urlId, startDate, endDate]
    );

    const deviceSummary = {};
    const browserSummary = {};
    const osSummary = {};

    result.rows.forEach(row => {
        deviceSummary[row.device_type] = (deviceSummary[row.device_type] || 0) + parseInt(row.clicks);
        browserSummary[row.browser_name] = (browserSummary[row.browser_name] || 0) + parseInt(row.clicks);
        osSummary[row.os_name] = (osSummary[row.os_name] || 0) + parseInt(row.clicks);
    });

    return {
        devices: deviceSummary,
        browsers: browserSummary,
        operating_systems: osSummary,
        detailed: result.rows.slice(0, 20)
    };
}

async function getReferrerData(db, urlId, startDate, endDate, includeBots) {
    const botFilter = includeBots ? '' : 'AND is_bot = false';
    
    const result = await db.query(
        `SELECT 
            COALESCE(referer, 'Direct') as source,
            COUNT(*) as clicks,
            COUNT(DISTINCT visitor_id) as unique_visitors
         FROM analytics_events
         WHERE shortened_url_id = $1
           AND clicked_at BETWEEN $2 AND $3
           ${botFilter}
         GROUP BY referer
         ORDER BY clicks DESC
         LIMIT 20`,
        [urlId, startDate, endDate]
    );

    return result.rows.map(row => ({
        source: row.source,
        clicks: parseInt(row.clicks),
        unique_visitors: parseInt(row.unique_visitors),
        type: categorizeReferrer(row.source)
    }));
}

async function getCampaignData(db, urlId, startDate, endDate) {
    const result = await db.query(
        `SELECT 
            utm_source,
            utm_medium,
            utm_campaign,
            COUNT(*) as clicks,
            COUNT(DISTINCT visitor_id) as unique_visitors,
            AVG(response_time_ms) as avg_response_time
         FROM analytics_events
         WHERE shortened_url_id = $1
           AND clicked_at BETWEEN $2 AND $3
           AND utm_source IS NOT NULL
         GROUP BY utm_source, utm_medium, utm_campaign
         ORDER BY clicks DESC`,
        [urlId, startDate, endDate]
    );

    return result.rows.map(row => ({
        source: row.utm_source,
        medium: row.utm_medium,
        campaign: row.utm_campaign,
        clicks: parseInt(row.clicks),
        unique_visitors: parseInt(row.unique_visitors),
        avg_response_time: parseFloat(row.avg_response_time || 0)
    }));
}

async function getRealtimeData(db, urlId) {
    const result = await db.query(
        `SELECT 
            COUNT(*) as active_visitors
         FROM analytics_events
         WHERE shortened_url_id = $1
           AND clicked_at > NOW() - INTERVAL '5 minutes'
           AND is_bot = false`,
        [urlId]
    );

    const recentClicks = await db.query(
        `SELECT 
            clicked_at,
            country_name,
            city,
            device_type,
            referer
         FROM analytics_events
         WHERE shortened_url_id = $1
           AND clicked_at > NOW() - INTERVAL '1 hour'
           AND is_bot = false
         ORDER BY clicked_at DESC
         LIMIT 10`,
        [urlId]
    );

    return {
        active_visitors: parseInt(result.rows[0].active_visitors),
        recent_clicks: recentClicks.rows
    };
}

async function getGrowthData(db, userId, period) {
    const currentPeriod = getDateRange(period);
    const previousPeriod = getPreviousPeriod(period);

    const [current, previous] = await Promise.all([
        db.query(
            `SELECT 
                COUNT(DISTINCT s.id) as urls_created,
                COUNT(a.id) as clicks
             FROM shortened_urls s
             LEFT JOIN analytics_events a ON s.id = a.shortened_url_id
                AND a.clicked_at BETWEEN $2 AND $3
             WHERE s.user_id = $1
                AND s.created_at BETWEEN $2 AND $3`,
            [userId, currentPeriod.startDate, currentPeriod.endDate]
        ),
        db.query(
            `SELECT 
                COUNT(DISTINCT s.id) as urls_created,
                COUNT(a.id) as clicks
             FROM shortened_urls s
             LEFT JOIN analytics_events a ON s.id = a.shortened_url_id
                AND a.clicked_at BETWEEN $2 AND $3
             WHERE s.user_id = $1
                AND s.created_at BETWEEN $2 AND $3`,
            [userId, previousPeriod.startDate, previousPeriod.endDate]
        )
    ]);

    const currentData = current.rows[0];
    const previousData = previous.rows[0];

    return {
        urls_created: {
            current: parseInt(currentData.urls_created),
            previous: parseInt(previousData.urls_created),
            change_percent: calculateChangePercent(currentData.urls_created, previousData.urls_created)
        },
        clicks: {
            current: parseInt(currentData.clicks),
            previous: parseInt(previousData.clicks),
            change_percent: calculateChangePercent(currentData.clicks, previousData.clicks)
        }
    };
}

function getDateRange(period, customStart, customEnd) {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
        case '1h':
            startDate = subDays(now, 1 / 24);
            endDate = now;
            break;
        case '24h':
            startDate = subDays(now, 1);
            endDate = now;
            break;
        case '7d':
            startDate = subDays(now, 7);
            endDate = now;
            break;
        case '30d':
            startDate = subDays(now, 30);
            endDate = now;
            break;
        case '90d':
            startDate = subDays(now, 90);
            endDate = now;
            break;
        case '1y':
            startDate = subMonths(now, 12);
            endDate = now;
            break;
        case 'custom':
            startDate = customStart ? new Date(customStart) : subDays(now, 30);
            endDate = customEnd ? new Date(customEnd) : now;
            break;
        default:
            startDate = subDays(now, 30);
            endDate = now;
    }

    return {
        startDate: startOfDay(startDate),
        endDate: endOfDay(endDate)
    };
}

function getPreviousPeriod(period) {
    const { startDate, endDate } = getDateRange(period);
    const duration = endDate - startDate;
    
    return {
        startDate: new Date(startDate - duration),
        endDate: startDate
    };
}

function getTimeInterval(period) {
    switch (period) {
        case '1h': return 'minute';
        case '24h': return 'hour';
        case '7d': return 'day';
        case '30d': return 'day';
        case '90d': return 'week';
        case '1y': return 'month';
        default: return 'day';
    }
}

function categorizeReferrer(referrer) {
    if (!referrer || referrer === 'Direct') return 'direct';
    
    const socialDomains = ['facebook', 'twitter', 'linkedin', 'instagram', 'youtube', 'tiktok'];
    const searchDomains = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu'];
    
    const domain = referrer.toLowerCase();
    
    if (socialDomains.some(s => domain.includes(s))) return 'social';
    if (searchDomains.some(s => domain.includes(s))) return 'search';
    
    return 'referral';
}

function calculateChangePercent(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

function buildUrlPath(identifier, keywords) {
    if (identifier) {
        return `${identifier}/${keywords.join('/')}`;
    }
    return keywords.join('/');
}

function convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = ['ID', 'Identifier', 'Keywords', 'URL', 'Title', 'Clicks', 'Unique Visitors', 'Created At'];
    const rows = data.map(row => [
        row.id,
        row.identifier || '',
        row.keywords.join(', '),
        row.original_url,
        row.title || '',
        row.click_count,
        row.unique_visitors,
        row.created_at
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    return csvContent;
}