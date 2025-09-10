import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../../services/email.service.js';

export async function authRoutes(fastify, opts) {
    // Forgot password endpoint
    fastify.post('/auth/forgot-password', async (request, reply) => {
        const { email } = request.body;

        if (!email) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Email is required'
            });
        }

        try {
            // Check if user exists
            const userResult = await fastify.db.query(
                'SELECT id, email, full_name FROM users WHERE email = $1',
                [email]
            );

            // Always return success for security (don't reveal if email exists)
            if (userResult.rows.length === 0) {
                return reply.send({
                    success: true,
                    message: 'If an account exists with this email, you will receive a password reset link'
                });
            }

            const user = userResult.rows[0];
            const resetToken = uuidv4();
            const expiresAt = new Date(Date.now() + 3600000); // 1 hour

            // Store reset token
            await fastify.db.query(
                `INSERT INTO password_reset_tokens (user_id, token, expires_at) 
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id) 
                 DO UPDATE SET token = $2, expires_at = $3, created_at = NOW()`,
                [user.id, resetToken, expiresAt]
            );

            // Send password reset email
            await EmailService.sendPasswordResetEmail(user, resetToken);
            fastify.log.info(`Password reset email sent to user ${user.id}`);

            return reply.send({
                success: true,
                message: 'If an account exists with this email, you will receive a password reset link'
            });

        } catch (error) {
            fastify.log.error('Forgot password error:', error);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Failed to process password reset request'
            });
        }
    });

    // Reset password endpoint
    fastify.post('/auth/reset-password', async (request, reply) => {
        const { token, password } = request.body;

        if (!token || !password) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Token and password are required'
            });
        }

        try {
            // Check if token is valid
            const tokenResult = await fastify.db.query(
                `SELECT prt.*, u.email 
                 FROM password_reset_tokens prt
                 JOIN users u ON prt.user_id = u.id
                 WHERE prt.token = $1 AND prt.expires_at > NOW()`,
                [token]
            );

            if (tokenResult.rows.length === 0) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Bad Request',
                    message: 'Invalid or expired reset token'
                });
            }

            const resetToken = tokenResult.rows[0];
            const hashedPassword = await bcrypt.hash(password, 10);

            // Update user password
            await fastify.db.query(
                'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
                [hashedPassword, resetToken.user_id]
            );

            // Delete used token
            await fastify.db.query(
                'DELETE FROM password_reset_tokens WHERE token = $1',
                [token]
            );

            fastify.log.info(`Password reset successful for user ${resetToken.user_id}`);

            return reply.send({
                success: true,
                message: 'Password has been reset successfully'
            });

        } catch (error) {
            fastify.log.error('Reset password error:', error);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Failed to reset password'
            });
        }
    });

    // Verify email endpoint
    fastify.post('/auth/verify-email', async (request, reply) => {
        const { token } = request.body;

        if (!token) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Verification token is required'
            });
        }

        try {
            // Check if token is valid
            const tokenResult = await fastify.db.query(
                `SELECT evt.*, u.email 
                 FROM email_verification_tokens evt
                 JOIN users u ON evt.user_id = u.id
                 WHERE evt.token = $1 AND evt.expires_at > NOW()`,
                [token]
            );

            if (tokenResult.rows.length === 0) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: 'Bad Request',
                    message: 'Invalid or expired verification token'
                });
            }

            const verificationToken = tokenResult.rows[0];

            // Mark email as verified
            await fastify.db.query(
                'UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE id = $1',
                [verificationToken.user_id]
            );

            // Delete used token
            await fastify.db.query(
                'DELETE FROM email_verification_tokens WHERE token = $1',
                [token]
            );

            // Get user details for welcome email
            const userResult = await fastify.db.query(
                'SELECT * FROM users WHERE id = $1',
                [verificationToken.user_id]
            );

            if (userResult.rows.length > 0) {
                // Send welcome email
                await EmailService.sendWelcomeEmail(userResult.rows[0]);
            }

            fastify.log.info(`Email verified for user ${verificationToken.user_id}`);

            return reply.send({
                success: true,
                message: 'Email has been verified successfully'
            });

        } catch (error) {
            fastify.log.error('Email verification error:', error);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Failed to verify email'
            });
        }
    });

    // Login endpoint
    fastify.post('/auth/login', async (request, reply) => {
        const { email, password } = request.body;

        if (!email || !password) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Email and password are required'
            });
        }

        try {
            const userResult = await fastify.db.query(
                'SELECT id, email, password_hash, full_name, identifier, subscription_tier FROM users WHERE email = $1',
                [email]
            );

            if (userResult.rows.length === 0) {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Invalid email or password'
                });
            }

            const user = userResult.rows[0];
            const validPassword = await bcrypt.compare(password, user.password_hash);

            if (!validPassword) {
                return reply.status(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Invalid email or password'
                });
            }

            // Update last login
            await fastify.db.query(
                'UPDATE users SET last_login_at = NOW() WHERE id = $1',
                [user.id]
            );

            // Generate JWT token
            const token = fastify.jwt.sign({
                id: user.id,
                email: user.email,
                subscription_tier: user.subscription_tier
            });

            return reply.send({
                success: true,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    identifier: user.identifier,
                    subscription_tier: user.subscription_tier
                }
            });

        } catch (error) {
            fastify.log.error('Login error:', error);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Failed to login'
            });
        }
    });

    // Signup endpoint
    fastify.post('/auth/signup', async (request, reply) => {
        const { email, password, full_name, identifier } = request.body;

        if (!email || !password) {
            return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Email and password are required'
            });
        }

        try {
            // Check if user exists
            const existingUser = await fastify.db.query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                return reply.status(409).send({
                    statusCode: 409,
                    error: 'Conflict',
                    message: 'User with this email already exists'
                });
            }

            // Check if identifier is taken
            if (identifier) {
                const existingIdentifier = await fastify.db.query(
                    'SELECT id FROM users WHERE identifier = $1',
                    [identifier]
                );

                if (existingIdentifier.rows.length > 0) {
                    return reply.status(409).send({
                        statusCode: 409,
                        error: 'Conflict',
                        message: 'This identifier is already taken'
                    });
                }
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            const userId = uuidv4();

            // Create user
            const userResult = await fastify.db.query(
                `INSERT INTO users (id, email, password_hash, full_name, identifier, subscription_tier)
                 VALUES ($1, $2, $3, $4, $5, 'free')
                 RETURNING id, email, full_name, identifier, subscription_tier`,
                [userId, email, hashedPassword, full_name, identifier || email.split('@')[0]]
            );

            const user = userResult.rows[0];

            // Generate verification token
            const verificationToken = uuidv4();
            const expiresAt = new Date(Date.now() + 86400000); // 24 hours

            await fastify.db.query(
                `INSERT INTO email_verification_tokens (user_id, token, expires_at)
                 VALUES ($1, $2, $3)`,
                [user.id, verificationToken, expiresAt]
            );

            // Send verification email
            await EmailService.sendVerificationEmail(user, verificationToken);
            fastify.log.info(`Verification email sent to ${user.email}`);

            // Generate JWT token
            const token = fastify.jwt.sign({
                id: user.id,
                email: user.email,
                subscription_tier: user.subscription_tier
            });

            return reply.status(201).send({
                success: true,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    identifier: user.identifier,
                    subscription_tier: user.subscription_tier
                }
            });

        } catch (error) {
            fastify.log.error('Signup error:', error);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Failed to create account'
            });
        }
    });

    // Check identifier availability
    fastify.get('/auth/check-identifier/:identifier', async (request, reply) => {
        const { identifier } = request.params;

        try {
            const result = await fastify.db.query(
                'SELECT id FROM users WHERE identifier = $1',
                [identifier]
            );

            return reply.send({
                available: result.rows.length === 0
            });

        } catch (error) {
            fastify.log.error('Check identifier error:', error);
            return reply.status(500).send({
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Failed to check identifier availability'
            });
        }
    });
}