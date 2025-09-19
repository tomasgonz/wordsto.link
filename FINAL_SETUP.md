# Clean Setup Instructions

## Kill Everything First
```bash
pkill -9 node
docker compose down
```

## Start Fresh
```bash
# Terminal 1 - Start Docker
docker compose up -d

# Terminal 2 - Start Backend on port 8080
PORT=8080 node src/server/index.js

# Terminal 3 - Start Frontend on port 3000
cd frontend
rm -rf .next
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
```

## Access Points
- Frontend: http://localhost:3000
- Backend: http://localhost:8080
- Test the backend directly:
  ```bash
  curl -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test123"}'
  ```

## Test Credentials
- Email: test@example.com
- Password: test123

## The Core Problem
The AuthContext.tsx was hardcoded to use port 3000. It's now fixed to use 8080.
The config.ts was also pointing to wrong port. It's now fixed to use 8080.

## If It Still Doesn't Work
The issue is likely browser cache. Use an incognito window or different browser.

## Alternative: Use the Backend Directly
Since the backend API works (I tested it), you can build your own frontend or use it via curl/Postman:

### Login
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### Create URL (use token from login)
```bash
curl -X POST http://localhost:8080/api/shorten \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "identifier": "testuser",
    "keywords": ["test"],
    "destination_url": "https://example.com"
  }'
```
