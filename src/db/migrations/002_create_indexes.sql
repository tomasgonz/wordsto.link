-- Migration: 002_create_indexes
-- Created at: 2025-01-01
-- Description: Create indexes for optimal query performance

-- Primary indexes for shortened_urls table
CREATE INDEX idx_shortened_urls_user_id ON shortened_urls(user_id);
CREATE INDEX idx_shortened_urls_identifier ON shortened_urls(identifier) WHERE identifier IS NOT NULL;
CREATE INDEX idx_shortened_urls_short_code ON shortened_urls(short_code);
CREATE INDEX idx_shortened_urls_is_active ON shortened_urls(is_active);
CREATE INDEX idx_shortened_urls_created_at ON shortened_urls(created_at DESC);
CREATE INDEX idx_shortened_urls_expires_at ON shortened_urls(expires_at) WHERE expires_at IS NOT NULL;

-- GIN index for keywords array - critical for array containment queries
CREATE INDEX idx_shortened_urls_keywords_gin ON shortened_urls USING GIN(keywords);

-- Composite index for the most common query pattern
CREATE INDEX idx_shortened_urls_identifier_keywords ON shortened_urls(identifier, keywords) WHERE is_active = true;

-- Full text search indexes for title and description
CREATE INDEX idx_shortened_urls_title_trgm ON shortened_urls USING GIN(title gin_trgm_ops);
CREATE INDEX idx_shortened_urls_description_trgm ON shortened_urls USING GIN(description gin_trgm_ops);

-- Analytics events indexes
CREATE INDEX idx_analytics_events_shortened_url_id ON analytics_events(shortened_url_id);
CREATE INDEX idx_analytics_events_clicked_at ON analytics_events(clicked_at DESC);
CREATE INDEX idx_analytics_events_visitor_id ON analytics_events(visitor_id);
CREATE INDEX idx_analytics_events_country_code ON analytics_events(country_code);
CREATE INDEX idx_analytics_events_device_type ON analytics_events(device_type);
CREATE INDEX idx_analytics_events_is_bot ON analytics_events(is_bot);

-- Composite index for analytics queries
CREATE INDEX idx_analytics_events_url_date ON analytics_events(shortened_url_id, clicked_at DESC);
CREATE INDEX idx_analytics_events_utm ON analytics_events(utm_source, utm_medium, utm_campaign) WHERE utm_source IS NOT NULL;

-- Users table indexes
CREATE INDEX idx_users_clerk_user_id ON users(clerk_user_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;
CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- API keys indexes
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

-- User domains indexes
CREATE INDEX idx_user_domains_user_id ON user_domains(user_id);
CREATE INDEX idx_user_domains_domain ON user_domains(domain);
CREATE INDEX idx_user_domains_is_verified ON user_domains(is_verified);

-- Team members indexes
CREATE INDEX idx_team_members_team_owner_id ON team_members(team_owner_id);
CREATE INDEX idx_team_members_member_user_id ON team_members(member_user_id);

-- Partial indexes for common queries
CREATE INDEX idx_active_urls_by_user ON shortened_urls(user_id, created_at DESC) WHERE is_active = true;
CREATE INDEX idx_expired_urls ON shortened_urls(expires_at) WHERE expires_at IS NOT NULL AND is_active = true;
CREATE INDEX idx_popular_urls ON shortened_urls(click_count DESC) WHERE click_count > 100;

-- Index for finding URLs by keyword combinations
CREATE INDEX idx_shortened_urls_keywords_btree ON shortened_urls USING BTREE(keywords) WHERE is_active = true;