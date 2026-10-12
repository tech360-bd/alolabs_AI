# ALO Labs Command Center (alolabs.net)

The Central AI Brain and management center for ALO companies. It integrates AI agent lifecycle, multi-tenant workflows, centralized prompt libraries, and robust compliance auditing.

## Architecture

```
                       ┌─────────────────────────┐
                       │   alolabs.net Portal    │
                       └────────────┬────────────┘
                                    │
          ┌─────────────────────────┼────────────────────────┐
          ▼                         ▼                        ▼
┌──────────────────┐      ┌──────────────────┐     ┌──────────────────┐
│  ALO Education   │      │     TECH360      │     │ English Portal   │
│ aloeducation.com │      │  bdtech360.com   │     │ (Sub-brand)      │
└──────────────────┘      └──────────────────┘     └──────────────────┘
```

## Quick Start

### 1. Configure local environment
```bash
cp .env.example .env
```

### 2. Start Services via Docker Compose
```bash
docker compose up -d --build
```
This launches:
- **Command Center App** on `http://localhost:3000`
- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`
- **MinIO S3** Console on `http://localhost:9001` (API on `localhost:9000`)

### 3. Production Deployment
Refer to `DEPLOYMENT.md` for Coolify, SSL, and Nginx setups.
