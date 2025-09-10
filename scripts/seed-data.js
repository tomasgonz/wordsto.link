#!/usr/bin/env node

import pg from 'pg';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';
import { faker } from '@faker-js/faker';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://wordsto:wordsto123@localhost:5432/wordsto_link'
});

const SAMPLE_DATA = {
    users: [
        {
            email: 'demo@wordsto.link',
            username: 'demo',
            full_name: 'Demo User',
            subscription_tier: 'business'
        },
        {
            email: 'john@example.com',
            username: 'johndoe',
            full_name: 'John Doe',
            subscription_tier: 'personal'
        },
        {
            email: 'jane@example.com',
            username: 'janesmith',
            full_name: 'Jane Smith',
            subscription_tier: 'free'
        }
    ],
    identifiers: [
        { username: 'demo', identifier: 'demo' },
        { username: 'demo', identifier: 'wordsto' },
        { username: 'johndoe', identifier: 'john' },
        { username: 'janesmith', identifier: 'jane' }
    ],
    urls: [
        {
            username: 'demo',
            identifier: 'demo',
            keywords: ['product', 'launch'],
            destination: 'https://example.com/product-launch',
            title: 'Product Launch 2024',
            description: 'Our biggest product launch of the year'
        },
        {
            username: 'demo',
            identifier: 'demo',
            keywords: ['blog', 'tech'],
            destination: 'https://example.com/blog/tech',
            title: 'Tech Blog',
            description: 'Latest technology insights and tutorials'
        },
        {
            username: 'demo',
            identifier: 'wordsto',
            keywords: ['docs'],
            destination: 'https://docs.wordsto.link',
            title: 'Documentation',
            description: 'Complete API and user documentation'
        },
        {
            username: 'demo',
            identifier: null,
            keywords: ['github'],
            destination: 'https://github.com/wordsto/wordsto.link',
            title: 'GitHub Repository',
            description: 'Open source repository'
        },
        {
            username: 'johndoe',
            identifier: 'john',
            keywords: ['portfolio'],
            destination: 'https://johndoe.com',
            title: 'Portfolio',
            description: 'Personal portfolio website'
        },
        {
            username: 'johndoe',
            identifier: 'john',
            keywords: ['resume'],
            destination: 'https://johndoe.com/resume.pdf',
            title: 'Resume',
            description: 'Professional resume'
        },
        {
            username: 'janesmith',
            identifier: null,
            keywords: ['contact'],
            destination: 'https://janesmith.com/contact',
            title: 'Contact Form',
            description: 'Get in touch'
        }
    ]
};

async function seedDatabase() {
    console.log('🌱 Starting database seeding...\n');

    try {
        // Check if data already exists
        const checkResult = await pool.query('SELECT COUNT(*) FROM users');
        if (parseInt(checkResult.rows[0].count) > 0) {
            console.log('⚠️  Database already contains data. Skipping seed to avoid duplicates.');
            console.log('   To reseed, clear the database first.\n');
            return;
        }

        console.log('👤 Creating users...');
        const userMap = {};
        
        for (const userData of SAMPLE_DATA.users) {
            const result = await pool.query(
                `INSERT INTO users (
                    clerk_user_id, email, username, full_name, 
                    subscription_tier, email_verified, created_at
                ) VALUES ($1, $2, $3, $4, $5, true, NOW())
                RETURNING id, username`,
                [
                    `clerk_${nanoid(24)}`,
                    userData.email,
                    userData.username,
                    userData.full_name,
                    userData.subscription_tier
                ]
            );
            userMap[userData.username] = result.rows[0].id;
            console.log(`   ✓ Created user: ${userData.email}`);
        }

        console.log('\n🏷️  Claiming identifiers...');
        for (const identifierData of SAMPLE_DATA.identifiers) {
            const userId = userMap[identifierData.username];
            await pool.query(
                `INSERT INTO user_identifiers (user_id, identifier, is_primary, claimed_at)
                 VALUES ($1, $2, false, NOW())`,
                [userId, identifierData.identifier]
            );
            console.log(`   ✓ ${identifierData.username} claimed: ${identifierData.identifier}`);
        }

        console.log('\n🔗 Creating shortened URLs...');
        for (const urlData of SAMPLE_DATA.urls) {
            const userId = userMap[urlData.username];
            const shortCode = nanoid(8);
            
            const result = await pool.query(
                `INSERT INTO shortened_urls (
                    user_id, identifier, keywords, original_url, short_code,
                    title, description, click_count, unique_visitors, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                RETURNING id`,
                [
                    userId,
                    urlData.identifier,
                    urlData.keywords,
                    urlData.destination,
                    shortCode,
                    urlData.title,
                    urlData.description,
                    Math.floor(Math.random() * 1000),
                    Math.floor(Math.random() * 500)
                ]
            );

            const urlId = result.rows[0].id;
            const path = urlData.identifier 
                ? `${urlData.identifier}/${urlData.keywords.join('/')}`
                : urlData.keywords.join('/');
            
            console.log(`   ✓ Created: wordsto.link/${path} → ${urlData.destination}`);

            // Add some sample analytics
            const numEvents = Math.floor(Math.random() * 20) + 5;
            for (let i = 0; i < numEvents; i++) {
                const clickedAt = faker.date.recent({ days: 30 });
                const country = faker.location.countryCode();
                const city = faker.location.city();
                
                await pool.query(
                    `INSERT INTO analytics_events (
                        shortened_url_id, visitor_id, ip_address,
                        country_code, country_name, city,
                        device_type, browser_name, os_name,
                        clicked_at, response_time_ms, is_bot
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        urlId,
                        nanoid(16),
                        faker.internet.ipv4(),
                        country,
                        faker.location.country(),
                        city,
                        faker.helpers.arrayElement(['desktop', 'mobile', 'tablet']),
                        faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge']),
                        faker.helpers.arrayElement(['Windows', 'Mac', 'Linux', 'iOS', 'Android']),
                        clickedAt,
                        Math.floor(Math.random() * 500) + 50,
                        Math.random() < 0.1
                    ]
                );
            }
        }

        console.log('\n📊 Generating additional sample data...');
        
        // Create more URLs for demo user
        const demoUserId = userMap['demo'];
        const categories = ['marketing', 'sales', 'support', 'docs', 'api'];
        const actions = ['signup', 'download', 'webinar', 'demo', 'pricing'];
        
        for (let i = 0; i < 20; i++) {
            const category = faker.helpers.arrayElement(categories);
            const action = faker.helpers.arrayElement(actions);
            const shortCode = nanoid(8);
            
            await pool.query(
                `INSERT INTO shortened_urls (
                    user_id, identifier, keywords, original_url, short_code,
                    title, description, click_count, unique_visitors, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    demoUserId,
                    'demo',
                    [category, action],
                    faker.internet.url(),
                    shortCode,
                    faker.company.catchPhrase(),
                    faker.lorem.sentence(),
                    Math.floor(Math.random() * 500),
                    Math.floor(Math.random() * 200),
                    faker.date.recent({ days: 60 })
                ]
            );
        }

        console.log(`   ✓ Created 20 additional URLs for demo user`);

        console.log('\n✅ Database seeding completed successfully!');
        console.log('\n📝 Test Credentials:');
        console.log('   Email: demo@wordsto.link');
        console.log('   Username: demo');
        console.log('   Plan: Business (unlimited URLs)\n');

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run seeding
seedDatabase();