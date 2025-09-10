-- Migration: 005_add_user_fields
-- Created at: 2025-01-01
-- Description: Add fields for Clerk integration and identifier ownership

-- Add new columns to users table for better Clerk integration
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create user_identifiers table for managing claimed identifiers
CREATE TABLE IF NOT EXISTS user_identifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    identifier VARCHAR(100) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- Create partial unique index for active identifiers
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_identifier 
ON user_identifiers(identifier) 
WHERE is_active = true;

-- Create index for faster identifier lookups
CREATE INDEX IF NOT EXISTS idx_user_identifiers_identifier_active 
ON user_identifiers(identifier) 
WHERE is_active = true;

-- Create table for tracking user sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clerk_session_id VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_clerk_session_id ON user_sessions(clerk_session_id);

-- Create table for user activity logs
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX idx_user_activity_logs_created_at ON user_activity_logs(created_at DESC);

-- Create view for user statistics with identifier info
CREATE OR REPLACE VIEW user_stats_with_identifiers AS
SELECT 
    u.id,
    u.clerk_user_id,
    u.email,
    u.username,
    u.subscription_tier,
    u.created_at,
    COUNT(DISTINCT s.id) as total_urls,
    COUNT(DISTINCT s.id) FILTER (WHERE s.is_active = true) as active_urls,
    COALESCE(SUM(s.click_count), 0) as total_clicks,
    COALESCE(SUM(s.unique_visitors), 0) as total_visitors,
    COUNT(DISTINCT ui.identifier) as total_identifiers,
    array_agg(DISTINCT ui.identifier) FILTER (WHERE ui.identifier IS NOT NULL) as identifiers
FROM users u
LEFT JOIN shortened_urls s ON u.id = s.user_id
LEFT JOIN user_identifiers ui ON u.id = ui.user_id AND ui.is_active = true
GROUP BY u.id, u.clerk_user_id, u.email, u.username, u.subscription_tier, u.created_at;

-- Function to check identifier availability
CREATE OR REPLACE FUNCTION check_identifier_availability(
    p_identifier VARCHAR(100),
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    is_available BOOLEAN,
    owner_id UUID,
    claimed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN ui.user_id IS NULL THEN true
            WHEN ui.user_id = p_user_id THEN true
            ELSE false
        END as is_available,
        ui.user_id as owner_id,
        ui.claimed_at
    FROM (
        SELECT user_id, claimed_at 
        FROM user_identifiers 
        WHERE identifier = p_identifier AND is_active = true
        LIMIT 1
    ) ui
    RIGHT JOIN (SELECT 1) dummy ON true;
END;
$$ LANGUAGE plpgsql;

-- Function to claim an identifier
CREATE OR REPLACE FUNCTION claim_identifier(
    p_user_id UUID,
    p_identifier VARCHAR(100)
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_existing_owner UUID;
    v_user_identifier_count INTEGER;
    v_max_identifiers INTEGER;
BEGIN
    -- Check if identifier is already claimed
    SELECT user_id INTO v_existing_owner
    FROM user_identifiers
    WHERE identifier = p_identifier AND is_active = true;
    
    IF v_existing_owner IS NOT NULL THEN
        IF v_existing_owner = p_user_id THEN
            RETURN QUERY SELECT true, 'You already own this identifier';
        ELSE
            RETURN QUERY SELECT false, 'Identifier is already claimed by another user';
        END IF;
    END IF;
    
    -- Check user's identifier limit
    SELECT COUNT(*), sp.max_identifiers 
    INTO v_user_identifier_count, v_max_identifiers
    FROM users u
    JOIN subscription_plans sp ON u.subscription_tier = sp.name
    LEFT JOIN user_identifiers ui ON u.id = ui.user_id AND ui.is_active = true
    WHERE u.id = p_user_id
    GROUP BY sp.max_identifiers;
    
    IF v_max_identifiers != -1 AND v_user_identifier_count >= v_max_identifiers THEN
        RETURN QUERY SELECT false, format('You have reached your limit of %s identifiers', v_max_identifiers);
    END IF;
    
    -- Claim the identifier
    INSERT INTO user_identifiers (user_id, identifier, is_primary, claimed_at)
    VALUES (p_user_id, p_identifier, false, NOW());
    
    RETURN QUERY SELECT true, 'Identifier claimed successfully';
END;
$$ LANGUAGE plpgsql;

-- Function to release an identifier
CREATE OR REPLACE FUNCTION release_identifier(
    p_user_id UUID,
    p_identifier VARCHAR(100)
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_has_urls BOOLEAN;
BEGIN
    -- Check if user owns the identifier
    IF NOT EXISTS (
        SELECT 1 FROM user_identifiers 
        WHERE user_id = p_user_id AND identifier = p_identifier AND is_active = true
    ) THEN
        RETURN QUERY SELECT false, 'You do not own this identifier';
    END IF;
    
    -- Check if there are active URLs using this identifier
    SELECT EXISTS (
        SELECT 1 FROM shortened_urls 
        WHERE user_id = p_user_id AND identifier = p_identifier AND is_active = true
    ) INTO v_has_urls;
    
    IF v_has_urls THEN
        RETURN QUERY SELECT false, 'Cannot release identifier with active URLs';
    END IF;
    
    -- Release the identifier
    UPDATE user_identifiers 
    SET is_active = false, released_at = NOW()
    WHERE user_id = p_user_id AND identifier = p_identifier;
    
    RETURN QUERY SELECT true, 'Identifier released successfully';
END;
$$ LANGUAGE plpgsql;