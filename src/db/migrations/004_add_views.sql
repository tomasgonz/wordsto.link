-- Migration: 004_add_views
-- Created at: 2025-01-01
-- Description: Create materialized views for performance optimization

-- View for user statistics
CREATE OR REPLACE VIEW user_statistics AS
SELECT 
    u.id,
    u.email,
    u.username,
    u.subscription_tier,
    COUNT(DISTINCT s.id) as total_urls,
    COUNT(DISTINCT CASE WHEN s.is_active THEN s.id END) as active_urls,
    COALESCE(SUM(s.click_count), 0) as total_clicks,
    COALESCE(SUM(s.unique_visitors), 0) as total_unique_visitors,
    MAX(s.created_at) as last_url_created,
    MAX(s.last_clicked_at) as last_click_received
FROM users u
LEFT JOIN shortened_urls s ON u.id = s.user_id
GROUP BY u.id, u.email, u.username, u.subscription_tier;

-- View for popular URLs
CREATE OR REPLACE VIEW popular_urls AS
SELECT 
    s.id,
    s.identifier,
    s.keywords,
    s.original_url,
    s.title,
    s.click_count,
    s.unique_visitors,
    s.created_at,
    u.email as owner_email,
    u.username as owner_username
FROM shortened_urls s
JOIN users u ON s.user_id = u.id
WHERE s.is_active = true
    AND s.click_count > 0
ORDER BY s.click_count DESC;

-- View for recent analytics
CREATE OR REPLACE VIEW recent_analytics AS
SELECT 
    a.id,
    a.shortened_url_id,
    s.identifier,
    s.keywords,
    s.original_url,
    a.clicked_at,
    a.country_name,
    a.city,
    a.device_type,
    a.browser_name,
    a.is_bot,
    a.utm_source,
    a.utm_medium,
    a.utm_campaign
FROM analytics_events a
JOIN shortened_urls s ON a.shortened_url_id = s.id
WHERE a.clicked_at > NOW() - INTERVAL '7 days'
ORDER BY a.clicked_at DESC;

-- Materialized view for daily statistics (refreshed daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_statistics AS
SELECT 
    DATE(clicked_at) as date,
    shortened_url_id,
    COUNT(*) as clicks,
    COUNT(DISTINCT visitor_id) as unique_visitors,
    COUNT(DISTINCT country_code) as countries,
    COUNT(DISTINCT device_type) as device_types,
    AVG(response_time_ms) as avg_response_time,
    COUNT(CASE WHEN is_bot THEN 1 END) as bot_clicks,
    COUNT(CASE WHEN NOT is_bot THEN 1 END) as human_clicks
FROM analytics_events
WHERE clicked_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE(clicked_at), shortened_url_id;

-- Index for materialized view
CREATE INDEX idx_daily_statistics_date ON daily_statistics(date DESC);
CREATE INDEX idx_daily_statistics_url_id ON daily_statistics(shortened_url_id);

-- View for subscription usage
CREATE OR REPLACE VIEW subscription_usage AS
WITH plan_limits AS (
    SELECT 
        u.id as user_id,
        u.email,
        u.subscription_tier,
        sp.max_urls,
        sp.max_clicks_per_month,
        sp.max_custom_domains
    FROM users u
    JOIN subscription_plans sp ON u.subscription_tier = sp.name
),
usage_stats AS (
    SELECT 
        u.id as user_id,
        COUNT(DISTINCT s.id) as urls_used,
        COUNT(DISTINCT d.id) as domains_used,
        COALESCE(SUM(
            CASE 
                WHEN a.clicked_at >= DATE_TRUNC('month', NOW()) 
                THEN 1 
                ELSE 0 
            END
        ), 0) as clicks_this_month
    FROM users u
    LEFT JOIN shortened_urls s ON u.id = s.user_id AND s.is_active = true
    LEFT JOIN user_domains d ON u.id = d.user_id
    LEFT JOIN analytics_events a ON s.id = a.shortened_url_id
    GROUP BY u.id
)
SELECT 
    pl.*,
    us.urls_used,
    us.domains_used,
    us.clicks_this_month,
    CASE 
        WHEN pl.max_urls = -1 THEN NULL
        ELSE ROUND((us.urls_used::NUMERIC / pl.max_urls) * 100, 2)
    END as url_usage_percentage,
    CASE 
        WHEN pl.max_clicks_per_month = -1 THEN NULL
        ELSE ROUND((us.clicks_this_month::NUMERIC / pl.max_clicks_per_month) * 100, 2)
    END as click_usage_percentage
FROM plan_limits pl
JOIN usage_stats us ON pl.user_id = us.user_id;

-- View for expiring URLs (URLs expiring in next 7 days)
CREATE OR REPLACE VIEW expiring_urls AS
SELECT 
    s.id,
    s.identifier,
    s.keywords,
    s.original_url,
    s.expires_at,
    s.click_count,
    u.email as owner_email,
    (s.expires_at - NOW()) as time_until_expiry
FROM shortened_urls s
JOIN users u ON s.user_id = u.id
WHERE s.is_active = true
    AND s.expires_at IS NOT NULL
    AND s.expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY s.expires_at;

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_statistics;
END;
$$ LANGUAGE plpgsql;