import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

class MigrationRunner {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL || this.buildConnectionString(),
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        this.migrationsPath = path.join(__dirname, 'migrations');
    }

    buildConnectionString() {
        const host = process.env.DB_HOST || 'localhost';
        const port = process.env.DB_PORT || 5432;
        const database = process.env.DB_NAME || 'wordsto_link';
        const user = process.env.DB_USER || 'wordsto';
        const password = process.env.DB_PASSWORD || 'wordsto123';
        
        return `postgresql://${user}:${password}@${host}:${port}/${database}`;
    }

    async init() {
        try {
            await this.createMigrationsTable();
            console.log('✅ Migrations table ready');
        } catch (error) {
            console.error('❌ Failed to initialize migrations table:', error);
            throw error;
        }
    }

    async createMigrationsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) UNIQUE NOT NULL,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                execution_time_ms INTEGER,
                checksum VARCHAR(64)
            )`;
        
        await this.pool.query(query);
    }

    async getExecutedMigrations() {
        const result = await this.pool.query(
            'SELECT filename FROM migrations ORDER BY filename'
        );
        return new Set(result.rows.map(row => row.filename));
    }

    async getMigrationFiles() {
        const files = await fs.readdir(this.migrationsPath);
        return files
            .filter(file => file.endsWith('.sql'))
            .sort();
    }

    async calculateChecksum(content) {
        const crypto = await import('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    async runMigration(filename) {
        const filepath = path.join(this.migrationsPath, filename);
        const content = await fs.readFile(filepath, 'utf-8');
        const checksum = await this.calculateChecksum(content);
        
        const client = await this.pool.connect();
        const startTime = Date.now();
        
        try {
            await client.query('BEGIN');
            
            const existingMigration = await client.query(
                'SELECT checksum FROM migrations WHERE filename = $1',
                [filename]
            );
            
            if (existingMigration.rows.length > 0) {
                if (existingMigration.rows[0].checksum !== checksum) {
                    throw new Error(`Migration ${filename} has been modified after execution!`);
                }
                console.log(`⏭️  Skipping ${filename} (already executed)`);
                return false;
            }
            
            console.log(`🔄 Running migration: ${filename}`);
            
            // Execute the entire migration as a single statement
            // PostgreSQL can handle multiple statements in one query
            await client.query(content);
            
            const executionTime = Date.now() - startTime;
            
            await client.query(
                `INSERT INTO migrations (filename, execution_time_ms, checksum) 
                 VALUES ($1, $2, $3)`,
                [filename, executionTime, checksum]
            );
            
            await client.query('COMMIT');
            console.log(`✅ Completed ${filename} in ${executionTime}ms`);
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ Failed to run migration ${filename}:`, error.message);
            throw error;
        } finally {
            client.release();
        }
    }

    async runAll() {
        console.log('🚀 Starting database migrations...\n');
        
        try {
            await this.init();
            
            const migrationFiles = await this.getMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();
            
            const pendingMigrations = migrationFiles.filter(
                file => !executedMigrations.has(file)
            );
            
            if (pendingMigrations.length === 0) {
                console.log('✨ No pending migrations');
                return;
            }
            
            console.log(`Found ${pendingMigrations.length} pending migration(s)\n`);
            
            let successCount = 0;
            for (const migration of pendingMigrations) {
                const success = await this.runMigration(migration);
                if (success) successCount++;
            }
            
            console.log(`\n✅ Successfully ran ${successCount} migration(s)`);
        } catch (error) {
            console.error('\n❌ Migration failed:', error.message);
            process.exit(1);
        } finally {
            await this.pool.end();
        }
    }

    async rollback(filename) {
        console.log(`🔄 Rolling back migration: ${filename}`);
        
        try {
            await this.pool.query('DELETE FROM migrations WHERE filename = $1', [filename]);
            console.log(`✅ Removed ${filename} from migrations table`);
            console.log('⚠️  Note: This does not undo the SQL changes. Manual intervention may be required.');
        } catch (error) {
            console.error(`❌ Failed to rollback ${filename}:`, error.message);
            throw error;
        }
    }

    async status() {
        console.log('📊 Migration Status\n');
        
        try {
            await this.init();
            
            const migrationFiles = await this.getMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();
            
            const executedList = await this.pool.query(
                'SELECT filename, executed_at, execution_time_ms FROM migrations ORDER BY filename'
            );
            
            console.log('Executed Migrations:');
            if (executedList.rows.length === 0) {
                console.log('  None');
            } else {
                executedList.rows.forEach(row => {
                    const date = new Date(row.executed_at).toLocaleString();
                    console.log(`  ✅ ${row.filename} (${date}, ${row.execution_time_ms}ms)`);
                });
            }
            
            console.log('\nPending Migrations:');
            const pendingMigrations = migrationFiles.filter(
                file => !executedMigrations.has(file)
            );
            
            if (pendingMigrations.length === 0) {
                console.log('  None');
            } else {
                pendingMigrations.forEach(file => {
                    console.log(`  ⏳ ${file}`);
                });
            }
        } catch (error) {
            console.error('❌ Failed to get migration status:', error.message);
            process.exit(1);
        } finally {
            await this.pool.end();
        }
    }
}

const runner = new MigrationRunner();

const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
    case 'up':
    case 'run':
    case undefined:
        runner.runAll();
        break;
    case 'status':
        runner.status();
        break;
    case 'rollback':
        if (args[0]) {
            runner.rollback(args[0]);
        } else {
            console.error('Please specify a migration filename to rollback');
            process.exit(1);
        }
        break;
    default:
        console.log(`
Database Migration Tool

Commands:
  npm run db:migrate         Run all pending migrations
  npm run db:migrate status  Show migration status
  npm run db:migrate rollback <filename>  Remove migration from history

Examples:
  npm run db:migrate
  npm run db:migrate status
  npm run db:migrate rollback 001_initial_schema.sql
        `);
        process.exit(0);
}

export default MigrationRunner;