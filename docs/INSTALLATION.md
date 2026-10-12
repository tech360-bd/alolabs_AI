# ALO Labs AIOS — Installation Guide

> **Version:** 0.2.0  
> **Last Updated:** 2025  
> **Audience:** Developers setting up a local development environment

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and Install](#2-clone-and-install)
3. [Environment Configuration](#3-environment-configuration)
4. [Database Setup](#4-database-setup)
5. [Start Development Server](#5-start-development-server)
6. [First Login](#6-first-login)
7. [Verification Steps](#7-verification-steps)
8. [Common Installation Issues](#8-common-installation-issues)
9. [Platform-Specific Notes](#9-platform-specific-notes)

---

## 1. Prerequisites

| Requirement | Minimum Version | Recommended | Check Command |
|---|---|---|---|
| **Node.js** | 20.x | 22.x LTS | `node -v` |
| **Bun** | 1.2.x | 1.2.5+ | `bun -v` |
| **SQLite** | 3.x | 3.40+ | `sqlite3 --version` |
| **Git** | 2.x | 2.40+ | `git --version` |
| **OS** | Linux/macOS/WSL2 | Ubuntu 24.04 | — |
| **RAM** | 4 GB | 8 GB | — |
| **Disk** | 5 GB free | 10 GB free | — |

### Install Bun

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Verify
bun -v  # Should output 1.2.x or higher
```

### Install Node.js (if not via Bun)

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
nvm use 22

# Verify
node -v  # Should output v22.x
```

### Install SQLite (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y sqlite3 libsqlite3-dev
```

---

## 2. Clone and Install

```bash
# Clone the repository
git clone <repository-url> agent-hub
cd agent-hub

# Install dependencies with Bun
bun install

# Verify installation
bun --version
ls node_modules/.package-lock.json
```

### Expected Output

The `bun install` command should complete in ~10–30 seconds. You should see:

```
  + @prisma/client@6.11.1
  + next@16.1.1
  + react@19.0.0
  ...
  87 packages installed
```

If you encounter native module compilation errors (e.g., `bcrypt`), see [Common Issues](#8-common-installation-issues).

---

## 3. Environment Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env 2>/dev/null || touch .env
```

### Minimum Required `.env` for Development

```env
# ── Application ─────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ── Database (SQLite for development) ────────────────────
DATABASE_URL="file:./dev.db"

# ── Authentication Secrets ──────────────────────────────
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-generated-secret-here-replace-me"
AUTH_OWNER_EMAIL="admin@alolabs.net"
AUTH_OWNER_PASSWORD="changeme-secure-password-123"

# ── API Gateway ─────────────────────────────────────────
API_GATEWAY_SECRET="your-api-gateway-secret-replace-me"

# ── Encryption Keys (generate unique values) ────────────
API_KEY_ENCRYPTION_KEY="your-encryption-key-32-bytes-min!!"
CSRF_SECRET="your-csrf-secret-replace-me"
SESSION_ENCRYPTION_KEY="your-session-key-32-bytes-min!!"
WEBHOOK_SECRET="your-webhook-secret-replace-me"
BACKUP_ENCRYPTION_KEY="your-backup-key-32-bytes-min!!"

# ── CORS ────────────────────────────────────────────────
ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```

### Generating Secure Secrets

```bash
# Generate all required secrets at once
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "API_GATEWAY_SECRET=$(openssl rand -base64 32)"
echo "API_KEY_ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "CSRF_SECRET=$(openssl rand -base64 32)"
echo "SESSION_ENCRYPTION_KEY=$(openssl rand -base64 32)"
echo "WEBHOOK_SECRET=$(openssl rand -base64 32)"
echo "BACKUP_ENCRYPTION_KEY=$(openssl rand -base64 32)"
```

### Optional Services

Add these only if you want to use external services in development:

```env
# ── Redis (optional — in-memory fallback used if absent) ──
REDIS_URL="redis://localhost:6379"

# ── PostgreSQL (optional — for advanced analytics) ───────
POSTGRES_URL="postgresql://user:pass@localhost:5432/agent_hub"

# ── Qdrant (optional — for RAG vector search) ───────────
QDRANT_URL="http://localhost:6333"

# ── MinIO (optional — for file storage) ─────────────────
MINIO_URL="http://minioadmin:minioadmin@localhost:9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"

# ── SMTP (optional — for email features) ────────────────
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="noreply@alolabs.net"

# ── AI Providers (optional) ─────────────────────────────
OPENROUTER_API_KEY="sk-or-v1-xxxxx"
OLLAMA_BASE_URL="http://localhost:11434"
```

### Start Optional Services with Docker Compose

```bash
# Start MariaDB and Redis for development
docker compose up -d

# Start with Adminer (database GUI)
docker compose --profile tools up -d
```

This provides:
- **MariaDB 10.11** on `127.0.0.1:3306`
- **Redis 7** on `127.0.0.1:6379`
- **Adminer** (optional) on `127.0.0.1:8080`

---

## 4. Database Setup

### Step 1: Generate Prisma Client

```bash
bun run db:generate
```

Expected output:

```
✔ Generated Prisma Client (6.11.1)
```

### Step 2: Push Schema to Database

For SQLite (default development):

```bash
bun run db:push
```

For MariaDB/MySQL (if using Docker Compose):

```bash
# First, update DATABASE_URL in .env:
# DATABASE_URL="mysql://alohub_user:alohub_dev_pass@127.0.0.1:3306/alohub_dev"

bun run db:push
```

Expected output:

```
🚀 Your database is now in sync with your Prisma schema.
```

### Step 3: Seed Data (Optional)

```bash
# Seed core data (roles, permissions, system settings)
bun run scripts/seed-v3.ts
```

### Verify Database

```bash
# Check database tables
ls -la dev.db  # SQLite

# Or via Adminer (if using Docker)
# Open http://localhost:8080 in browser
```

---

## 5. Start Development Server

```bash
# Start the development server on port 3000
bun run dev
```

The server will be available at:

| URL | Description |
|---|---|
| `http://localhost:3000` | Main application |
| `http://localhost:3000/api/health` | Health check endpoint |
| `http://localhost:3000/api/auth/login` | Login API |

### First-Time Startup

On first startup, the system will:
1. Connect to the database and create the schema
2. Create the owner user if `AUTH_OWNER_EMAIL`/`AUTH_OWNER_PASSWORD` are set
3. Initialize system settings in the database
4. Start the Next.js development server with hot-reload

---

## 6. First Login

### Default Credentials

The owner account is created from your `.env` configuration:

| Field | Value |
|---|---|
| **Email** | Value of `AUTH_OWNER_EMAIL` (e.g., `admin@alolabs.net`) |
| **Password** | Value of `AUTH_OWNER_PASSWORD` |
| **Role** | `super_admin` |

### Login Methods

**Via Browser:**
1. Navigate to `http://localhost:3000`
2. Enter your email and password on the login page
3. If MFA is enabled, enter the TOTP code from your authenticator app

**Via API:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@alolabs.net", "password": "changeme-secure-password-123"}'
```

Response:

```json
{
  "user": {
    "id": "clxxxxxx",
    "email": "admin@alolabs.net",
    "name": "Owner",
    "role": "super_admin"
  },
  "token": "a1b2c3d4e5..."
}
```

Use the `token` value in subsequent API requests as a Bearer token or in the `Authorization` header.

---

## 7. Verification Steps

### 7.1 Health Check

```bash
curl -s http://localhost:3000/api/health | head -c 200
```

Expected: HTTP 200 with JSON response containing status information.

### 7.2 API Authentication Test

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@alolabs.net", "password": "your-password"}' \
  | jq -r '.token')

echo "Token: ${TOKEN:0:20}..."

# Test authenticated endpoint
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 7.3 Dashboard Stats Test

```bash
curl -s http://localhost:3000/api/dashboard/stats \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 7.4 Database Connectivity

```bash
# SQLite
ls -la dev.db && sqlite3 dev.db "SELECT count(*) FROM User;"

# MariaDB (if using Docker)
mysql -h 127.0.0.1 -u alohub_user -palohub_dev_pass alohub_dev \
  -e "SELECT count(*) FROM User;" 2>/dev/null
```

---

## 8. Common Installation Issues

### `bun install` Fails with Native Module Errors

**Symptom:** Errors compiling `bcrypt`, `sharp`, or other native modules.

**Cause:** Missing build tools or incompatible Node/Bun version.

**Solution:**

```bash
# Ubuntu/Debian
sudo apt install -y build-essential python3-dev

# macOS
xcode-select --install

# If sharp fails specifically
bun add sharp@latest
```

### Prisma Generate Fails

**Symptom:** `Prisma Client could not be generated` or engine binary errors.

**Solution:**

```bash
# Clear Prisma cache and regenerate
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma
bun run db:generate

# If still failing, try with npx
npx prisma generate
```

### Port 3000 Already in Use

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solution:**

```bash
# Find and kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Or start on a different port
PORT=3001 bun run dev
```

### SQLite Database Locked

**Symptom:** `database is locked` errors during development.

**Solution:**

```bash
# Kill all Node/Bun processes
pkill -f "next dev"
pkill -f "bun.*server"

# Remove stale lock files
rm -f dev.db-wal dev.db-shm

# Restart
bun run dev
```

### Prisma Schema Push Fails on MariaDB

**Symptom:** Connection refused or access denied.

**Solution:**

```bash
# Verify MariaDB is running
docker compose ps

# Check connection
mysql -h 127.0.0.1 -u alohub_user -palohub_dev_pass -e "SELECT 1;"

# Ensure DATABASE_URL is correct in .env
# DATABASE_URL="mysql://alohub_user:alohub_dev_pass@127.0.0.1:3306/alohub_dev"
```

### `z-ai-web-dev-sdk` Import Errors

**Symptom:** Module not found or TypeScript errors related to `z-ai-web-dev-sdk`.

**Solution:**

```bash
# Reinstall the package
bun add z-ai-web-dev-sdk@latest

# Clear TypeScript cache
rm -rf .next
bun run dev
```

---

## 9. Platform-Specific Notes

### Ubuntu 24.04

```bash
# Install system dependencies
sudo apt update
sudo apt install -y build-essential python3-dev sqlite3 libsqlite3-dev \
  libssl-dev pkg-config git curl

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### macOS (Apple Silicon)

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install node sqlite3

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Rosetta 2 may be needed for some native modules
softwareupdate --install-rosetta
```

### Windows WSL2

```bash
# Ensure WSL2 is installed and updated
wsl --update

# Install within WSL2 Ubuntu
sudo apt update
sudo apt install -y build-essential python3-dev sqlite3 libsqlite3-dev git curl
curl -fsSL https://bun.sh/install | bash

# Note: Run the dev server inside WSL2, not from Windows
# Access via http://localhost:3000 from Windows browsers
```

### Windows (Native) — Not Officially Supported

While the project may work on native Windows, it is not tested. Use WSL2 for the best experience. If running natively:

1. Install Node.js 22 LTS from https://nodejs.org
2. Install Bun via PowerShell: `powershell -c "irm bun.sh/install.ps1 | iex"`
3. Install SQLite from https://www.sqlite.org/download.html
4. Run in a Git Bash or PowerShell terminal

---

## Next Steps

After successful installation:

- [Production Deployment Guide](./PRODUCTION-GUIDE.md) — Deploy to production
- [Environment Variables Reference](./ENVIRONMENT-VARIABLES.md) — All configuration options
- [AI System Guide](./AI-SYSTEM-GUIDE.md) — Configure AI providers and models
- [Troubleshooting Guide](./TROUBLESHOOTING.md) — Resolve common issues