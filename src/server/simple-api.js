import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://wordsto:wordsto123@localhost:5433/wordsto_link'
});

// Middleware
app.use(cors());
app.use(express.json());

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

// Helper function to generate short code
function generateShortCode(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Auth middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      // For now, allow unauthenticated requests but set user as null
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create URL
app.post('/api/urls', authenticate, async (req, res) => {
  try {
    const { identifier, keywords, originalUrl, title, description, expiresAt, isActive, userId } = req.body;

    // For now, create a simple URL record
    const shortCode = generateShortCode();
    
    const query = `
      INSERT INTO shortened_urls (
        user_id, identifier, keywords, original_url, short_code, 
        title, description, is_active, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING *
    `;

    // Use a default user ID if not authenticated
    const actualUserId = userId || req.user?.id || uuidv4();

    const values = [
      actualUserId,
      identifier || null,
      keywords || [],
      originalUrl,
      shortCode,
      title || null,
      description || null,
      isActive !== false,
      expiresAt || null
    ];

    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      data: result.rows[0],
      shortUrl: `https://wordsto.link/${identifier ? identifier + '/' : ''}${keywords.join('/')}`
    });
  } catch (error) {
    console.error('Error creating URL:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create URL',
      message: error.message 
    });
  }
});

// Get URLs for user
app.get('/api/urls', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    
    if (!userId) {
      return res.json({ success: true, data: [] });
    }

    const query = `
      SELECT * FROM shortened_urls 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50
    `;

    const result = await pool.query(query, [userId]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching URLs:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch URLs',
      message: error.message 
    });
  }
});

// User signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, identifier } = req.body;

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'User already exists'
      });
    }

    // Check if identifier is taken
    if (identifier) {
      const existingIdentifier = await pool.query(
        'SELECT id FROM users WHERE identifier = $1',
        [identifier]
      );

      if (existingIdentifier.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Identifier already taken'
        });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const query = `
      INSERT INTO users (email, password_hash, full_name, identifier, subscription_tier)
      VALUES ($1, $2, $3, $4, 'free')
      RETURNING id, email, full_name, identifier, created_at
    `;

    const result = await pool.query(query, [email, hashedPassword, name, identifier]);
    const user = result.rows[0];

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        identifier: user.identifier,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Error signing up:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create account',
      message: error.message 
    });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name, identifier FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        identifier: user.identifier
      }
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to login',
      message: error.message 
    });
  }
});

// Check identifier availability
app.get('/api/auth/check-identifier/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    const result = await pool.query(
      'SELECT id FROM users WHERE identifier = $1',
      [identifier]
    );

    res.json({
      available: result.rows.length === 0
    });
  } catch (error) {
    console.error('Error checking identifier:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check identifier'
    });
  }
});

// Note: The redirect handler for short URLs would typically be on a separate service
// For now, we're focusing on the API endpoints only

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Simple API server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});