#!/bin/bash

# WordsTo.Link Deployment Script
# This script automates the deployment process

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/home/wordsto/wordsto.link"
BACKUP_DIR="/home/wordsto/backups"

echo -e "${GREEN}Starting WordsTo.Link Deployment...${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists docker; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command_exists docker-compose; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Create backup of current deployment
if [ -d "$APP_DIR" ]; then
    echo -e "${YELLOW}Creating backup of current deployment...${NC}"
    mkdir -p "$BACKUP_DIR"
    timestamp=$(date +%Y%m%d_%H%M%S)

    # Backup database
    if docker ps | grep -q wordsto-postgres; then
        docker exec wordsto-postgres pg_dump -U wordsto wordsto_link | gzip > "$BACKUP_DIR/db_backup_${timestamp}.sql.gz"
        echo -e "${GREEN}Database backed up to $BACKUP_DIR/db_backup_${timestamp}.sql.gz${NC}"
    fi
fi

# Pull latest code
echo -e "${YELLOW}Pulling latest code from repository...${NC}"
cd "$APP_DIR"
git fetch origin
git pull origin main

# Check for environment file
if [ ! -f ".env.production" ]; then
    echo -e "${RED}Production environment file not found!${NC}"
    echo -e "${YELLOW}Please create .env.production from .env.production.example${NC}"
    exit 1
fi

# Build and deploy with Docker Compose
echo -e "${YELLOW}Building Docker images...${NC}"
docker-compose -f docker-compose.production.yml build

echo -e "${YELLOW}Stopping old containers...${NC}"
docker-compose -f docker-compose.production.yml down

echo -e "${YELLOW}Starting new containers...${NC}"
docker-compose -f docker-compose.production.yml up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 10

# Check health of services
echo -e "${YELLOW}Checking service health...${NC}"

# Check database
if docker exec wordsto-postgres pg_isready -U wordsto -d wordsto_link > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database is healthy${NC}"
else
    echo -e "${RED}✗ Database is not responding${NC}"
    exit 1
fi

# Check Redis
if docker exec wordsto-redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis is healthy${NC}"
else
    echo -e "${RED}✗ Redis is not responding${NC}"
    exit 1
fi

# Check backend API
if curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend API is healthy${NC}"
else
    echo -e "${RED}✗ Backend API is not responding${NC}"
    exit 1
fi

# Check frontend
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend is healthy${NC}"
else
    echo -e "${RED}✗ Frontend is not responding${NC}"
    exit 1
fi

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
docker exec wordsto-postgres psql -U wordsto -d wordsto_link -f /docker-entrypoint-initdb.d/001_initial_schema.sql 2>/dev/null || true
docker exec wordsto-postgres psql -U wordsto -d wordsto_link -f /docker-entrypoint-initdb.d/002_add_indexes.sql 2>/dev/null || true
docker exec wordsto-postgres psql -U wordsto -d wordsto_link -f /docker-entrypoint-initdb.d/003_add_functions.sql 2>/dev/null || true

# Clean up old Docker images
echo -e "${YELLOW}Cleaning up old Docker images...${NC}"
docker image prune -f

# Show deployment status
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "Services running:"
docker-compose -f docker-compose.production.yml ps

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Configure nginx: sudo cp nginx.conf /etc/nginx/sites-available/wordsto.link"
echo "2. Enable site: sudo ln -s /etc/nginx/sites-available/wordsto.link /etc/nginx/sites-enabled/"
echo "3. Test nginx: sudo nginx -t"
echo "4. Reload nginx: sudo systemctl reload nginx"
echo "5. Setup SSL: sudo certbot --nginx -d wordsto.link -d www.wordsto.link"

echo ""
echo -e "${GREEN}Your application is now available at:${NC}"
echo "  Backend API: http://localhost:8080"
echo "  Frontend: http://localhost:3000"
echo ""
echo -e "${YELLOW}Remember to configure your domain DNS to point to this server!${NC}"