#!/bin/bash

echo "🔍 Checking for port conflicts..."
echo ""

# Check PostgreSQL port 5432
echo "PostgreSQL (port 5432):"
if sudo lsof -i :5432 > /dev/null 2>&1; then
    echo "  ⚠️  Port 5432 is in use"
    sudo lsof -i :5432
    echo ""
    echo "  Options:"
    echo "  1. Stop system PostgreSQL: sudo systemctl stop postgresql"
    echo "  2. Or change Docker port in docker-compose.yml to 5433:5432"
else
    echo "  ✅ Port 5432 is available"
fi

echo ""

# Check Redis port 6379
echo "Redis (port 6379):"
if sudo lsof -i :6379 > /dev/null 2>&1; then
    echo "  ⚠️  Port 6379 is in use"
    sudo lsof -i :6379
    echo ""
    echo "  Options:"
    echo "  1. Stop system Redis: sudo systemctl stop redis"
    echo "  2. Or change Docker port in docker-compose.yml to 6380:6379"
else
    echo "  ✅ Port 6379 is available"
fi

echo ""

# Check Adminer port 8080
echo "Adminer (port 8080):"
if sudo lsof -i :8080 > /dev/null 2>&1; then
    echo "  ⚠️  Port 8080 is in use"
    sudo lsof -i :8080
else
    echo "  ✅ Port 8080 is available"
fi

echo ""
echo "Quick fix - Stop system services and use Docker instead:"
echo "  sudo systemctl stop postgresql redis"
echo "  sudo docker-compose up -d"
echo ""
echo "Alternative - Use different ports for Docker:"
echo "  Edit docker-compose.yml and change port mappings"