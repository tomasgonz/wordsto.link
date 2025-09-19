-- Archived legacy schema for links/click_analytics
-- Kept for reference; the active schema is under src/db/migrations

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    subscription_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Links table with flexible keyword array support
CREATE TABLE IF NOT EXISTS links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    identifier VARCHAR(100),
    keywords TEXT[] NOT NULL,
    destination_url TEXT NOT NULL,
    title VARCHAR(255),
    description TEXT,
    click_count INTEGER DEFAULT 0,
    last_clicked TIMESTAMP,
    active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_identifier_keywords UNIQUE (identifier, keywords)
);

-- Click analytics table
CREATE TABLE IF NOT EXISTS click_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID REFERENCES links(id) ON DELETE CASCADE,
    clicked_at TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    referrer TEXT,
    country VARCHAR(2),
    city VARCHAR(100)
);

-- Indexes for performance
CREATE INDEX idx_links_identifier ON links(identifier);
CREATE INDEX idx_links_keywords ON links USING GIN(keywords);
CREATE INDEX idx_links_user_id ON links(user_id);
CREATE INDEX idx_links_active ON links(active);
CREATE INDEX idx_click_analytics_link_id ON click_analytics(link_id);
CREATE INDEX idx_click_analytics_clicked_at ON click_analytics(clicked_at);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);

