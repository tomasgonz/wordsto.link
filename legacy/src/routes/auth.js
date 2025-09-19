import bcrypt from 'bcrypt';
import jwt from '@fastify/jwt';

export async function authRouter(fastify, opts) {
  await fastify.register(jwt, {
    secret: fastify.config.JWT_SECRET
  });

  fastify.post('/register', async (request, reply) => {
    const { email, password, username } = request.body;
    
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }
    
    const existingUser = await fastify.pg.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUser.rows.length > 0) {
      return reply.code(409).send({ error: 'User already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await fastify.pg.query(
      'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username, subscription_tier',
      [email, passwordHash, username]
    );
    
    const user = result.rows[0];
    const token = fastify.jwt.sign({ 
      id: user.id, 
      email: user.email,
      subscription_tier: user.subscription_tier 
    });
    
    return { 
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        subscription_tier: user.subscription_tier
      },
      token 
    };
  });

  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body;
    
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }
    
    const result = await fastify.pg.query(
      'SELECT id, email, username, password_hash, subscription_tier FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    
    const token = fastify.jwt.sign({ 
      id: user.id, 
      email: user.email,
      subscription_tier: user.subscription_tier 
    });
    
    return { 
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        subscription_tier: user.subscription_tier
      },
      token 
    };
  });

  fastify.get('/me', async (request, reply) => {
    try {
      await request.jwtVerify();
      
      const result = await fastify.pg.query(
        'SELECT id, email, username, subscription_tier, created_at FROM users WHERE id = $1',
        [request.user.id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }
      
      return { user: result.rows[0] };
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.post('/refresh', async (request, reply) => {
    try {
      await request.jwtVerify();
      
      const token = fastify.jwt.sign({ 
        id: request.user.id, 
        email: request.user.email,
        subscription_tier: request.user.subscription_tier 
      });
      
      return { token };
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
}

