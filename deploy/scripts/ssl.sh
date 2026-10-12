#!/usr/bin/env bash
set -euo pipefail
# ALO Labs AIOS - SSL Certificate Setup
# Usage: bash ssl.sh [domain] [email]

DOMAIN="${1:-alolabs.net}"
EMAIL="${2:-admin@alolabs.net}"
WEBROOT="/var/www/alolabs"

check_root() { [ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }; }
check_root

echo "=== ALO Labs AIOS - SSL Setup ==="
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"

# Install certbot
if ! command -v certbot &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq certbot python3-certbot-nginx
fi

# Create webroot
mkdir -p "$WEBROOT"

# Obtain certificate
certbot certonly --webroot \
    -w "$WEBROOT" \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --non-interactive

# Setup auto-renewal
systemctl enable certbot.timer
systemctl start certbot.timer

echo "=== SSL certificate obtained successfully ==="
echo "Certificate: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "Key: /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo ""
echo "Auto-renewal timer: enabled"
certbot certificates