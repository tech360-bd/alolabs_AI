# ALO Labs AIOS — Environment Variables Reference

> **Version:** 0.2.0  
> **Last Updated:** 2025

---

## Quick Reference

| Variable | Required | Default | Section |
|---|---|---|---|
| `NODE_ENV` | Recommended | `development` | [Application](#application) |
| `PORT` | Optional | `3000` | [Application](#application) |
| `DATABASE_URL` | **Required** | — | [Database](#database) |
| `NEXTAUTH_SECRET` | **Required** | — | [Authentication](#authentication) |
| `AUTH_OWNER_EMAIL` | **Required** | — | [Authentication](#authentication) |
| `AUTH_OWNER_PASSWORD` | **Required** | — | [Authentication](#authentication) |
| `API_GATEWAY_SECRET` | **Required** | — | [API Gateway](#api-gateway) |
| `API_KEY_ENCRYPTION_KEY` | **Required** | — | [API Gateway](#api-gateway) |
| `CSRF_SECRET` | **Required** | — | [Security](#security) |
| `SESSION_ENCRYPTION_KEY` | **Required** | — | [Security](#security) |
| `WEBHOOK_SECRET` | **Required** | — | [Security](#security) |
| `BACKUP_ENCRYPTION_KEY` | Optional | — | [Backup](#backup) |
| `ALLOWED_ORIGINS` | **Required** | — | [CORS](#cors) |
| `REDIS_URL` | Optional | — | [Redis](#redis) |
| `POSTGRES_URL` | Optional | — | [PostgreSQL](#postgresql) |
| `QDRANT_URL` | Optional | — | [Qdrant](#qdrant) |
| `MINIO_URL` | Optional | — | [MinIO](#minio) |
| `MINIO_ACCESS_KEY` | Optional | `minioadmin` | [MinIO](#minio) |
| `MINIO_SECRET_KEY` | Optional | `minioadmin` | [MinIO](#minio) |
| `SMTP_HOST` | Optional | — | [SMTP](#smtp) |
| `OPENROUTER_API_KEY` | Optional | — | [AI Providers](#ai-providers) |
| `OLLAMA_BASE_URL` | Optional | — | [AI Providers](#ai-providers) |
| `GRAFANA_USER` | Optional | `admin` | [Monitoring](#monitoring) |
| `GRAFANA_PASSWORD` | Optional | — | [Monitoring](#monitoring) |

---

## Application

### `NODE_ENV`

| Property | Value |
|---|---|
| **Required** | Recommended for production |
| **Default** | `development` |
| **Values** | `development`, `production`, `test` |

Controls application behavior:
- **production**: Disables detailed error messages, enables caching, uses optimized bundles
- **development**: Enables hot-reload, verbose errors, source maps

```env
NODE_ENV=production
```

### `PORT`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | `3000` (dev), `3004` (production via systemd) |
| **Example** | `3004` |

The port the Next.js server listens on. The systemd service and Nginx config expect `3004` in production.

```env
PORT=3004
```

---

## Database

### `DATABASE_URL`

| Property | Value |
|---|---|
| **Required** | **Yes — application will not start without it** |
| **Default** | None |
| **Format** | Varies by database provider |

**SQLite (development):**

```env
DATABASE_URL="file:./dev.db"
```

**MariaDB / MySQL:**

```env
DATABASE_URL="mysql://alohub_user:password@127.0.0.1:3306/alohub_production"
```

**PostgreSQL:**

```env
DATABASE_URL="postgresql://user:password@127.0.0.1:5432/agent_hub"
```

Format: `protocol://username:password@host:port/database_name`

---

## Authentication

### `NEXTAUTH_SECRET`

| Property | Value |
|---|---|
| **Required** | **Yes** |
| **Default** | None |
| **Description** | Secret used to sign and encrypt session tokens and CSRF tokens |

**Generate:**

```bash
openssl rand -base64 48
```

```env
NEXTAUTH_SECRET="REDACTED_EXAMPLE_CREDENTIAL"
```

### `AUTH_OWNER_EMAIL`

| Property | Value |
|---|---|
| **Required** | **Yes** (for first-time setup) |
| **Default** | None |
| **Description** | Email address for the initial super_admin user |

```env
AUTH_OWNER_EMAIL="admin@alolabs.net"
```

### `AUTH_OWNER_PASSWORD`

| Property | Value |
|---|---|
| **Required** | **Yes** (for first-time setup) |
| **Default** | None |
| **Description** | Password for the initial super_admin user. Hashed with bcrypt (12 rounds) on first login. |

```env
AUTH_OWNER_PASSWORD="use-a-strong-password-here"
```

---

## API Gateway

### `API_GATEWAY_SECRET`

| Property | Value |
|---|---|
| **Required** | **Yes** |
| **Default** | None |
| **Description** | Secret for API gateway HMAC signature verification |

Used by `src/lib/api-gateway.ts` to verify request signatures. API keys use HMAC-SHA256 signatures for request authentication.

```env
API_GATEWAY_SECRET="$(openssl rand -base64 48)"
```

### `API_KEY_ENCRYPTION_KEY`

| Property | Value |
|---|---|
| **Required** | **Yes** |
| **Default** | None |
| **Description** | AES-256 encryption key for API key storage. Must be at least 32 bytes. |

API keys are encrypted at rest using this key before storage in the `CompanyApiKey` table.

```env
API_KEY_ENCRYPTION_KEY="$(openssl rand -base64 48)"
```

---

## Security

### `CSRF_SECRET`

| Property | Value |
|---|---|
| **Required** | **Yes** |
| **Default** | None |
| **Description** | Secret for CSRF token generation and validation |

```env
CSRF_SECRET="$(openssl rand -base64 32)"
```

### `SESSION_ENCRYPTION_KEY`

| Property | Value |
|---|---|
| **Required** | **Yes** |
| **Default** | None |
| **Description** | Encryption key for session data. Must be at least 32 bytes. |

Sessions are stored in the database with 48-byte random tokens (see `src/lib/auth.ts`). This key provides an additional layer of encryption.

```env
SESSION_ENCRYPTION_KEY="$(openssl rand -base64 48)"
```

### `WEBHOOK_SECRET`

| Property | Value |
|---|---|
| **Required** | **Yes** |
| **Default** | None |
| **Description** | Secret for webhook signature verification (HMAC-SHA256) |

Incoming webhooks are verified against this secret to prevent spoofing.

```env
WEBHOOK_SECRET="$(openssl rand -base64 32)"
```

---

## Backup

### `BACKUP_ENCRYPTION_KEY`

| Property | Value |
|---|---|
| **Required** | Optional (strongly recommended for production) |
| **Default** | None (backups unencrypted if not set) |
| **Description** | Key for AES-256-CBC encryption of database backups |

When set, the backup script (`deploy/scripts/backup.sh`) encrypts database dumps using `openssl enc -aes-256-cbc`.

```env
BACKUP_ENCRYPTION_KEY="$(openssl rand -base64 48)"
```

---

## CORS

### `ALLOWED_ORIGINS`

| Property | Value |
|---|---|
| **Required** | **Yes** |
| **Default** | None |
| **Description** | Comma-separated list of allowed origin URLs for CORS |

```env
# Development
ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"

# Production
ALLOWED_ORIGINS="https://alolabs.net,https://panel.alolabs.net,https://api.alolabs.net"
```

---

## Redis

### `REDIS_URL`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | None |
| **Fallback** | In-memory Map-based storage (see `src/lib/redis.ts`) |
| **Description** | Redis connection URL for caching, rate limiting, and pub/sub |

```env
REDIS_URL="redis://127.0.0.1:6379"
```

**Fallback behavior:** When Redis is not configured or the connection fails, the system automatically falls back to in-memory storage. This means:
- Rate limiting still works (per-process)
- Caching works (per-process, lost on restart)
- Pub/sub is a no-op (no cross-process messaging)

Individual Redis variables are also supported:

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
REDIS_PREFIX=alohub:
```

---

## PostgreSQL

### `POSTGRES_URL`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | None |
| **Fallback** | PostgreSQL features disabled |
| **Description** | PostgreSQL connection URL for advanced analytics and cross-database queries |

Separate from the primary `DATABASE_URL` (which is used by Prisma). This connection is used for direct SQL queries via `src/lib/postgres.ts`.

```env
POSTGRES_URL="postgresql://user:password@127.0.0.1:5432/agent_hub"
```

Individual variables:

```env
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=agent_hub
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_SSL=false
POSTGRES_POOL_SIZE=10
```

---

## Qdrant

### `QDRANT_URL`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | None |
| **Fallback** | SQLite-based vector storage (degraded) |
| **Description** | Qdrant vector database URL for RAG (Retrieval-Augmented Generation) |

```env
QDRANT_URL="http://localhost:6333"
```

Individual variables:

```env
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_API_KEY=your-qdrant-api-key
QDRANT_TIMEOUT=10000
```

---

## MinIO

### `MINIO_URL`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | None |
| **Fallback** | Local filesystem (`storage/minio-fallback/`) |
| **Description** | S3-compatible object storage URL |

```env
MINIO_URL="http://minioadmin:minioadmin@localhost:9000"
```

### `MINIO_ACCESS_KEY`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | `minioadmin` |
| **Description** | MinIO/S3 access key |

```env
MINIO_ACCESS_KEY="your-access-key"
```

### `MINIO_SECRET_KEY`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | `minioadmin` |
| **Description** | MinIO/S3 secret key |

```env
MINIO_SECRET_KEY="your-secret-key"
```

Additional MinIO variables:

```env
MINIO_HOST=localhost
MINIO_PORT=9000
MINIO_SSL=false
MINIO_REGION=us-east-1
MINIO_BUCKET=agent-hub
```

---

## SMTP

### `SMTP_HOST`

| Property | Value |
|---|---|
| **Required** | Optional (required for email features) |
| **Default** | None |
| **Description** | SMTP server hostname |

```env
SMTP_HOST="smtp.gmail.com"
```

### `SMTP_PORT`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | `587` |
| **Description** | SMTP server port (587=TLS, 465=SSL, 25=unencrypted) |

```env
SMTP_PORT=587
```

### `SMTP_USER`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | None |
| **Description** | SMTP authentication username |

```env
SMTP_USER="your-email@gmail.com"
```

### `SMTP_PASS`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | None |
| **Description** | SMTP authentication password or app-specific password |

```env
SMTP_PASS="your-app-password"
```

### `SMTP_FROM`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | None |
| **Description** | From address for outgoing emails |

```env
SMTP_FROM="ALO Labs <noreply@alolabs.net>"
```

---

## AI Providers

### `OPENROUTER_API_KEY`

| Property | Value |
|---|---|
| **Required** | Optional (required for OpenRouter AI models) |
| **Default** | None |
| **Description** | API key for OpenRouter.ai multi-model AI gateway |

```env
OPENROUTER_API_KEY="sk-or-v1-xxxxxxxxxxxxxxxx"
```

### `OLLAMA_BASE_URL`

| Property | Value |
|---|---|
| **Required** | Optional (required for local Ollama models) |
| **Default** | `http://localhost:11434` |
| **Description** | Base URL for Ollama local LLM server |

```env
OLLAMA_BASE_URL="http://localhost:11434"
```

### Embedding Variables (RAG)

```env
EMBEDDING_API_URL="https://api.openai.com/v1/embeddings"
EMBEDDING_API_KEY="sk-xxxxxxxx"
EMBEDDING_MODEL="text-embedding-3-small"
```

---

## Monitoring

### `GRAFANA_USER`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | `admin` |
| **Description** | Grafana admin username (used in `docker-compose.monitoring.yml`) |

```env
GRAFANA_USER="admin"
```

### `GRAFANA_PASSWORD`

| Property | Value |
|---|---|
| **Required** | Optional (required for production monitoring) |
| **Default** | `change_me_in_production` |
| **Description** | Grafana admin password |

```env
GRAFANA_PASSWORD="your-secure-grafana-password"
```

### `GRAFANA_URL`

| Property | Value |
|---|---|
| **Required** | Optional |
| **Default** | `http://localhost:3001` |
| **Description** | External URL for Grafana (used in links) |

```env
GRAFANA_URL="https://grafana.alolabs.net"
```

---

## Docker Compose Variables

Used by `docker-compose.yml` for the development database stack:

| Variable | Default | Description |
|---|---|---|
| `DB_ROOT_PASSWORD` | `alolabs_root_dev` | MariaDB root password |
| `DB_NAME` | `alohub_dev` | Database name |
| `DB_USER` | `alohub_user` | Database user |
| `DB_PASSWORD` | `alohub_dev_pass` | Database user password |

---

## Secret Generation Script

Generate all required secrets at once:

```bash
#!/bin/bash
echo "# Generated $(date -Iseconds)"
echo "NEXTAUTH_SECRET=$(openssl rand -base64 48)"
echo "API_GATEWAY_SECRET=$(openssl rand -base64 48)"
echo "API_KEY_ENCRYPTION_KEY=$(openssl rand -base64 48)"
echo "CSRF_SECRET=$(openssl rand -base64 32)"
echo "SESSION_ENCRYPTION_KEY=$(openssl rand -base64 48)"
echo "WEBHOOK_SECRET=$(openssl rand -base64 32)"
echo "BACKUP_ENCRYPTION_KEY=$(openssl rand -base64 48)"
echo "AUTH_OWNER_PASSWORD=$(openssl rand -base64 24)"
```