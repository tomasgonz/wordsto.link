-- Migration: 003_add_functions
-- Created at: 2025-01-01
-- Description: Add utility functions and stored procedures

-- Function to generate a unique short code
CREATE OR REPLACE FUNCTION generate_short_code(length INT DEFAULT 6)
RETURNS VARCHAR AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR := '';
    i INT;
    max_attempts INT := 10;
    attempt INT := 0;
BEGIN
    WHILE attempt < max_attempts LOOP
        result := '';
        FOR i IN 1..length LOOP
            result := result || substr(chars, floor(random() * length(chars))::INT + 1, 1);
        END LOOP;
        
        -- Check if the short code already exists
        IF NOT EXISTS (SELECT 1 FROM shortened_urls WHERE short_code = result) THEN
            RETURN result;
        END IF;
        
        attempt := attempt + 1;
    END LOOP;
    
    -- If we couldn't generate a unique code, return NULL
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to validate URL format
CREATE OR REPLACE FUNCTION is_valid_url(url TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN url ~* '^https?://[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(/.*)?$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to clean and normalize keywords
CREATE OR REPLACE FUNCTION normalize_keywords(keywords TEXT[])
RETURNS TEXT[] AS $$
DECLARE
    normalized TEXT[];
    keyword TEXT;
BEGIN
    normalized := ARRAY[]::TEXT[];
    
    FOREACH keyword IN ARRAY keywords LOOP
        -- Convert to lowercase, trim whitespace, remove special characters
        keyword := lower(trim(keyword));
        keyword := regexp_replace(keyword, '[^a-z0-9_-]', '', 'g');
        
        -- Only add non-empty keywords
        IF length(keyword) > 0 THEN
            normalized := array_append(normalized, keyword);
        END IF;
    END LOOP;
    
    -- Remove duplicates and return
    RETURN ARRAY(SELECT DISTINCT unnest(normalized));
END;
$$ LANGUAGE plpgsql;

-- Function to check user's URL limit based on subscription
CREATE OR REPLACE FUNCTION check_user_url_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_tier VARCHAR(50);
    current_count INT;
    max_allowed INT;
BEGIN
    -- Get user's subscription tier
    SELECT subscription_tier INTO user_tier
    FROM users WHERE id = p_user_id;
    
    IF user_tier IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get max URLs allowed for the tier
    SELECT max_urls INTO max_allowed
    FROM subscription_plans WHERE name = user_tier;
    
    -- -1 means unlimited
    IF max_allowed = -1 THEN
        RETURN TRUE;
    END IF;
    
    -- Count current active URLs
    SELECT COUNT(*) INTO current_count
    FROM shortened_urls 
    WHERE user_id = p_user_id AND is_active = true;
    
    RETURN current_count < max_allowed;
END;
$$ LANGUAGE plpgsql;

-- Function to get analytics summary for a URL
CREATE OR REPLACE FUNCTION get_url_analytics_summary(p_url_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE (
    total_clicks BIGINT,
    unique_visitors BIGINT,
    top_country VARCHAR(100),
    top_referrer TEXT,
    top_device VARCHAR(50),
    avg_response_time NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_clicks,
        COUNT(DISTINCT visitor_id)::BIGINT as unique_visitors,
        (SELECT country_name FROM analytics_events 
         WHERE shortened_url_id = p_url_id 
         AND clicked_at > NOW() - (p_days || ' days')::INTERVAL
         GROUP BY country_name 
         ORDER BY COUNT(*) DESC 
         LIMIT 1) as top_country,
        (SELECT referer FROM analytics_events 
         WHERE shortened_url_id = p_url_id 
         AND referer IS NOT NULL
         AND clicked_at > NOW() - (p_days || ' days')::INTERVAL
         GROUP BY referer 
         ORDER BY COUNT(*) DESC 
         LIMIT 1) as top_referrer,
        (SELECT device_type FROM analytics_events 
         WHERE shortened_url_id = p_url_id 
         AND clicked_at > NOW() - (p_days || ' days')::INTERVAL
         GROUP BY device_type 
         ORDER BY COUNT(*) DESC 
         LIMIT 1) as top_device,
        AVG(response_time_ms)::NUMERIC(10,2) as avg_response_time
    FROM analytics_events
    WHERE shortened_url_id = p_url_id 
    AND clicked_at > NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired URLs
CREATE OR REPLACE FUNCTION cleanup_expired_urls()
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    UPDATE shortened_urls
    SET is_active = false
    WHERE expires_at < NOW() AND is_active = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to normalize keywords before insert/update
CREATE OR REPLACE FUNCTION normalize_keywords_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.keywords := normalize_keywords(NEW.keywords);
    
    -- Ensure keywords array is not empty
    IF array_length(NEW.keywords, 1) IS NULL OR array_length(NEW.keywords, 1) = 0 THEN
        RAISE EXCEPTION 'Keywords array cannot be empty';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_keywords_before_insert
    BEFORE INSERT ON shortened_urls
    FOR EACH ROW
    EXECUTE FUNCTION normalize_keywords_trigger();

CREATE TRIGGER normalize_keywords_before_update
    BEFORE UPDATE OF keywords ON shortened_urls
    FOR EACH ROW
    EXECUTE FUNCTION normalize_keywords_trigger();

-- Trigger to validate URL format
CREATE OR REPLACE FUNCTION validate_url_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT is_valid_url(NEW.original_url) THEN
        RAISE EXCEPTION 'Invalid URL format: %', NEW.original_url;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_url_before_insert
    BEFORE INSERT ON shortened_urls
    FOR EACH ROW
    EXECUTE FUNCTION validate_url_trigger();

CREATE TRIGGER validate_url_before_update
    BEFORE UPDATE OF original_url ON shortened_urls
    FOR EACH ROW
    EXECUTE FUNCTION validate_url_trigger();

-- Trigger to auto-generate short code if not provided
CREATE OR REPLACE FUNCTION auto_generate_short_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.short_code IS NULL THEN
        NEW.short_code := generate_short_code(6);
        
        -- If we still couldn't generate a unique code, try with 7 characters
        IF NEW.short_code IS NULL THEN
            NEW.short_code := generate_short_code(7);
        END IF;
        
        -- If still null, use UUID-based approach
        IF NEW.short_code IS NULL THEN
            NEW.short_code := substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_generate_short_code_before_insert
    BEFORE INSERT ON shortened_urls
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_short_code();