# Deployment Guide: Coolify & Docker Setup

This document provides step-by-step instructions for deploying **ALO Labs Command Center** (`alolabs.net`) onto your self-hosted Linux server using **Coolify**, **Docker**, or direct **Nginx Proxy Manager**.

---

## Prerequisites
- **Server:** Ubuntu 24.04 LTS (Recommended)
- **Minimum Specs:** 2 vCPU, 4GB RAM, 40GB SSD
- **Docker Engine & Compose:** Installed
- **DNS Setup:** Root and Wildcard records pointing to your server IP:
  - `alolabs.net` ➔ `103.239.252.41`
  - `*.alolabs.net` ➔ `103.239.252.41`

---

## 🚀 Option A: Deploying via Coolify (Recommended)

Coolify is an open-source, self-hosted Heroku/Netlify alternative that handles backups, SSL, domain routing, and multi-tenant database provisioning automatically.

### Step 1: Install Coolify on Ubuntu 24.04
Run this command on your VPS as root:
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```
Once complete, open your browser to `http://<your-server-ip>:8000` to set up your admin credentials.

### Step 2: Set up a New Project
1. Go to **Projects** ➔ **Create New Project**.
2. Select your environment (e.g., `production`).

### Step 3: Add the Command Center Application
We can deploy directly from GitHub or via a custom Dockerfile / Docker Compose.

#### Sub-Option A1: Deploy as a Docker Compose Stack
1. In your Coolify dashboard, select **Add Resource** ➔ **Docker Compose**.
2. Copy the contents of the root `docker-compose.yml` file into the compose configuration box.
3. Configure the **Environment Variables** (see `.env.example`).
4. Click **Deploy**. Coolify will spin up the Node application, PostgreSQL, Redis, and MinIO in an isolated network, handle container restarts, and mount persistent volumes.

#### Sub-Option A2: Deploy via Github Repository
1. Link your Github account to Coolify.
2. Choose **Add Resource** ➔ **Public/Private Github Repository**.
3. Select your ALO Labs repository.
4. Set the build pack to **Dockerfile** (it automatically detects the root `Dockerfile`).
5. Under **Domains**, set `https://alolabs.net` or `http://103.239.252.41`. Coolify will automatically provision a Let's Encrypt SSL certificate!
6. Click **Deploy**.

---

## 🐳 Option B: Manual Production Docker Deployment

If you prefer to run raw Docker containers:

### Step 1: Clone and Configure
```bash
git clone https://github.com/alo-labs/command-center.git /opt/alo-command-center
cd /opt/alo-command-center
cp .env.example .env
```
Edit `.env` to include your secure production passwords, domain mapping, and API keys.

### Step 2: Build and Run
```bash
docker compose up -d --build
```

### Step 3: Configure Nginx Proxy Manager (NPM)
To handle SSL certificates and map domain names to container ports:
1. Spin up Nginx Proxy Manager (running on port 81).
2. Go to **Proxy Hosts** ➔ **Add Proxy Host**:
   - **Domain Name:** `alolabs.net` and `www.alolabs.net`
   - **Scheme:** `http`
   - **Forward Name/IP:** `alolabs-app` (or server local IP)
   - **Forward Port:** `3000`
   - **Websockets Support:** Enabled
   - **SSL Tab:** Request a new Let's Encrypt Certificate, Force SSL.

---

## 🔒 Security Hardening

1. **Firewall Settings (UFW):**
   ```bash
   ufw default deny incoming
   ufw default allow outgoing
   ufw allow 22/tcp     # SSH
   ufw allow 80/tcp     # HTTP Ingress
   ufw allow 443/tcp    # HTTPS Ingress
   ufw allow 8000/tcp   # Coolify Console (optional, can be bound to local only)
   ufw enable
   ```
2. **Database Isolation:** Ensure PostgreSQL (`port 5432`) is not accessible from the external internet by binding only to `127.0.0.1` or internal Docker networks.
3. **Backup Operations:** Utilize Coolify's built-in **Backup Engine** to schedule daily snapshots of the database, app volumes, and MinIO buckets to S3-compatible storage.
