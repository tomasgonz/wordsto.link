import dotenv from 'dotenv';
dotenv.config();

export const config = {
  app: {
    name: 'WordsTo.Link',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'wordsto_link',
    user: process.env.DB_USER || 'wordsto',
    password: process.env.DB_PASSWORD
  },
  
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    ttl: 300
  },
  
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: '7d',
    bcryptRounds: 10
  },
  
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: parseInt(process.env.RATE_LIMIT_TIME_WINDOW) || 60000
  },
  
  subscriptions: {
    free: {
      maxIdentifiers: 1,
      maxKeywords: parseInt(process.env.MAX_KEYWORDS_FREE) || 10,
      price: 0
    },
    personal: {
      maxIdentifiers: 1,
      maxKeywords: parseInt(process.env.MAX_KEYWORDS_PERSONAL) || 100,
      price: 5
    },
    business: {
      maxIdentifiers: 3,
      maxKeywords: parseInt(process.env.MAX_KEYWORDS_BUSINESS) || 1000,
      price: 15
    },
    enterprise: {
      maxIdentifiers: 10,
      maxKeywords: parseInt(process.env.MAX_KEYWORDS_ENTERPRISE) || 10000,
      price: 50
    }
  },
  
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  }
};