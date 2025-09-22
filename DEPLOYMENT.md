# WordsTo.Link Deployment Guide

## Prerequisites

- DigitalOcean Droplet (Ubuntu 22.04 or later)
- Domain name (wordsto.link) pointed to your server
- SSL certificate (we'll use Let's Encrypt)

## Recommended Droplet Specifications

- **Minimum**: 2 GB RAM / 1 vCPU ($12/month)
- **Recommended**: 4 GB RAM / 2 vCPUs ($24/month)
- **Production**: 8 GB RAM / 4 vCPUs ($48/month)

## Deployment Options

### Option 1: Docker Compose (Recommended)

This is the easiest way to deploy everything together.

### Option 2: Manual Deployment

For more control over individual services.

## Quick Start

1. **Create a DigitalOcean Droplet**
   - Choose Ubuntu 22.04 LTS
   - Select your preferred size
   - Add your SSH key

2. **Initial Server Setup**
   ```bash
   ssh root@your-server-ip

   # Update system
   apt update && apt upgrade -y

   # Install required packages
   apt install -y docker.io docker-compose nginx certbot python3-certbot-nginx git

   # Create app user
   useradd -m -s /bin/bash wordsto
   usermod -aG docker wordsto
   ```

3. **Clone the Repository**
   ```bash
   su - wordsto
   git clone https://github.com/yourusername/wordsto.link.git
   cd wordsto.link
   ```

4. **Configure Environment Variables**
   ```bash
   cp .env.production.example .env.production
   nano .env.production
   ```

5. **Deploy with Docker Compose**
   ```bash
   docker-compose -f docker-compose.production.yml up -d
   ```

6. **Setup SSL with Let's Encrypt**
   ```bash
   sudo certbot --nginx -d wordsto.link -d www.wordsto.link
   ```

## Environment Variables

### Production .env Configuration

```env
# Server
NODE_ENV=production
PORT=8080
HOST=0.0.0.0

# Database (using Docker container)
DATABASE_URL=postgresql://wordsto:SECURE_PASSWORD@postgres:5432/wordsto_link
DB_HOST=postgres
DB_PORT=5432
DB_NAME=wordsto_link
DB_USER=wordsto
DB_PASSWORD=SECURE_PASSWORD

# Redis (using Docker container)
REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-production-jwt-secret

# Application URLs
BASE_URL=https://wordsto.link
SHORT_URL_BASE=https://wordsto.link
FRONTEND_URL=https://wordsto.link

# Email (Resend)
RESEND_API_KEY=re_YOUR_PRODUCTION_API_KEY
EMAIL_FROM=WordsTo.Link <noreply@wordsto.link>
FORCE_EMAIL_SEND=true

# Optional: Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Database Backup

Setup automated backups:

```bash
# Create backup script
cat > /home/wordsto/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/wordsto/backups"
mkdir -p $BACKUP_DIR
docker exec wordsto-postgres pg_dump -U wordsto wordsto_link | gzip > $BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql.gz
# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
EOF

chmod +x /home/wordsto/backup-db.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/wordsto/backup-db.sh") | crontab -
```

## Monitoring

### Health Check Endpoint
- `https://wordsto.link/api/health`

### Logs
- Application: `docker logs wordsto-app`
- Database: `docker logs wordsto-postgres`
- Redis: `docker logs wordsto-redis`

### Uptime Monitoring
Consider using:
- DigitalOcean Monitoring (free)
- UptimeRobot (free tier available)
- Pingdom

## Scaling

### Vertical Scaling
- Resize your DigitalOcean droplet when needed

### Horizontal Scaling
- Use DigitalOcean Load Balancer
- Deploy multiple app containers
- Use managed database (DigitalOcean Managed PostgreSQL)

## Security Checklist

- [ ] SSL certificate installed
- [ ] Firewall configured (ufw)
- [ ] SSH key-only authentication
- [ ] Regular security updates
- [ ] Database backups configured
- [ ] Environment variables secured
- [ ] Rate limiting enabled
- [ ] CORS properly configured

## Troubleshooting

### Container Issues
```bash
# View all containers
docker-compose -f docker-compose.production.yml ps

# Restart services
docker-compose -f docker-compose.production.yml restart

# View logs
docker-compose -f docker-compose.production.yml logs -f
```

### Database Connection Issues
```bash
# Test database connection
docker exec -it wordsto-postgres psql -U wordsto -d wordsto_link
```

### Performance Issues
```bash
# Check resource usage
docker stats

# Check disk space
df -h

# Check memory
free -m
```

## Support

For deployment issues:
1. Check application logs
2. Verify environment variables
3. Ensure all services are running
4. Check domain DNS configuration