#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const REQUIRED_VARS = {
    // Server
    NODE_ENV: {
        description: 'Node environment',
        example: 'development',
        validator: (val) => ['development', 'production', 'test'].includes(val)
    },
    PORT: {
        description: 'Server port',
        example: '3000',
        validator: (val) => !isNaN(parseInt(val)) && parseInt(val) > 0
    },
    
    // Database
    DATABASE_URL: {
        description: 'PostgreSQL connection string',
        example: 'postgresql://user:pass@localhost:5432/dbname',
        validator: (val) => val.startsWith('postgresql://')
    },
    
    // Redis
    REDIS_URL: {
        description: 'Redis connection string',
        example: 'redis://localhost:6379',
        validator: (val) => val.startsWith('redis://')
    },
    
    // Clerk (for production)
    CLERK_SECRET_KEY: {
        description: 'Clerk secret key',
        example: 'sk_test_...',
        validator: (val) => val.startsWith('sk_'),
        required: (env) => env.NODE_ENV === 'production'
    },
    CLERK_WEBHOOK_SECRET: {
        description: 'Clerk webhook secret',
        example: 'whsec_...',
        validator: (val) => val.startsWith('whsec_'),
        required: (env) => env.NODE_ENV === 'production'
    },
    
    // JWT
    JWT_SECRET: {
        description: 'JWT secret for API keys',
        example: 'your-super-secret-jwt-key',
        validator: (val) => val.length >= 32,
        sensitive: true
    }
};

const OPTIONAL_VARS = {
    // Application
    BASE_URL: {
        description: 'Base URL for the application',
        example: 'https://wordsto.link',
        validator: (val) => val.startsWith('http')
    },
    
    // Rate Limiting
    RATE_LIMIT_MAX: {
        description: 'Max requests per time window',
        example: '100',
        validator: (val) => !isNaN(parseInt(val))
    },
    RATE_LIMIT_TIME_WINDOW: {
        description: 'Time window in milliseconds',
        example: '60000',
        validator: (val) => !isNaN(parseInt(val))
    },
    
    // Stripe
    STRIPE_SECRET_KEY: {
        description: 'Stripe secret key',
        example: 'sk_test_...',
        validator: (val) => val.startsWith('sk_'),
        sensitive: true
    },
    STRIPE_WEBHOOK_SECRET: {
        description: 'Stripe webhook secret',
        example: 'whsec_...',
        validator: (val) => val.startsWith('whsec_'),
        sensitive: true
    }
};

function loadEnv() {
    const envPath = path.join(ROOT_DIR, '.env');
    
    if (!existsSync(envPath)) {
        return {};
    }
    
    const envContent = readFileSync(envPath, 'utf-8');
    const env = {};
    
    envContent.split('\n').forEach(line => {
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key) {
                env[key.trim()] = valueParts.join('=').trim();
            }
        }
    });
    
    return env;
}

function validateEnvironment() {
    console.log(chalk.blue.bold('\n🔍 Validating Environment Variables\n'));
    
    const envPath = path.join(ROOT_DIR, '.env');
    
    if (!existsSync(envPath)) {
        console.error(chalk.red('❌ .env file not found!'));
        console.log(chalk.yellow('\nRun this command to create one:'));
        console.log(chalk.cyan('  cp .env.example .env\n'));
        process.exit(1);
    }
    
    const env = loadEnv();
    let hasErrors = false;
    let hasWarnings = false;
    
    // Check required variables
    console.log(chalk.bold('Required Variables:'));
    for (const [key, config] of Object.entries(REQUIRED_VARS)) {
        const value = env[key];
        const isRequired = typeof config.required === 'function' 
            ? config.required(env) 
            : config.required !== false;
        
        if (!isRequired && !value) {
            continue;
        }
        
        if (!value) {
            console.log(chalk.red(`  ❌ ${key}: Missing`));
            console.log(chalk.gray(`     ${config.description}`));
            console.log(chalk.gray(`     Example: ${config.example}`));
            hasErrors = true;
        } else if (config.validator && !config.validator(value)) {
            console.log(chalk.red(`  ❌ ${key}: Invalid value`));
            console.log(chalk.gray(`     Current: ${config.sensitive ? '***' : value}`));
            console.log(chalk.gray(`     Example: ${config.example}`));
            hasErrors = true;
        } else {
            const displayValue = config.sensitive ? '***' : value.substring(0, 50);
            console.log(chalk.green(`  ✅ ${key}: ${displayValue}`));
        }
    }
    
    // Check optional variables
    console.log(chalk.bold('\nOptional Variables:'));
    for (const [key, config] of Object.entries(OPTIONAL_VARS)) {
        const value = env[key];
        
        if (!value) {
            console.log(chalk.yellow(`  ⚠️  ${key}: Not set`));
            console.log(chalk.gray(`     ${config.description}`));
            hasWarnings = true;
        } else if (config.validator && !config.validator(value)) {
            console.log(chalk.yellow(`  ⚠️  ${key}: May be invalid`));
            console.log(chalk.gray(`     Current: ${config.sensitive ? '***' : value}`));
            console.log(chalk.gray(`     Example: ${config.example}`));
            hasWarnings = true;
        } else {
            const displayValue = config.sensitive ? '***' : value.substring(0, 50);
            console.log(chalk.green(`  ✅ ${key}: ${displayValue}`));
        }
    }
    
    // Check for extra variables
    console.log(chalk.bold('\nAdditional Variables:'));
    const knownVars = new Set([
        ...Object.keys(REQUIRED_VARS),
        ...Object.keys(OPTIONAL_VARS)
    ]);
    
    const extraVars = Object.keys(env).filter(key => !knownVars.has(key));
    if (extraVars.length > 0) {
        extraVars.forEach(key => {
            console.log(chalk.gray(`  ℹ️  ${key}`));
        });
    } else {
        console.log(chalk.gray('  None'));
    }
    
    // Summary
    console.log(chalk.bold('\n📊 Summary:'));
    if (hasErrors) {
        console.log(chalk.red('  ❌ Environment validation failed!'));
        console.log(chalk.yellow('  Please fix the errors above before running the application.\n'));
        process.exit(1);
    } else if (hasWarnings) {
        console.log(chalk.yellow('  ⚠️  Environment validated with warnings'));
        console.log(chalk.gray('  The application should run, but some features may not work.\n'));
    } else {
        console.log(chalk.green('  ✅ Environment validation passed!\n'));
    }
    
    // Environment-specific checks
    if (env.NODE_ENV === 'production') {
        console.log(chalk.blue.bold('🚀 Production Environment Checks:'));
        
        const prodChecks = [
            {
                name: 'Clerk configured',
                check: () => env.CLERK_SECRET_KEY && env.CLERK_WEBHOOK_SECRET
            },
            {
                name: 'Secure JWT secret',
                check: () => env.JWT_SECRET && env.JWT_SECRET.length >= 32
            },
            {
                name: 'Base URL configured',
                check: () => env.BASE_URL && env.BASE_URL.startsWith('https')
            }
        ];
        
        prodChecks.forEach(({ name, check }) => {
            if (check()) {
                console.log(chalk.green(`  ✅ ${name}`));
            } else {
                console.log(chalk.red(`  ❌ ${name}`));
                hasErrors = true;
            }
        });
        
        if (hasErrors) {
            console.log(chalk.red('\n  Production environment is not properly configured!\n'));
            process.exit(1);
        }
    }
    
    return !hasErrors;
}

// Run validation if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    validateEnvironment();
}

export { validateEnvironment, loadEnv };