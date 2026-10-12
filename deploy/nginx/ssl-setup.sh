#!/usr/bin/env bash
# ============================================================
# ALO Labs Agent Hub — SSL Certificate Setup via Certbot
# Usage: sudo bash ssl-setup.sh [--staging] [--email admin@alolabs.net]
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
DOMAINS=("alolabs.net" "panel.alolabs.net" "api.alolabs.net")
EMAIL="${SSL_EMAIL:-admin@alolabs.net}"
CERTBOT_DIR="/etc/letsencrypt"
WEBROOT="/var/www/certbot"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
STAGING=""
STAGING_FLAG=""

# ── Parse arguments ──────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --staging)
            STAGING=" (STAGING)"
            STAGING_FLAG="--staging"
            ;;
        --email)
            shift
            EMAIL="$1"
            ;;
        --help|-h)
            echo "Usage: sudo bash ssl-setup.sh [--staging] [--email admin@alolabs.net]"
            echo ""
            echo "  --staging   Use Let's Encrypt staging server (no rate limits, untrusted cert)"
            echo "  --email     Email for Let's Encrypt notifications"
            exit 0
            ;;
    esac
done

# ── Pre-flight checks ────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo "❌ ERROR: This script must be run as root (use sudo)."
    exit 1
fi

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; }

log "============================================================"
log "ALO Labs Agent Hub — SSL Certificate Setup${STAGING}"
log "============================================================"
log "Email:     ${EMAIL}"
log "Domains:   ${DOMAINS[*]}"
log ""

# ── Install certbot ──────────────────────────────────────────
log "Installing certbot and nginx plugin..."
if ! command -v certbot &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq certbot python3-certbot-nginx 2>/dev/null
    ok "certbot installed"
else
    ok "certbot already installed ($(certbot --version 2>&1 | head -1))"
fi

# ── Create webroot directory ─────────────────────────────────
log "Creating webroot for ACME challenges..."
mkdir -p "${WEBROOT}"
chown -R www-data:www-data "${WEBROOT}"
chmod -R 755 "${WEBROOT}"
ok "Webroot ready at ${WEBROOT}"

# ── Ensure Nginx snippet directory exists ────────────────────
log "Setting up Nginx SSL and security header snippets..."
mkdir -p /etc/nginx/snippets

# ── SSL parameters snippet ───────────────────────────────────
cat > /etc/nginx/snippets/ssl-params.conf <<'SSLCONF'
# SSL Protocol & Cipher Configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;

# Modern cipher suite (TLS 1.3 ciphers are not configurable)
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';

# Session settings
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

# OCSP Stapling
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;

# DH parameters (2048-bit)
ssl_dhparam /etc/nginx/dhparam.pem;
SSLCONF

# ── Generate DH parameters if not present ────────────────────
if [[ ! -f /etc/nginx/dhparam.pem ]]; then
    log "Generating DH parameters (this may take a moment)..."
    openssl dhparam -out /etc/nginx/dhparam.pem 2048 2>/dev/null
    ok "DH parameters generated"
else
    ok "DH parameters already exist"
fi

# ── Security headers snippet ─────────────────────────────────
cat > /etc/nginx/snippets/security-headers.conf <<'HDRCONF'
# Security Headers
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' wss: https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
HDRCONF

ok "Nginx snippets created"

# ── Create a minimal HTTP-only Nginx config for cert validation ─
log "Creating temporary HTTP Nginx config for certificate validation..."
cat > "${NGINX_SITES_AVAILABLE}/alolabs-http.conf" <<'HTTPCONF'
# Temporary HTTP config for Let's Encrypt validation
server {
    listen 80;
    listen [::]:80;
    server_name alolabs.net panel.alolabs.net api.alolabs.net www.alolabs.net;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
HTTPCONF

ln -sf "${NGINX_SITES_AVAILABLE}/alolabs-http.conf" "${NGINX_SITES_ENABLED}/alolabs-http.conf"
nginx -t 2>/dev/null && systemctl reload nginx
ok "Temporary HTTP config active"

# ── Obtain certificates ──────────────────────────────────────
FAILED=()
for domain in "${DOMAINS[@]}"; do
    log "Obtaining certificate for: ${domain}${STAGING}"
    if certbot certonly \
        --webroot \
        --webroot-path="${WEBROOT}" \
        --email "${EMAIL}" \
        --agree-tos \
        --no-eff-email \
        --non-interactive \
        ${STAGING_FLAG} \
        -d "${domain}"; then
        ok "Certificate obtained: ${domain}"
    else
        fail "Failed to obtain certificate: ${domain}"
        FAILED+=("${domain}")
    fi
done

# ── Also get cert for www.alolabs.net (SAN on main cert) ───
log "Obtaining certificate for: www.alolabs.net${STAGING}"
if certbot certonly \
    --webroot \
    --webroot-path="${WEBROOT}" \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    ${STAGING_FLAG} \
    -d "www.alolabs.net"; then
    ok "Certificate obtained: www.alolabs.net"
else
    fail "Failed to obtain certificate: www.alolabs.net"
    FAILED+=("www.alolabs.net")
fi

# ── Remove temporary HTTP config ─────────────────────────────
rm -f "${NGINX_SITES_ENABLED}/alolabs-http.conf"
rm -f "${NGINX_SITES_AVAILABLE}/alolabs-http.conf"

# ── Activate full HTTPS config ──────────────────────────────
if [[ -f "${NGINX_SITES_AVAILABLE}/alolabs.conf" ]]; then
    ln -sf "${NGINX_SITES_AVAILABLE}/alolabs.conf" "${NGINX_SITES_ENABLED}/alolabs.conf"
    ok "Full HTTPS config activated"
else
    fail "alolabs.conf not found in ${NGINX_SITES_AVAILABLE}"
    fail "Copy deploy/nginx/alolabs.conf to ${NGINX_SITES_AVAILABLE}/ and re-run this script."
    exit 1
fi

# ── Set up auto-renewal ─────────────────────────────────────
log "Setting up auto-renewal..."
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'") | crontab -
    ok "Auto-renewal cron job added (daily at 3:00 AM)"
else
    ok "Auto-renewal cron job already exists"
fi

# ── Verify certificates ─────────────────────────────────────
log "Verifying certificates..."
for domain in "${DOMAINS[@]}"; do
    cert_path="${CERTBOT_DIR}/live/${domain}/fullchain.pem"
    if [[ -f "${cert_path}" ]]; then
        expiry=$(openssl x509 -in "${cert_path}" -noout -enddate 2>/dev/null | cut -d= -f2)
        ok "${domain} — expires: ${expiry}"
    else
        fail "${domain} — certificate file not found"
    fi
done

# ── Test and reload Nginx ───────────────────────────────────
log "Testing Nginx configuration..."
if nginx -t 2>&1; then
    systemctl reload nginx
    ok "Nginx reloaded successfully"
else
    fail "Nginx configuration test failed — NOT reloading"
    exit 1
fi

# ── Summary ──────────────────────────────────────────────────
log ""
log "============================================================"
if [[ ${#FAILED[@]} -eq 0 ]]; then
    log "✅ ALL CERTIFICATES OBTAINED SUCCESSFULLY"
else
    log "⚠️  Some certificates failed: ${FAILED[*]}"
    log "   Check certbot logs at: /var/log/letsencrypt/"
fi
log "============================================================"
log "Next steps:"
log "  1. Verify HTTPS: curl -I https://alolabs.net"
log "  2. Test SSL:     sslabs.com/ssltest/analyze.html?d=alolabs.net"
log "  3. Auto-renewal: crontab -l | grep certbot"