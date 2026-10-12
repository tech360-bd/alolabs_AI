# AgentOS security status (2026-10-08)

**NOT production-certified.** The legacy security guide below documents intended
controls across the older product; it is not a completed penetration test.
The new v1 surface uses session membership or tenant API keys with exact
resource scopes; new run/project/artifact handlers check company membership.
Known gaps: legacy-route tenant review, file storage ACLs/metadata, approval
resume, SSRF/tool injection, prompt-injection resilience and provider secret
redaction require independent verification. Never give agents admin credentials.
See the [final audit](../ALO_LABS_AGENTOS_FINAL_AUDIT.md) and
[deployment guide](DEPLOYMENT_GUIDE.md) for release gates.

---

# ALO Labs Agent Hub — Security Documentation

> **Classification:** Internal — Security Architecture  
> **Version:** Production  
> **Last Updated:** 2025

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Authorization](#2-authorization)
3. [API Key System](#3-api-key-system)
4. [Data Protection](#4-data-protection)
5. [Security Headers & CORS](#5-security-headers--cors)
6. [Rate Limiting](#6-rate-limiting)
7. [CSRF / XSS / SQL Injection Protection](#7-csrf--xss--sql-injection-protection)
8. [Audit Logging](#8-audit-logging)
9. [Security Event Monitoring](#9-security-event-monitoring)
10. [Incident Response](#10-incident-response-procedures)
11. [Compliance Considerations](#11-compliance-considerations)
12. [Security Checklist for Production](#12-security-checklist-for-production)

---

## 1. Authentication

### 1.1 Session-Based Authentication

The ALO Labs Agent Hub uses a custom session-based authentication system built on cryptographically random tokens stored in the database.

**Flow:**

```
Client                    Server
  |                         |
  |  POST /api/auth/login   |
  |  { email, password }    |
  |────────────────────────>|
  |                         | 1. Look up user by email
  |                         | 2. Verify password (bcrypt)
  |                         | 3. Check isActive flag
  |                         | 4. Check if MFA enabled
  |                         | 5. Generate 48-byte random token
  |                         | 6. Store session in Settings table
  |                         | 7. Update lastLoginAt
  |  { user, token }        |
  |<────────────────────────|
  |                         |
  |  GET /api/agents        |
  |  Authorization: Bearer  |
  |────────────────────────>|
  |                         | 1. Extract token from header
  |                         | 2. Look up session in Settings
  |                         | 3. Parse userId from session
  |                         | 4. Verify user exists & isActive
  |                         | 5. Proceed with request
  |  { data }               |
  |<────────────────────────|
```

**Session Storage:**

Sessions are stored as `Settings` records with key format `session:<token>`:

```
Key:    session:a1b2c3d4...96-char-hex
Value:  {"userId": "clx..."}
Type:   json
```

**Token Generation:**

```typescript
// 48 bytes = 96 hex characters
const token = crypto.randomBytes(48).toString('hex');
```

**Session Validation (per request):**

The `requireAuth()` function in `src/lib/api-auth.ts` performs:

1. Extract `Authorization: Bearer <token>` header
2. Look up `session:<token>` in the `Settings` table
3. Parse JSON to extract `userId`
4. Fetch user record, verify `isActive === true`
5. Return `{ userId, role, email, name }` or throw `Error('Unauthorized')`

**Session Invalidation:**

On logout, the session record is deleted from the `Settings` table:

```typescript
await db.settings.delete({ where: { key: `session:${token}` } });
```

### 1.2 Password Hashing

Passwords are hashed using **bcrypt** with 12 salt rounds:

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;
const hash = await bcrypt.hash(password, SALT_ROUNDS);
const isValid = await bcrypt.compare(password, hash);
```

| Property         | Value          |
|------------------|----------------|
| Algorithm        | bcrypt         |
| Salt Rounds      | 12             |
| Hash Format      | `$2b$12$...`   |
| Plaintext Access | Never stored   |

### 1.3 Multi-Factor Authentication (MFA)

MFA is implemented using **TOTP** (Time-Based One-Time Password) per RFC 6238.

**Setup Flow:**

1. User requests MFA setup via `POST /api/auth/mfa/setup`
2. Server generates a TOTP secret (Base32 encoded)
3. Server returns the secret, QR URI, and 10 one-time backup codes
4. User scans QR code with authenticator app (Google Authenticator, Authy, etc.)
5. User verifies with a 6-digit code via `POST /api/auth/mfa/verify`
6. On successful verification, `otpEnabled` is set to `true` and `otpSecret` is stored

**Login with MFA Enabled:**

When a user with MFA enabled logs in, the login endpoint returns `mfaPending: true` without a session token. The client must then call `POST /api/auth/mfa/verify` with the TOTP code to receive the actual session token.

**MFA Configuration:**

| Property     | Value                        |
|--------------|------------------------------|
| Algorithm    | SHA-1 (TOTP standard)        |
| Digits       | 6                            |
| Period       | 30 seconds                   |
| Issuer       | Configurable via `TOTP_ISSUER` env var |
| Backup Codes | 10 one-time use codes        |

**Disabling MFA:**

Requires the current TOTP code for confirmation. This prevents an attacker who gains session access from disabling MFA without the authenticator.

### 1.4 Account Status

| State      | Behavior                                    |
|------------|---------------------------------------------|
| `isActive: true` | Normal login and API access allowed   |
| `isActive: false` | Login returns 403 "Account is disabled" |

Inactive accounts cannot authenticate. All session tokens for disabled accounts remain valid until the session record is deleted (tokens are not proactively invalidated on disable — this is a known limitation that can be addressed by adding a status check in `requireAuth()`).

---

## 2. Authorization

### 2.1 Role-Based Access Control (RBAC)

The system implements a 5-tier role hierarchy:

| Role         | Level | Capabilities                                          |
|--------------|-------|-------------------------------------------------------|
| `super_admin`| 5     | Full system access. Can manage all companies, users, plans, OAuth, SSO. Required for: creating plans, production deployments, credential access |
| `admin`      | 4     | Administrative access. Can manage most resources within their scope |
| `manager`    | 3     | Team management. Can manage agents, skills, workflows. Can approve requests |
| `operator`   | 2     | Operational access. Can execute agents and workflows. Can view most data |
| `viewer`     | 1     | Read-only access. Cannot modify any resources          |

**Role Enforcement:**

```typescript
// Require any authenticated user
const user = await requireAuth();

// Require specific role(s)
const user = await requireRole('super_admin', 'admin');
```

When a user's role doesn't match, the endpoint returns:
- `401 Unauthorized` — if not authenticated
- `403 Forbidden` — if authenticated but role is insufficient

### 2.2 Permission System

Beyond roles, a fine-grained permission system exists in the database:

**Models:**

- `Role` — Defined roles with descriptions
- `Permission` — Granular permissions (resource + action)
- `RolePermission` — Many-to-many join table linking roles to permissions

**Permission Structure:**

| Permission | Resource    | Action       | Description                              |
|------------|-------------|--------------|------------------------------------------|
| `agents:read`  | agents | read   | View agent configurations                |
| `agents:write` | agents | write  | Create/modify agents                     |
| `agents:delete`| agents | delete | Delete agents                            |
| `skills:read`  | skills | read   | View skills                              |
| `skills:write` | skills | write  | Create/modify skills                     |
| `billing:admin`| billing| admin  | Manage billing and subscriptions          |

### 2.3 Company (Tenant) Isolation

The multi-tenant architecture enforces strict company isolation:

**Database-Level Isolation:**

- Every agent, skill, task, and usage record is associated with a `companyId`
- The 18-category protection engine **always blocks** cross-company data access (Rule #16)
- Query filters must include `companyId` where applicable

**Protection Rule #16 — Cross-Company Leakage:**

```typescript
// This is ALWAYS BLOCKED regardless of other rules
if (check.isCrossCompanyAccess) {
  result.allowed = false;
  result.riskLevel = 'critical';
  result.blockedRules.push('cross_company_leakage');
}
```

**Environment Controls:**

| Variable                    | Default | Purpose                                  |
|-----------------------------|---------|------------------------------------------|
| `CROSS_COMPANY_DATA_ACCESS` | `false` | Global kill switch for cross-company access |
| `PRIVATE_AI_AGENTS`         | `true`  | Agents are private to their company     |

---

## 3. API Key System

### 3.1 Key Generation

API keys are generated using cryptographically secure random bytes:

```typescript
const plainKey = `alo_${company.slug}_${crypto.randomBytes(32).toString('hex')}`;
// Example: alo_alo-labs_a1b2c3d4e5f6789...64-hex-chars
```

| Component        | Format                     | Length      |
|------------------|----------------------------|-------------|
| Prefix           | `alo_`                     | 4 chars    |
| Company slug     | URL-safe company identifier | Variable   |
| Separator        | `_`                        | 1 char     |
| Random component | `crypto.randomBytes(32).toString('hex')` | 64 chars |

**Total key length:** ~80+ characters (sufficient entropy: 256 bits)

### 3.2 Key Storage

API keys are **never stored in plaintext**. Only the SHA-256 hash is persisted:

```typescript
const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
const keyPrefix = plainKey.slice(0, 12);  // For identification
const keySuffix = plainKey.slice(-4);       // For partial display
```

| Field        | Stored? | Purpose                                    |
|--------------|---------|--------------------------------------------|
| `plainKey`   | **No**  | Returned only once at creation time        |
| `keyHash`    | Yes     | SHA-256 hash for verification              |
| `keyPrefix`  | Yes     | First 12 chars for identification in UI    |
| `keySuffix`  | Yes     | Last 4 chars for display (e.g., `...a1b2`) |

### 3.3 Key Verification

```typescript
async function verifyApiKey(apiKey: string) {
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keyRecord = await db.companyApiKey.findUnique({ where: { keyHash } });
  
  if (!keyRecord) return null;
  if (!keyRecord.isActive) return null;
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) return null;
  
  const company = keyRecord.company;
  if (company.status !== 'active') return null;
  
  return { ...keyRecord, scopes: JSON.parse(keyRecord.scopes) };
}
```

### 3.4 HMAC-SHA256 Request Signing

For enhanced security, API requests can be signed with HMAC-SHA256:

**Signature Construction:**

```
payload = METHOD + "\n" + URL + "\n" + TIMESTAMP + "\n" + BODY_JSON
signature = HMAC-SHA256(payload, api_key)
```

**Headers Required:**

| Header             | Description                               |
|--------------------|-------------------------------------------|
| `X-ALO-Timestamp`  | Unix timestamp in milliseconds            |
| `X-ALO-Signature`  | Hex-encoded HMAC-SHA256 signature         |
| `X-ALO-Company-Id` | Company ID for multi-tenant routing       |
| `X-ALO-User-Id`    | Optional user ID for audit trail          |
| `X-ALO-Request-Id` | Unique request ID for tracing             |

**Verification:**

```typescript
function verifyHMAC(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}
```

**Timing-Safe Comparison:** The `crypto.timingSafeEqual` function is used to prevent timing attacks that could reveal the expected signature byte-by-byte.

**Timestamp Validation:** Requests with timestamps older than 5 minutes are rejected to prevent replay attacks.

### 3.5 Key Scoping

API keys support scoped permissions via the `scopes` field:

```json
["agents:read", "agents:write", "skills:read", "workflows:execute"]
```

The gateway verification returns the key's scopes, allowing downstream handlers to check permissions:

```typescript
if (!gatewayResult.apiKey?.scopes.includes('agents:write')) {
  return NextResponse.json({ error: 'Insufficient scope' }, { status: 403 });
}
```

### 3.6 Key Rotation

To rotate an API key:

1. Create a new key via `POST /api/api-keys`
2. Update all clients to use the new key
3. Delete the old key via `DELETE /api/api-keys/[id]`

The system does not currently enforce key expiration. Keys can have an optional `expiresAt` date, but this is set at creation time. For security, it is recommended to:

- Set `expiresAt` on all production keys (e.g., 90 days)
- Use `keyType: "test"` for development/testing
- Rotate keys on a regular schedule

### 3.7 Key Metadata

| Field         | Type    | Description                          |
|---------------|---------|--------------------------------------|
| `keyType`     | string  | `test` or `production`               |
| `rateLimit`   | number  | Requests per minute (default: 1000)  |
| `isActive`    | boolean | Can be toggled to revoke access      |
| `expiresAt`   | date    | Optional expiration date             |
| `lastUsedAt`  | date    | Automatically updated on each use    |

---

## 4. Data Protection

### 4.1 Encryption at Rest

**Database:**

- MariaDB supports TLS for connections (configure via `DATABASE_URL` with `?ssl=true`)
- Transparent Data Encryption (TDE) can be enabled at the MariaDB level for disk encryption
- Sensitive fields (`passwordHash`, `otpSecret`) are already hashed/encrypted before storage

**API Keys:**

- Only SHA-256 hashes are stored; plaintext keys are never persisted

**Backups:**

- Database dumps are encrypted with AES-256-CBC when `BACKUP_ENCRYPTION_KEY` is set:
  ```bash
  openssl enc -aes-256-cbc -salt -pbkdf2 \
    -in database.sql.gz -out database.sql.gz.enc \
    -pass pass:$BACKUP_ENCRYPTION_KEY
  ```

**Environment File:**

- `.env` has `600` permissions (owner-read/write only)
- Contains all secrets (database password, NEXTAUTH_SECRET, API_GATEWAY_SECRET, etc.)

### 4.2 Encryption in Transit

**TLS Configuration (Nginx):**

| Setting                    | Value                                  |
|----------------------------|----------------------------------------|
| Protocols                  | TLS 1.2, TLS 1.3                       |
| Ciphers (TLS 1.2)         | ECDHE-ECDSA-AES128-GCM-SHA256, ECDHE-RSA-AES128-GCM-SHA256, ECDHE-ECDSA-AES256-GCM-SHA384, ECDHE-RSA-AES256-GCM-SHA384 |
| Session Cache              | Shared 10MB, 1 day timeout             |
| Session Tickets            | Disabled                               |
| OCSP Stapling              | Enabled                                |
| DH Parameters              | 2048-bit                               |
| HSTS                       | max-age=63072000; includeSubDomains; preload |

**Certificate Management:**

- Let's Encrypt certificates with automatic renewal (daily cron at 3:00 AM)
- Certificate files stored in `/etc/letsencrypt/live/`

**Internal Communication:**

- Database connections: localhost only (no network exposure)
- Redis connections: localhost only, `protected-mode yes`
- Application server: bound to `127.0.0.1`, exposed only via Nginx reverse proxy

### 4.3 Secret Management

| Secret                    | Generation Method                    | Storage            |
|---------------------------|--------------------------------------|--------------------|
| `NEXTAUTH_SECRET`         | `openssl rand -base64 32`            | `.env` file        |
| `API_GATEWAY_SECRET`      | `openssl rand -base64 32`            | `.env` file        |
| `API_KEY_ENCRYPTION_KEY`  | `openssl rand -hex 16` (32 chars)    | `.env` file        |
| `CSRF_SECRET`             | `openssl rand -base64 32`            | `.env` file        |
| `SESSION_ENCRYPTION_KEY`  | `openssl rand -hex 16` (32 chars)    | `.env` file        |
| `WEBHOOK_SECRET`          | `openssl rand -base64 32`            | `.env` file        |
| `BACKUP_ENCRYPTION_KEY`   | `openssl rand -hex 16` (32 chars)    | `.env` file        |
| DB Password               | `openssl rand -base64 32` (truncated) | `.env` file      |

All secrets are generated automatically by the installation script and are never committed to version control.

### 4.4 Data Classification

The system supports 5 data classification levels, which are evaluated by the protection engine:

| Level          | Risk Level | Protection Rules Applied                                |
|----------------|------------|----------------------------------------------------------|
| `public`       | None       | Minimal restrictions                                    |
| `internal`     | Low        | Standard access controls                                 |
| `confidential` | Medium     | Approval may be required for external sharing           |
| `restricted`   | High       | Approval required, limited access                       |
| `secret`       | Critical   | Super Admin only, strictest controls, full audit trail  |

---

## 5. Security Headers & CORS

### 5.1 Nginx Security Headers

All responses include the following security headers (defined in `/etc/nginx/snippets/security-headers.conf`):

```http
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' wss: https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**Domain-Specific Framing:**

| Domain                | X-Frame-Options  | Purpose                         |
|-----------------------|------------------|---------------------------------|
| `alolabs.net`         | (from CSP)       | Standard framing protection      |
| `panel.alolabs.net`   | `SAMEORIGIN`     | Panel cannot be iframed externally |
| `api.alolabs.net`     | `DENY`           | API cannot be framed at all      |

### 5.2 CORS Configuration

CORS is configured via the `ALLOWED_ORIGINS` environment variable:

```
ALLOWED_ORIGINS=https://alolabs.net,https://panel.alolabs.net,https://api.alolabs.net,https://www.alolabs.net
```

Only the listed origins are permitted for cross-origin requests. This is enforced at the application level.

### 5.3 WebSocket Security

WebSocket connections (Socket.IO for the queue service) are proxied through Nginx with:

- 24-hour read/write timeouts
- Origin validation via `X-Forwarded-Proto`
- WebSocket upgrade headers properly forwarded

---

## 6. Rate Limiting

### 6.1 Nginx-Level Rate Limiting

Three rate-limiting zones are configured in Nginx:

| Zone          | Rate       | Burst | Applied To                |
|---------------|------------|-------|---------------------------|
| `auth_limit`  | 5 req/min  | 5     | `/api/auth/*` on panel    |
| `panel_limit` | 30 req/min | 20    | Panel page requests       |
| `api_limit`   | 60 req/min | 30    | API endpoints             |

Excess requests receive `429 Too Many Requests`.

### 6.2 Application-Level Rate Limiting

The API gateway enforces per-key rate limiting using an in-memory store:

```typescript
function checkRateLimit(apiKeyId: string, limit: number = 1000): boolean {
  const now = Date.now();
  const windowKey = `${apiKeyId}:${Math.floor(now / 60_000)}`;
  // ... sliding window per-minute counter
}
```

| Feature                | Value                          |
|------------------------|--------------------------------|
| Algorithm              | Fixed window (per minute)      |
| Default limit          | 1000 requests/minute/key       |
| Per-key configuration  | Yes (via `rateLimit` field)    |
| Cleanup interval       | Every 60 seconds (automatic)   |
| Storage                | In-memory `Map`                |

**Rate Limit Response (429):**

```json
{
  "error": "Rate limit exceeded. Maximum 1000 requests per minute."
}
```

### 6.3 Environment Variables

| Variable                  | Default | Description                    |
|---------------------------|---------|--------------------------------|
| `RATE_LIMIT_WINDOW_MS`    | `60000` | Rate limit window in ms        |
| `RATE_LIMIT_MAX_REQUESTS` | `100`   | Max requests per window/client |

---

## 7. CSRF / XSS / SQL Injection Protection

### 7.1 CSRF Protection

- **CSRF Secret:** A dedicated `CSRF_SECRET` is generated for signing CSRF tokens
- **SameSite Cookies:** Next.js cookies use `SameSite=Lax` by default
- **Origin Verification:** CORS configuration restricts requests to known origins
- **State-Changing Methods:** All POST/PUT/DELETE endpoints require authentication

### 7.2 XSS Protection

**Headers:**

- `X-XSS-Protection: 1; mode=block` — Enables browser's built-in XSS filter
- `X-Content-Type-Options: nosniff` — Prevents MIME type sniffing
- `Content-Security-Policy` — Restricts script sources to `'self'`, `'unsafe-inline'`, `'unsafe-eval'`

**Application-Level:**

- React's built-in JSX escaping prevents XSS in rendered content
- User input is escaped before rendering in the UI
- Prompt content is stored as strings and rendered within controlled components

### 7.3 SQL Injection Protection

**Prisma ORM:** All database queries use Prisma's parameterized query builder, which prevents SQL injection by design:

```typescript
// Safe — Prisma parameterizes the input
db.agent.findMany({
  where: { name: { contains: userInput } }  // userInput is parameterized
});
```

**No Raw Queries:** The codebase does not use raw SQL queries (`$queryRaw`, `$executeRaw`) in any API route, eliminating the SQL injection surface.

### 7.4 Prompt Injection Protection

The protection engine includes **Rule #18 — Model Output Validation**, which detects 13 categories of prompt injection patterns:

| Pattern Category        | Examples                                      |
|-------------------------|-----------------------------------------------|
| Instruction override    | "ignore previous instructions", "forget rules" |
| Role manipulation       | "you are now...", "act as..."                 |
| Data extraction         | "reveal your system prompt", "show me rules"   |
| Privilege escalation    | "you have admin access", "bypass restrictions"|
| Output manipulation     | "output only...", "respond with..."           |
| Context injection       | "[SYSTEM]", "[INST]", "###" delimiters         |
| Encoding bypass         | Base64, Unicode, HTML entity encoded attacks  |
| Chain-of-thought attack | "think step by step", "let's reason"          |
| Tool misuse            | "use the tool to...", "execute command..."    |
| Exfiltration attempts   | "send data to...", "POST to...", "curl..."    |
| Multi-turn manipulation | Multi-step attempts to lower guardrails       |
| Delimiter injection     | Attempts to break structured output formats    |
| Language manipulation   | "in French/Chinese/...", natural language tricks|

---

## 8. Audit Logging

### 8.1 Audit Log Model

The `AuditLog` model records all significant actions:

| Field       | Type      | Description                       |
|-------------|-----------|-----------------------------------|
| `userId`    | string    | User who performed the action     |
| `action`    | string    | Action type (create, update, delete, login, etc.) |
| `resource`  | string    | Resource type (agents, skills, settings, etc.) |
| `details`   | string    | JSON-encoded action details       |
| `ipAddress` | string    | Client IP address                 |
| `userAgent` | string    | Client user agent                 |
| `createdAt` | datetime  | Timestamp of the action          |

### 8.2 What Gets Logged

Actions that create audit log entries include:

- **Skill creation:** Logs skill ID and name
- **Agent modifications:** Logs agent ID and changes
- **User login:** Updates `lastLoginAt` (could be extended to audit log)
- **Protection evaluations:** Logged to protection logs
- **API key creation:** Tracked in API key metadata
- **Configuration changes:** Logged via Settings updates

### 8.3 Log Retention

| Log Type              | Retention | Configured Via                    |
|-----------------------|-----------|-----------------------------------|
| Audit logs            | 365 days  | `AUDIT_LOG_RETENTION_DAYS`        |
| Security event logs   | 730 days  | `SECURITY_LOG_RETENTION_DAYS`     |
| Application logs      | 30 days   | `/etc/logrotate.d/alolabs-agent-hub` |
| Server logs (journal) | 7 days    | journald configuration             |

### 8.4 Centralized Logging

The `/api/logs` endpoint provides a centralized logging interface:

- **POST** — Ingests log entries, creating `ServerLog` and `ErrorLog` records
- **GET** — Paginated log query with level filtering (info, warn, error)
- **DELETE** — Prunes old logs based on retention settings

---

## 9. Security Event Monitoring

### 9.1 Alert System

The alerting system supports three severity levels:

| Severity  | Description                         | Default Action            |
|-----------|-------------------------------------|---------------------------|
| `info`    | Informational events                | Log only                  |
| `warning` | Potential issues                    | Alert + notify            |
| `critical`| Active security or stability threat  | Page + immediate response |

**Alert Lifecycle:**

1. **Created** via `POST /api/alerts` with a condition expression
2. **Fired** when condition is met (`isFiring: true`, `lastFiredAt` updated)
3. **Silenced** temporarily via `PATCH /api/alerts` with `silencedUntil`
4. **Acknowledged** via `PATCH /api/alerts` with `acknowledge: true` (silences for 24h)
5. **Resolved** when condition clears (`isFiring: false`)

### 9.2 Observability Dashboard

The Observatory panel provides real-time monitoring:

- **System Status Cards:** Health, Active Agents, Queue Depth, Token Usage
- **Request Rate Chart:** Line chart of API requests over time
- **Token Consumption Chart:** Bar chart of token usage
- **Service Health Grid:** Status of 5 internal services
- **Active Alerts Table:** With silence/acknowledge actions
- **Recent Logs Viewer:** Filterable by level (All/Error/Warning/Info)
- **Metrics Explorer:** Ad-hoc metric queries
- **Auto-refresh:** Every 30 seconds

### 9.3 Health Checks

Three levels of health checking:

| Endpoint              | Scope                        | Access          |
|-----------------------|------------------------------|-----------------|
| `GET /api/health`     | Basic counts + feature flags | Private IPs only (Nginx) |
| `GET /api/health/deep`| Database, Redis, dependencies| Private IPs only (Nginx) |
| `GET /api/system-health` | Full system health       | All            |

### 9.4 Metrics Collection

The metrics collector (`src/lib/metrics-collector.ts`) tracks 8 system metrics:

1. **Total agents** and active count
2. **Task completion rate** (success/failure ratio)
3. **Queue depth** (pending + processing items)
4. **Company count** and active status
5. **Token usage** (daily and monthly)
6. **API request counts**
7. **Error rates**
8. **Response latency**

Metrics can be:
- Collected on-demand via `POST /api/metrics/collect`
- Exported in Prometheus format via `GET /api/metrics/prometheus`

### 9.5 Fail2Ban Integration

Fail2Ban is installed and configured by the installer for SSH brute-force protection. UFW firewall rules allow only SSH (22), HTTP (80), and HTTPS (443).

---

## 10. Incident Response Procedures

### 10.1 Severity Classification

| Severity | Description                                | Response Time | Example                               |
|----------|--------------------------------------------|---------------|---------------------------------------|
| P0       | Active breach, data exfiltration, system down | Immediate (<15 min) | Database compromised, ransomware detected |
| P1       | Security vulnerability exploited, service degraded | <1 hour  | Unauthorized access detected, protection bypass |
| P2       | Potential security issue, minor service impact | <4 hours   | Unusual login patterns, high error rates |
| P3       | Low-risk security event, informational     | <24 hours  | Failed login spike, minor misconfiguration |

### 10.2 Response Workflow

**Phase 1: Detection & Triage (0–15 minutes)**

1. Identify the incident via alerts, logs, or external report
2. Classify severity (P0–P3)
3. Activate incident response team (P0/P1)
4. Create incident record via `POST /api/incidents`

**Phase 2: Containment (15–60 minutes)**

1. Activate emergency kill switches if needed (`POST /api/emergency`)
   - Global Emergency Stop
   - Disable specific agent/skill/workflow
   - Disable API keys
   - Block specific company access
2. Rotate compromised credentials
3. Isolate affected systems

**Phase 3: Eradication (1–4 hours)**

1. Identify root cause
2. Remove malicious access
3. Patch vulnerabilities
4. Update protection rules if needed

**Phase 4: Recovery**

1. Restore from backup if needed (`POST /api/backups/restore`)
2. Verify system integrity via health checks
3. Gradually re-enable services
4. Monitor for recurrence

**Phase 5: Post-Incident**

1. Complete incident report in the incident record
2. Update protection rules based on lessons learned
3. Review and update security checklist
4. Schedule follow-up security review

### 10.3 Emergency Kill Switches

The system provides 8 emergency kill switches accessible via the Emergency panel and API:

| Switch                      | Effect                                          |
|-----------------------------|-------------------------------------------------|
| Global Emergency Stop       | Halts all agent, skill, and workflow execution  |
| Disable All External APIs   | Blocks all external API calls                   |
| Disable Cross-Company Access| Enforces strict company isolation               |
| Disable Public Publishing   | Prevents any public-facing content changes      |
| Disable New Registrations   | Blocks new user/account creation                |
| Disable File Uploads        | Blocks all file upload endpoints                |
| Enable Maintenance Mode     | Shows maintenance page to all users             |
| Force Re-authentication     | Invalidates all active sessions                 |

All emergency switch activations are logged to the audit trail.

---

## 11. Compliance Considerations

### 11.1 Data Privacy

| Feature                            | Implementation                                       |
|------------------------------------|------------------------------------------------------|
| Minimized data collection          | Only essential user data is collected                |
| Purpose limitation                 | Data used only for system operation                  |
| Student privacy protection         | Rule #15 in protection engine (strict + privacy officer approval) |
| Right to deletion                  | Account disable + data deletion capabilities          |
| Data portability                   | Export capabilities via API and backup system         |
| Consent management                 | User registration implies consent for system operation|

### 11.2 Access Control

| Requirement              | Implementation                                 |
|--------------------------|------------------------------------------------|
| Unique identification    | CUID primary keys, unique emails               |
| Role-based access        | 5-tier RBAC + fine-grained permissions         |
| Least privilege          | Default role is `viewer` (read-only)           |
| Separation of duties     | Approval workflows for critical actions         |
| Multi-tenant isolation   | Database-level company scoping + protection rules|

### 11.3 Audit & Accountability

| Requirement                  | Implementation                                  |
|------------------------------|--------------------------------------------------|
| Audit trail                  | AuditLog model with user, action, resource, timestamp |
| Non-repudiation              | Sessions linked to userId, IP tracking available |
| Log retention                | 365–730 day configurable retention               |
| Tamper evidence              | Database-level integrity, backup encryption      |

### 11.4 Infrastructure Security

| Requirement                  | Implementation                                  |
|------------------------------|--------------------------------------------------|
| Encryption in transit        | TLS 1.2/1.3, HSTS with preload                  |
| Encryption at rest           | AES-256 for backups, bcrypt for passwords       |
| Network segmentation          | Nginx reverse proxy, localhost-only DB/Redis    |
| Firewall                     | UFW (SSH, HTTP, HTTPS only)                     |
| Intrusion detection          | Fail2Ban, protection rule engine, alerting     |
| System hardening             | systemd security directives (NoNewPrivileges, ProtectSystem, etc.) |
| Regular updates              | Automated upgrade script with rollback          |

### 11.5 Availability

| Requirement                  | Implementation                                  |
|------------------------------|--------------------------------------------------|
| High availability            | Systemd auto-restart on failure (Restart=on-failure) |
| Backup & recovery            | Automated daily backups, encrypted, with restore |
| Disaster recovery            | Backup upload to external storage, rollback scripts |
| Monitoring                   | Health checks, alerts, observability dashboard  |

---

## 12. Security Checklist for Production

Use this checklist before deploying to production and for periodic security reviews.

### Pre-Deployment

- [ ] **All secrets replaced** — No `CHANGE_ME_*` values in `.env`
- [ ] **`AUTH_OWNER_PASSWORD` set** — Strong, unique password for initial super admin
- [ ] **`.env` permissions** — `chmod 600 .env`
- [ ] **File permissions** — App directory `750`, data/backups `700`
- [ ] **SSL certificates installed** — All 4 domains have valid Let's Encrypt certs
- [ ] **HSTS enabled** — Verify `Strict-Transport-Security` header is present
- [ ] **Database secured** — MariaDB root password set, anonymous users removed, test DB dropped
- [ ] **Redis secured** — Bound to localhost, dangerous commands disabled, `protected-mode yes`
- [ ] **UFW firewall active** — Only ports 22, 80, 443 open
- [ ] **Fail2Ban enabled** — SSH brute-force protection active

### Authentication

- [ ] **MFA enabled** — Super admin has TOTP-based 2FA configured
- [ ] **Session tokens** — 96-character hex tokens (48 bytes of entropy)
- [ ] **Password hashing** — bcrypt with 12 salt rounds
- [ ] **Inactive account blocking** — `isActive` check on login
- [ ] **MFA required for sensitive actions** — Credential access, production deploy

### Authorization

- [ ] **Role hierarchy enforced** — All endpoints use `requireAuth()` or `requireRole()`
- [ ] **Least privilege applied** — Users have minimum necessary role
- [ ] **Company isolation verified** — Cross-company access is blocked (Rule #16)
- [ ] **API key scoping** — Keys have minimal required scopes

### API Security

- [ ] **API keys hashed** — Only SHA-256 hashes stored, never plaintext
- [ ] **HMAC signing available** — Timing-safe comparison for signature verification
- [ ] **Rate limiting active** — Nginx (auth: 5/min, panel: 30/min, API: 60/min) + per-key limits
- [ ] **CORS configured** — Only known origins in `ALLOWED_ORIGINS`
- [ ] **Internal endpoints protected** — `/api/health`, `/api/metrics` restricted to private IPs

### Data Protection

- [ ] **TLS 1.2+ only** — No SSLv3 or TLS 1.0/1.1
- [ ] **Modern ciphers** — ECDHE with AES-GCM
- [ ] **Backups encrypted** — `BACKUP_ENCRYPTION_KEY` set, AES-256-CBC
- [ ] **OCSP stapling** — Enabled for certificate validation
- [ ] **DH parameters** — 2048-bit generated

### Monitoring & Response

- [ ] **Health checks configured** — Monitoring system polls `/api/health`
- [ ] **Alerts defined** — Critical thresholds for errors, latency, token usage
- [ ] **Emergency kill switches tested** — Verify all 8 switches work
- [ ] **Backup schedule active** — Cron job runs daily at configured time
- [ ] **Log rotation configured** — `/etc/logrotate.d/alolabs-agent-hub`
- [ ] **Journal log access** — `journalctl -u alolabs-agent-hub` works
- [ ] **Incident response plan** — Team knows P0–P3 procedures

### Application Security

- [ ] **Protection engine active** — `PROTECTION_MODE_ENABLED=true`
- [ ] **Payment guard active** — `PAYMENT_GUARD_ENABLED=true`
- [ ] **Cross-company access disabled** — `CROSS_COMPANY_DATA_ACCESS=false`
- [ ] **Prompt injection detection** — Rule #18 active with 13 patterns
- [ ] **SQL injection safe** — All queries use Prisma (no raw SQL)
- [ ] **XSS protection** — Security headers + React auto-escaping
- [ ] **No debug info in production** — `NODE_ENV=production`, error messages sanitized

### System Hardening

- [ ] **systemd security directives** — NoNewPrivileges, ProtectSystem=strict, ProtectHome=true, PrivateTmp=true
- [ ] **Resource limits** — MemoryMax=4G, CPUQuota=200%
- [ ] **No unnecessary services** — Only MariaDB, Redis, Nginx, application
- [ ] **Automatic security updates** — `apt-get upgrade` in install script
- [ ] **SSH key-only access** — Consider disabling password SSH auth
- [ ] **Root login disabled** — SSH via `alohub` user only (sudo for admin)

### Ongoing

- [ ] **Regular backup testing** — Restore from backup monthly
- [ ] **Certificate renewal verified** — Check `certbot certificates` for expiry
- [ ] **Dependency updates** — Run `upgrade.sh` regularly
- [ ] **Security review** — Run `deploy/scripts/security-check.sh` periodically
- [ ] **Access review** — Audit API keys and user roles quarterly
- [ ] **Password policy** — Enforce strong passwords for all admin accounts
- [ ] **Incident response drills** — Practice P0 response procedure semi-annually