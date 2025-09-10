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

-- User identifiers table (for managing multiple identifiers per user)
CREATE TABLE IF NOT EXISTS user_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    identifier VARCHAR(100) UNIQUE NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    price_monthly DECIMAL(10, 2),
    max_identifiers INTEGER DEFAULT 1,
    max_keywords INTEGER DEFAULT 10,
    features JSONB,
    active BOOLEAN DEFAULT true
);

-- Payment history table
CREATE TABLE IF NOT EXISTS payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_payment_id VARCHAR(255),
    amount DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
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

-- Insert default subscription plans
INSERT INTO subscription_plans (name, price_monthly, max_identifiers, max_keywords, features) VALUES
('free', 0, 1, 10, '{"analytics": false, "custom_domains": false, "api_access": false}'),
('personal', 5, 1, 100, '{"analytics": true, "custom_domains": false, "api_access": false}'),
('business', 15, 3, 1000, '{"analytics": true, "custom_domains": true, "api_access": true, "team_members": 5}'),
('enterprise', 50, 10, 10000, '{"analytics": true, "custom_domains": true, "api_access": true, "team_members": -1, "priority_support": true}')
ON CONFLICT (name) DO NOTHING;