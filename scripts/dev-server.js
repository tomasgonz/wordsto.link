#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

console.log(chalk.blue.bold('\n🚀 Starting WordsTo.Link Development Environment\n'));

// Check environment
if (!existsSync(path.join(ROOT_DIR, '.env'))) {
    console.error(chalk.red('❌ .env file not found!'));
    console.log(chalk.yellow('Creating .env from .env.example...'));
    
    const fs = await import('fs');
    fs.copyFileSync(
        path.join(ROOT_DIR, '.env.example'),
        path.join(ROOT_DIR, '.env')
    );
    console.log(chalk.green('✅ Created .env file. Please configure it with your settings.\n'));
}

const processes = [];

// Function to spawn a process
function spawnProcess(name, command, args, options = {}) {
    console.log(chalk.cyan(`Starting ${name}...`));
    
    const proc = spawn(command, args, {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        shell: true,
        ...options
    });

    proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
            console.log(chalk.gray(`[${name}]`) + ' ' + line);
        });
    });

    proc.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
            console.error(chalk.red(`[${name}]`) + ' ' + line);
        });
    });

    proc.on('error', (error) => {
        console.error(chalk.red(`[${name}] Failed to start:`, error.message));
    });

    proc.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.error(chalk.red(`[${name}] Exited with code ${code}`));
        }
    });

    processes.push({ name, process: proc });
    return proc;
}

// Cleanup on exit
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n🛑 Shutting down development environment...'));
    
    processes.forEach(({ name, process }) => {
        console.log(chalk.gray(`Stopping ${name}...`));
        process.kill('SIGTERM');
    });
    
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

process.on('SIGTERM', () => {
    processes.forEach(({ process }) => process.kill('SIGTERM'));
    process.exit(0);
});

async function startDevelopment() {
    try {
        // Step 1: Start Docker services
        console.log(chalk.blue('📦 Starting Docker services...\n'));
        spawnProcess('Docker', 'sudo', ['docker-compose', 'up', '-d']);
        
        // Wait for Docker to be ready
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Step 2: Run migrations
        console.log(chalk.blue('\n📊 Running database migrations...\n'));
        const migrate = spawn('node', ['scripts/db-migrate.js'], {
            cwd: ROOT_DIR,
            stdio: 'inherit'
        });
        
        await new Promise((resolve) => {
            migrate.on('exit', resolve);
        });
        
        // Step 3: Start backend with nodemon
        console.log(chalk.blue('\n🔧 Starting backend server...\n'));
        spawnProcess('Backend', 'npx', ['nodemon', 'src/server/index.js']);
        
        // Wait for backend to start
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Step 4: Start frontend
        console.log(chalk.blue('\n🎨 Starting frontend...\n'));
        spawnProcess('Frontend', 'npm', ['run', 'dev'], {
            cwd: path.join(ROOT_DIR, 'frontend')
        });
        
        // Display success message
        setTimeout(() => {
            console.log(chalk.green.bold('\n✨ Development environment is ready!\n'));
            console.log(chalk.white('🔗 Backend:  ') + chalk.cyan('http://localhost:3000'));
            console.log(chalk.white('🎨 Frontend: ') + chalk.cyan('http://localhost:3001'));
            console.log(chalk.white('🗄️  Adminer:  ') + chalk.cyan('http://localhost:8080'));
            console.log(chalk.white('\nPress Ctrl+C to stop all services.\n'));
        }, 5000);
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to start development environment:'), error);
        process.exit(1);
    }
}

// Start the development environment
startDevelopment();