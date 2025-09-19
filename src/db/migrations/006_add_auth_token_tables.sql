-- Migration: 006_add_auth_token_tables
-- Created at: 2025-01-01
-- Description: Add email_verification_tokens and password_reset_tokens tables

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token UUID PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
ON email_verification_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
ON email_verification_tokens(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token UUID PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
ON password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
ON password_reset_tokens(expires_at);

