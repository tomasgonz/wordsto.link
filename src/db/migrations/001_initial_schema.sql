-- Migration: 001_initial_schema
-- Created at: 2025-01-01
-- Description: Initial database schema for wordsto.link

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Users table (integrated with Clerk authentication)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    subscription_status VARCHAR(50) DEFAULT 'active',
    subscription_expires_at TIMESTAMP,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Shortened URLs table with flexible keyword support
CREATE TABLE IF NOT EXISTS shortened_urls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    identifier VARCHAR(100),
    keywords TEXT[] NOT NULL,
    original_url TEXT NOT NULL,
    short_code VARCHAR(20) UNIQUE,
    title VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    click_count BIGINT DEFAULT 0,
    unique_visitors BIGINT DEFAULT 0,
    last_clicked_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    custom_metadata JSONB DEFAULT '{}',
    qr_code_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_keywords_not_empty CHECK (array_length(keywords, 1) > 0),
    CONSTRAINT unique_identifier_keywords UNIQUE NULLS NOT DISTINCT (identifier, keywords)
);

-- Analytics events table for detailed click tracking
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shortened_url_id UUID NOT NULL REFERENCES shortened_urls(id) ON DELETE CASCADE,
    visitor_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    referer TEXT,
    country_code VARCHAR(2),
    country_name VARCHAR(100),
    city VARCHAR(100),
    region VARCHAR(100),
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(100),
    device_type VARCHAR(50),
    browser_name VARCHAR(50),
    browser_version VARCHAR(50),
    os_name VARCHAR(50),
    os_version VARCHAR(50),
    is_bot BOOLEAN DEFAULT false,
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    utm_term VARCHAR(255),
    utm_content VARCHAR(255),
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INTEGER
);

-- User domains table (for custom domains feature)
CREATE TABLE IF NOT EXISTS user_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain VARCHAR(255) UNIQUE NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    ssl_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE
);

-- API keys table for programmatic access
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    last_four VARCHAR(4) NOT NULL,
    permissions JSONB DEFAULT '{"read": true, "write": true}',
    rate_limit INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscription plans reference table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    price_monthly DECIMAL(10, 2),
    price_yearly DECIMAL(10, 2),
    max_urls INTEGER,
    max_clicks_per_month BIGINT,
    max_custom_domains INTEGER DEFAULT 0,
    max_team_members INTEGER DEFAULT 1,
    features JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    stripe_price_id_monthly VARCHAR(255),
    stripe_price_id_yearly VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Team members table (for business/enterprise plans)
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    permissions JSONB DEFAULT '{}',
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    joined_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_team_member UNIQUE (team_owner_id, member_user_id)
);

-- Insert default subscription plans
INSERT INTO subscription_plans (name, display_name, price_monthly, price_yearly, max_urls, max_clicks_per_month, max_custom_domains, max_team_members, features) VALUES
('free', 'Free', 0, 0, 10, 1000, 0, 1, '{"analytics": "basic", "api_access": false, "custom_domains": false, "team_collaboration": false, "priority_support": false}'),
('personal', 'Personal', 5, 50, 100, 10000, 0, 1, '{"analytics": "detailed", "api_access": true, "custom_domains": false, "team_collaboration": false, "priority_support": false}'),
('business', 'Business', 15, 150, 1000, 100000, 3, 5, '{"analytics": "advanced", "api_access": true, "custom_domains": true, "team_collaboration": true, "priority_support": true, "white_label": false}'),
('enterprise', 'Enterprise', 50, 500, -1, -1, -1, -1, '{"analytics": "advanced", "api_access": true, "custom_domains": true, "team_collaboration": true, "priority_support": true, "white_label": true, "sla": true, "dedicated_support": true}')
ON CONFLICT (name) DO NOTHING;

-- Create update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shortened_urls_updated_at BEFORE UPDATE ON shortened_urls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();