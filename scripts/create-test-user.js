import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createTestUser() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('Connected to database');

        // Test user credentials
        const email = 'test@example.com';
        const password = 'test123';
        const fullName = 'Test User';
        const identifier = 'testuser';

        // Hash the password
        const passwordHash = await bcrypt.hash(password, 10);

        // Check if user already exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            console.log('User already exists, updating password...');
            await client.query(
                'UPDATE users SET password_hash = $1, full_name = $2, identifier = $3 WHERE email = $4',
                [passwordHash, fullName, identifier, email]
            );
            console.log('✅ User password updated successfully!');
        } else {
            // Create new user
            await client.query(
                `INSERT INTO users (email, password_hash, full_name, identifier, subscription_tier, email_verified)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [email, passwordHash, fullName, identifier, 'free', true]
            );
            console.log('✅ Test user created successfully!');
        }

        console.log('\n📧 Login credentials:');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);

    } catch (error) {
        console.error('Error creating test user:', error);
    } finally {
        await client.end();
    }
}

createTestUser();