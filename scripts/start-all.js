#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

console.log(chalk.blue.bold('\n🚀 Starting WordsTo.Link Development Environment\n'));

// Function to check if a port is in use
function checkPort(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true); // Port is in use
            } else {
                resolve(false);
            }
        });

        server.once('listening', () => {
            server.close();
            resolve(false); // Port is free
        });

        server.listen(port);
    });
}

// Function to find process using a port
function findProcessOnPort(port) {
    try {
        // Use lsof to find all processes (including child processes) using the port
        const result = execSync(`lsof -i :${port} -t 2>/dev/null || true`, { encoding: 'utf-8' });
        const pids = result.trim().split('\n').filter(Boolean);

        // Also try to find parent processes of Next.js servers
        if (port === 3000) {
            try {
                // Find any next-server processes
                const nextProcesses = execSync(`pgrep -f "next-server\\|next dev" 2>/dev/null || true`, { encoding: 'utf-8' });
                const nextPids = nextProcesses.trim().split('\n').filter(Boolean);
                pids.push(...nextPids);
            } catch {
                // Ignore if pgrep fails
            }
        }

        // Remove duplicates
        return [...new Set(pids)];
    } catch {
        return [];
    }
}

// Function to kill processes on a port
function killProcessesOnPort(port) {
    const pids = findProcessOnPort(port);
    if (pids.length > 0) {
        console.log(chalk.yellow(`⚠️  Killing processes on port ${port}: ${pids.join(', ')}`));

        // Try graceful shutdown first
        try {
            execSync(`kill -TERM ${pids.join(' ')} 2>/dev/null || true`, { stdio: 'ignore' });
            // Give processes time to terminate gracefully
            execSync('sleep 1', { stdio: 'ignore' });
        } catch {
            // Ignore errors from graceful shutdown
        }

        // Force kill any remaining processes
        try {
            execSync(`kill -9 ${pids.join(' ')} 2>/dev/null || true`, { stdio: 'ignore' });

            // Additional cleanup for Next.js on port 3000
            if (port === 3000) {
                // More aggressive cleanup for Next.js
                console.log(chalk.yellow('  Performing additional Next.js cleanup...'));

                // Kill by port using fuser
                execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });

                // Kill any remaining Next.js related processes
                execSync(`pkill -9 -f "next-server" 2>/dev/null || true`, { stdio: 'ignore' });
                execSync(`pkill -9 -f "next dev" 2>/dev/null || true`, { stdio: 'ignore' });
                execSync(`pkill -9 -f "node.*next" 2>/dev/null || true`, { stdio: 'ignore' });

                // Also try to kill by the exact process name pattern
                try {
                    const nextPids = execSync(`ps aux | grep -E "(next-server|next dev)" | grep -v grep | awk '{print $2}'`, { encoding: 'utf-8' });
                    if (nextPids.trim()) {
                        execSync(`kill -9 ${nextPids.trim().split('\n').join(' ')} 2>/dev/null || true`, { stdio: 'ignore' });
                    }
                } catch {
                    // Ignore if no processes found
                }
            }

            // Wait for port to be released
            execSync('sleep 2', { stdio: 'ignore' });

            // Verify the port is free
            const stillInUse = findProcessOnPort(port);
            if (stillInUse.length === 0) {
                return true;
            } else {
                console.error(chalk.red(`Some processes still using port ${port}: ${stillInUse.join(', ')}`));

                // Last resort: try fuser one more time
                if (port === 3000) {
                    console.log(chalk.yellow('  Attempting final cleanup...'));
                    execSync(`fuser -k -KILL ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
                    execSync('sleep 1', { stdio: 'ignore' });

                    const finalCheck = findProcessOnPort(port);
                    if (finalCheck.length === 0) {
                        console.log(chalk.green('  ✅ Port finally freed!'));
                        return true;
                    }
                }

                return false;
            }
        } catch (error) {
            console.error(chalk.red(`Failed to kill processes on port ${port}: ${error.message}`));
            return false;
        }
    }
    return false;
}

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
        // Check and handle port conflicts
        console.log(chalk.blue('🔍 Checking port availability...\n'));

        const portsToCheck = [
            { port: 8080, name: 'Backend' },
            { port: 3000, name: 'Frontend' }
        ];

        for (const { port, name } of portsToCheck) {
            const isInUse = await checkPort(port);
            if (isInUse) {
                console.log(chalk.yellow(`⚠️  Port ${port} (${name}) is already in use.`));

                // Ask user or automatically kill the process
                const killed = killProcessesOnPort(port);
                if (killed) {
                    console.log(chalk.green(`✅ Port ${port} is now free.`));
                    // Wait a moment for the port to be fully released
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    console.error(chalk.red(`❌ Could not free port ${port}. Please manually stop the process using this port.`));
                    process.exit(1);
                }
            } else {
                console.log(chalk.green(`✅ Port ${port} (${name}) is available.`));
            }
        }

        console.log('');

        // Check if Docker services are running
        console.log(chalk.blue('📦 Checking Docker services...\n'));
        const dockerCheck = spawn('docker', ['ps', '--filter', 'name=wordsto', '--format', '{{.Names}}'], {
            cwd: ROOT_DIR,
            stdio: 'pipe'
        });

        let dockerOutput = '';
        dockerCheck.stdout.on('data', (data) => {
            dockerOutput += data.toString();
        });

        await new Promise((resolve) => {
            dockerCheck.on('exit', resolve);
        });

        const runningContainers = dockerOutput.trim().split('\n').filter(Boolean);
        const requiredContainers = ['wordsto_postgres', 'wordsto_redis'];
        const missingContainers = requiredContainers.filter(c => !runningContainers.includes(c));

        if (missingContainers.length > 0) {
            console.log(chalk.yellow('⚠️  Some Docker services are not running. Please run: docker compose up -d'));
            console.log(chalk.yellow('Missing services: ' + missingContainers.join(', ')));
            console.log(chalk.blue('\nContinuing with available services...\n'));
        } else {
            console.log(chalk.green('✅ Docker services are running\n'));
        }

        // Step 2: Run migrations
        console.log(chalk.blue('📊 Running database migrations...\n'));
        const migrate = spawn('node', ['scripts/db-migrate.js'], {
            cwd: ROOT_DIR,
            stdio: 'inherit'
        });

        await new Promise((resolve) => {
            migrate.on('exit', resolve);
        });

        // Step 3: Start backend with nodemon on port 8080
        console.log(chalk.blue('\n🔧 Starting backend server on port 8080...\n'));
        spawnProcess('Backend', 'npx', ['nodemon', 'src/server/index.js'], {
            env: { ...process.env, PORT: '8080' }
        });

        // Wait for backend to start
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 4: Start frontend
        console.log(chalk.blue('\n🎨 Starting frontend...\n'));
        spawnProcess('Frontend', 'npm', ['run', 'dev'], {
            cwd: path.join(ROOT_DIR, 'frontend'),
            env: {
                ...process.env,
                NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
            }
        });

        // Display success message
        setTimeout(() => {
            console.log(chalk.green.bold('\n✨ Development environment is ready!\n'));
            console.log(chalk.white('🔗 Backend:  ') + chalk.cyan('http://localhost:8080'));
            console.log(chalk.white('🎨 Frontend: ') + chalk.cyan('http://localhost:3000'));
            console.log(chalk.white('🗄️  Adminer:  ') + chalk.cyan('http://localhost:8000'));
            console.log(chalk.white('\nPress Ctrl+C to stop all services.\n'));
        }, 5000);

    } catch (error) {
        console.error(chalk.red('❌ Failed to start development environment:'), error);
        process.exit(1);
    }
}

// Start the development environment
startDevelopment();
