# Quick Start

## Start Everything
```bash
npm run dev:all
```

## Access Points
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- Database Admin: http://localhost:8000

## Test Login
- Email: test@example.com
- Password: test123
- Username/Identifier: testuser

## If ports are already in use
```bash
pkill -9 node
npm run dev:all
```

## Manual Start (if needed)
```bash
# 1. Start Docker
docker compose up -d

# 2. Start Backend (port 8080)
PORT=8080 node src/server/index.js

# 3. Start Frontend (port 3000)
cd frontend && npm run dev
```

## Note
- Backend MUST run on port 8080
- Frontend MUST run on port 3000
- Frontend calls backend at localhost:8080
