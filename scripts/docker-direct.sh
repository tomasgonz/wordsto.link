#!/bin/bash

echo "🐳 Starting WordsTo.Link services with Docker directly..."
echo ""

# Create network if it doesn't exist
sudo docker network create wordsto-network 2>/dev/null || true

# Start PostgreSQL
echo "Starting PostgreSQL..."
sudo docker run -d \
  --name wordsto-postgres \
  --network wordsto-network \
  -e POSTGRES_USER=wordsto \
  -e POSTGRES_PASSWORD=wordsto123 \
  -e POSTGRES_DB=wordsto_link \
  -p 5433:5432 \
  -v wordsto-postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine

# Start Redis
echo "Starting Redis..."
sudo docker run -d \
  --name wordsto-redis \
  --network wordsto-network \
  -p 6380:6379 \
  -v wordsto-redis-data:/data \
  redis:7-alpine \
  redis-server --appendonly yes

# Start Adminer
echo "Starting Adminer..."
sudo docker run -d \
  --name wordsto-adminer \
  --network wordsto-network \
  -p 8000:8080 \
  -e ADMINER_DEFAULT_SERVER=wordsto-postgres \
  adminer

echo ""
echo "✅ Services started!"
echo ""
echo "Access from your network:"
echo "  Backend:  http://$(hostname -I | awk '{print $1}'):8080"
echo "  Frontend: http://$(hostname -I | awk '{print $1}'):3000"
echo "  Adminer:  http://$(hostname -I | awk '{print $1}'):8000"
echo ""
echo "Database connection:"
echo "  Host: localhost"
echo "  Port: 5433"
echo "  Database: wordsto_link"
echo "  Username: wordsto"
echo "  Password: wordsto123"
echo ""
echo "To stop services:"
echo "  sudo docker stop wordsto-postgres wordsto-redis wordsto-adminer"
echo ""
echo "To remove services:"
echo "  sudo docker rm -f wordsto-postgres wordsto-redis wordsto-adminer"
