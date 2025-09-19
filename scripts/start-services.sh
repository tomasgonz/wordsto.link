#!/bin/bash

echo "🚀 Starting WordsTo.Link Services"
echo "================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if Docker is accessible
if docker info &> /dev/null; then
    echo -e "${GREEN}✅ Docker is accessible${NC}"
    echo "Starting Docker services..."
    docker-compose up -d
else
    echo -e "${YELLOW}⚠️  Docker requires sudo. Run this instead:${NC}"
    echo ""
    echo "  sudo docker-compose up -d"
    echo ""
    echo "Or add your user to docker group:"
    echo "  sudo usermod -aG docker $USER"
    echo "  newgrp docker"
    echo ""
fi

echo ""
echo "Once Docker is running, start the services:"
echo ""
echo "  # Terminal 1 - Backend"
echo "  npm run dev:backend"
echo ""
echo "  # Terminal 2 - Frontend"  
echo "  npm run dev:frontend"
echo ""
echo "Your services will be available at:"
echo "  Backend:  http://$(hostname -I | awk '{print $1}'):8080"
echo "  Frontend: http://$(hostname -I | awk '{print $1}'):3000"
echo "  Adminer:  http://$(hostname -I | awk '{print $1}'):8000"
echo ""
