#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

console.log('🔄 Running database migrations...\n');

// Check if .env file exists
if (!existsSync(path.join(ROOT_DIR, '.env'))) {
    console.error('❌ .env file not found. Please copy .env.example to .env and configure it.');
    process.exit(1);
}

// Check if Docker is running
try {
    execSync('docker info', { stdio: 'ignore' });
} catch {
    console.log('⚠️  Docker is not running. Starting Docker services...');
    try {
        execSync('docker-compose up -d postgres', { cwd: ROOT_DIR, stdio: 'inherit' });
        console.log('⏳ Waiting for PostgreSQL to be ready...');
        execSync('sleep 5');
    } catch (error) {
        console.error('❌ Failed to start Docker services:', error.message);
        process.exit(1);
    }
}

// Wait for database to be ready
console.log('⏳ Checking database connection...');
let retries = 0;
const maxRetries = 10;

while (retries < maxRetries) {
    try {
        execSync('docker-compose exec -T postgres pg_isready -U wordsto -d wordsto_link', {
            cwd: ROOT_DIR,
            stdio: 'ignore'
        });
        console.log('✅ Database is ready!\n');
        break;
    } catch {
        retries++;
        if (retries === maxRetries) {
            console.error('❌ Database is not responding. Please check your Docker setup.');
            process.exit(1);
        }
        process.stdout.write('.');
        execSync('sleep 2');
    }
}

// Run migrations
try {
    console.log('🚀 Running migrations...\n');
    execSync('node src/db/migrate.js', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('\n✅ Migrations completed successfully!');
} catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
}