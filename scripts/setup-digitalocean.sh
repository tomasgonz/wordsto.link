#!/bin/bash

# DigitalOcean Droplet Setup Script
# Run this as root on a fresh Ubuntu 22.04 droplet

set -e

echo "═══════════════════════════════════════"
echo "WordsTo.Link Server Setup"
echo "═══════════════════════════════════════"

# Update system
echo "Updating system packages..."
apt update && apt upgrade -y

# Install required packages
echo "Installing required packages..."
apt install -y \
    docker.io \
    docker-compose \
    nginx \
    certbot \
    python3-certbot-nginx \
    git \
    ufw \
    fail2ban \
    htop \
    curl

# Enable Docker
systemctl enable docker
systemctl start docker

# Setup firewall
echo "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80
ufw allow 443
ufw --force enable

# Create application user
echo "Creating application user..."
useradd -m -s /bin/bash wordsto || true
usermod -aG docker wordsto

# Setup directory structure
echo "Setting up directory structure..."
mkdir -p /home/wordsto/backups
chown -R wordsto:wordsto /home/wordsto

# Clone repository (you'll need to update this with your repo URL)
echo "Cloning repository..."
su - wordsto -c "git clone https://github.com/yourusername/wordsto.link.git /home/wordsto/wordsto.link"

# Setup environment file
echo "Setting up environment file..."
cp /home/wordsto/wordsto.link/.env.production.example /home/wordsto/wordsto.link/.env.production

echo ""
echo "═══════════════════════════════════════"
echo "Initial setup complete!"
echo "═══════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit the production environment file:"
echo "   nano /home/wordsto/wordsto.link/.env.production"
echo ""
echo "2. Update the following critical settings:"
echo "   - DB_PASSWORD: Set a secure database password"
echo "   - JWT_SECRET: Generate with: openssl rand -base64 32"
echo "   - RESEND_API_KEY: Your Resend API key"
echo ""
echo "3. Deploy the application:"
echo "   su - wordsto"
echo "   cd wordsto.link"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh"
echo ""
echo "4. Setup nginx:"
echo "   cp /home/wordsto/wordsto.link/nginx.conf /etc/nginx/sites-available/wordsto.link"
echo "   ln -s /etc/nginx/sites-available/wordsto.link /etc/nginx/sites-enabled/"
echo "   rm /etc/nginx/sites-enabled/default"
echo "   nginx -t"
echo "   systemctl reload nginx"
echo ""
echo "5. Setup SSL certificate:"
echo "   certbot --nginx -d wordsto.link -d www.wordsto.link"
echo ""
echo "6. Setup automated backups (optional):"
echo "   crontab -e -u wordsto"
echo "   Add: 0 2 * * * /home/wordsto/wordsto.link/scripts/backup.sh"
echo ""
echo "7. Setup monitoring (optional):"
echo "   - Enable DigitalOcean monitoring"
echo "   - Setup Uptime Robot or similar"
echo ""
echo "═══════════════════════════════════════"