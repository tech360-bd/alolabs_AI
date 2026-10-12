# ALO Labs AIOS — Security Documentation

## Overview

ALO Labs AIOS implements defense-in-depth security across authentication, authorization, data protection, and infrastructure layers. This document describes all security mechanisms, their configuration, and operational procedures.

---

## Authentication

### Password Security

- **Hashing**: bcrypt with 12 salt rounds (`SALT_ROUNDS = 12`)
- **Verification**: `bcrypt.compare()` constant-time comparison
- **Storage**: `User.passwordHash` column in SQLite
- Implemented in `src/lib/auth.ts`

### Session Management

Sessions are stored in the `Settings` Prisma model (key-value store) with two records per session:

1. `session:<sha256-token-hash>` — primary session data
2. `session:meta:<userId>:<sha256-token-hash>` — user-scoped index for multi-device listing

**Session token format**: 96-character hex string (`randomBytes(48).toString('hex')`)

**Lifecycle**:

| Property | Value |
|----------|-------|
| Default expiry | 24 hours of inactivity |
| Maximum absolute age | 168 hours (7 days) |
| Extension | Automatic on each validated request |
| Rotation | Supported via `rotateSessionToken()` |
| Multi-device | Tracked per user via meta records |

**Session operations** (in `src/lib/security/session-manager.ts`):

| Function | Purpose |
|----------|---------|
| `createSession(userId, metadata, expiryHours?)` | Create new session |
| `validateSession(token)` | Validate + extend expiry |
| `destroySession(token)` | Destroy single session |
| `destroyAllUserSessions(userId)` | Logout all devices |
| `rotateSessionToken(oldToken)` | Issue new token, invalidate old |
| `listUserSessions(userId)` | List active sessions (no raw tokens) |
| `getSessionCount(userId)` | Count active sessions |

### MFA (TOTP)

Time-based One-Time Password (TOTP) two-factor authentication:

1. **Setup**: `POST /api/auth/mfa/setup` — generates TOTP secret, stores in `User.otpSecret`, enables `User.otpEnabled`
2. **Verification**: `POST /api/auth/mfa/verify` — validates 6-digit TOTP code against secret
3. **Disable**: `POST /api/auth/mfa/disable` — requires current session authentication

Login flow with MFA:

```
POST /api/auth/login → { tempToken, requiresMfa: true }
POST /api/auth/mfa/verify { tempToken, code } → { token, user }
```

### OAuth

OAuth 2.0 integration via `OAuthAccount` and `OAuthProvider` models. Supported via `/api/auth/oauth/[provider]` endpoints. Provider configurations are stored in the database.

### SSO

Single Sign-On via `SsoConfig` model. `POST /api/auth/sso` endpoint handles SAML/OIDC-based authentication with rate limiting (10 req/min).

---

## Authorization

### RBAC (Role-Based Access Control)

Five built-in roles with hierarchical permissions:

| Role | Access Level |
|------|-------------|
| `super_admin` | Full system access, user management, disaster recovery, deployment |
| `admin` | Company management, billing, agent/skill/workflow management |
| `manager` | Department management, task assignment, approval decisions |
| `operator` | Day-to-day operations, agent execution, CRM access |
| `viewer` | Read-only access to dashboards and reports |

**Models**: `Role`, `Permission`, `RolePermission`

- `Permission.resource` — the resource being protected (e.g., `agents`, `workflows`, `billing`)
- `Permission.action` — the action allowed (e.g., `read`, `write`, `delete`, `admin`)
- `RolePermission` — many-to-many join with cascade deletes

### Route-Level Authorization

The `withAuth()` HOC from `src/lib/route-auth.ts` wraps API handlers:

```typescript
import { withAuth } from '@/lib/route-auth';

export const GET = withAuth(async (req, ctx, user) => {
  // user.userId, user.role, user.email, user.name are guaranteed
  // User is verified active
});
```

The wrapper:
1. Extracts `Bearer` token from `Authorization` header
2. Calls `verifySessionToken(token)` to validate against Settings table
3. Fetches user record with `{ id, email, name, role, isActive }`
4. Returns 401 if token missing, invalid, or user inactive
5. Passes `AuthUser` object to the handler

### Agent Permissions

Individual agents have resource-level permissions via `AgentPermission`:

- `resourceId` — the resource being accessed
- `accessLevel` — `read`, `write`, `execute`, `admin`

### Skill Permissions

Skills have role-based access via `SkillPermission`:

- `roleId` — which role can use the skill
- `accessLevel` — typically `use`

### Company-Level Access Control

Multi-tenant access is controlled at multiple levels:

| Model | Purpose |
|-------|---------|
| `CompanyPermission` | Company → department/agent access (read/write/admin) |
| `CompanyUser` | Company ↔ user membership with role |
| `AgentCompanyAccess` | Agent ↔ company visibility mapping |
| `SkillCompanyAccess` | Skill ↔ company visibility mapping |
| `CompanyIpAllowlist` | IP-based access control per company |
| `CompanyDomain` | Allowed domains per company |

### API Key Scoping

`CompanyApiKey` supports fine-grained access control:

- `keyType`: `live`, `test`, `restricted`, `service`, `webhook`
- `scopes`: JSON array of permission scopes
- `rateLimit`: Per-key requests per minute
- `ipAllowlist`: JSON array of allowed IP addresses
- `expiresAt`: Optional key expiration

---

## Rate Limiting

### Implementation

Sliding window algorithm with Redis primary storage and in-memory fallback. Implemented in `src/lib/security/rate-limiter.ts`.

### Configuration

| Endpoint | Max Requests | Window | Lockout Threshold | Lockout Duration |
|----------|-------------|--------|-------------------|-----------------|
| `/api/auth/login` | 5 | 1 min | 5 failures | 15 min |
| `/api/auth/mfa/verify` | 5 | 1 min | 5 failures | 15 min |
| `/api/auth/mfa/resend` | 3 | 1 min | — | — |
| `/api/auth/sso` | 10 | 1 min | — | — |
| `/api/backups/create` | 5 | 5 min | — | — |
| `/api/db/migrate` | 2 | 5 min | — | — |
| `/api/db/restore` | 2 | 5 min | — | — |
| `/api/security/secrets` | 20 | 1 min | — | — |
| `/api/super-admin` | 30 | 1 min | — | — |
| Default (all others) | 100 | 1 min | — | — |

### Brute Force Protection

- Failed login attempts are tracked per IP/email
- 5 consecutive failures trigger a 15-minute lockout
- Lockout status is checked before authentication
- Successful login resets the attempt counter

### Storage Backend

1. **Primary**: Redis (`rl:sliding:<key>` keys with TTL)
2. **Fallback**: In-memory `Map` (cleaned every 30 seconds)

---

## HTTP Security Headers

Configured in `next.config.ts` and applied to all responses:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none';` | Prevents XSS, clickjacking, data injection |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer leakage |
| `X-XSS-Protection` | `1; mode=block` | Browser XSS filter |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables browser APIs |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Forces HTTPS (1 year) |

API routes receive an additional `X-Content-Type-Options: nosniff` header.

---

## Data Protection

### Agent Protection System

The protection engine evaluates agent actions against configurable rules:

- **ProtectionLog**: Records all protection evaluations (blocked/allowed)
- **BlockedAction**: Tracks blocked actions with reasons
- **MemoryStaticRule**: Immutable rules for protection, payment, approval, RBAC, data classification

### Payment Guard

Prevents unauthorized paid API usage:

- `PaymentGuardLog`: Records every paid API call attempt
- Blocks calls unless `Company.paidApiAllowed` is true
- Tracks replacement suggestions (local alternatives)
- Cost estimation via `CostEstimate` model before execution

### Data Classification

RAG documents carry a classification level: `public`, `internal`, `confidential`, `restricted`, `highly_restricted`. This classification is stored on `RagDocument.classification` and can be used by the protection engine to control agent access.

### File Validation

`src/lib/security/file-validator.ts` validates uploads:

- File type whitelist checking
- File size limits
- MIME type verification

---

## Encryption

### At Rest

- **Passwords**: bcrypt (12 rounds) — not reversible
- **Session tokens**: SHA-256 hashed before storage (raw token never stored)
- **API keys**: SHA-256 hashed (`keyHash`), with prefix/suffix stored for identification
- **TOTP secrets**: Stored in `User.otpSecret`

### In Transit

- All API traffic should be served over HTTPS (enforced by HSTS header)
- Caddy reverse proxy handles TLS termination
- WebSocket connections use `wss://` protocol

### Secrets Management

`src/lib/security/secret-manager.ts` provides encrypted storage for sensitive configuration values.

---

## CSRF Protection

`src/lib/security/csrf.ts` provides CSRF token generation and validation. CSRF tokens should be included in state-changing requests (POST/PUT/DELETE) from the frontend.

---

## Audit Logging

### AuditLog Model

All significant actions are recorded in `AuditLog`:

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String? | User who performed the action |
| `action` | String | Action performed (e.g., `agent.create`, `user.update`) |
| `resource` | String | Resource type affected |
| `details` | String (JSON) | Additional context |
| `ipAddress` | String? | Client IP address |
| `createdAt` | DateTime | Timestamp |

Accessed via `GET /api/audit-logs`.

### Security Events

`SecurityEvent` model tracks security-relevant events separately from general audit logs. Accessed via `GET /api/security-events`.

---

## Tenant Isolation

Multi-tenant data isolation is enforced at multiple levels:

1. **Company scoping**: Most queries filter by `companyId`
2. **Agent company access**: `AgentCompanyAccess` controls which companies can use which agents
3. **Skill company access**: `SkillCompanyAccess` controls skill availability per company
4. **API key binding**: API keys are bound to a specific company
5. **IP allowlists**: `CompanyIpAllowlist` restricts API access by source IP
6. **Domain restrictions**: `CompanyDomain` controls allowed domains
7. **Quota enforcement**: `TenantConfig` and `TokenBudget` enforce resource limits

---

## Approval System

High-risk operations require explicit approval before execution. Approval types (defined in `Approval.type`):

| Type | Trigger |
|------|---------|
| `agent_build` | Creating a new agent |
| `skill_build` | Creating a new skill |
| `workflow_build` | Creating a new workflow |
| `tool_approval` | Agent requesting a restricted tool |
| `paid_api` | Using a paid external API |
| `external_cost` | Any operation with external cost |
| `deployment` | Deploying to production |
| `dns_change` | Modifying DNS configuration |
| `file_delete` | Deleting stored files |
| `public_publish` | Publishing to public channels |
| `bulk_whatsapp` | Bulk WhatsApp messaging |
| `real_human_face` | Generating realistic human faces |
| `voice_clone` | Voice cloning operations |
| `legal_final` | Final legal document signing |
| `financial_final` | Final financial transactions |
| `shell_command` | Executing shell commands |

Approval flow: `pending` → `approved` / `rejected` / `expired`

---

## Emergency Controls

The emergency system (`/api/emergency`, `/api/emergency/action`) provides:

- Immediate system shutdown capability
- Agent freeze/kill
- Emergency contact notification
- Disaster recovery triggers

Disaster recovery configuration is stored in `DisasterRecoveryConfig` with execution logs in `RecoveryRun`.

---

## Infrastructure Security

### Network

- All inter-service communication over internal network
- Redis optional (graceful degradation to in-memory)
- MinIO/S3 access via internal endpoints when co-located

### Deployment

- Docker-based deployment (`Dockerfile`)
- Systemd service management (`deploy/systemd/alolabs-agent-hub.service`)
- Caddy reverse proxy with automatic TLS
- Nginx alternative configuration provided (`deploy/nginx/alolabs.conf`)
- Security check script: `deploy/scripts/security-check.sh`

### Environment Variable Protection

Sensitive values (passwords, API keys, secrets) should be:
1. Set via `.env` file (not committed to VCS)
2. Managed through `deploy/scripts/validate-env.sh`
3. Stored encrypted via the secret manager for runtime access

### Monitoring

- Prometheus metrics endpoint: `/api/metrics/prometheus`
- Grafana dashboards for system resources, API performance, security events
- Health checks: `/api/health` (basic), `/api/health/deep` (comprehensive)
- Incident tracking: `Incident` model with severity levels

---

## Security Checklist

- [ ] HTTPS enabled with valid TLS certificate
- [ ] `DATABASE_URL` points to a non-public SQLite path or authenticated Postgres
- [ ] `REDIS_URL` uses authentication if Redis is exposed
- [ ] S3/MinIO credentials are rotated regularly
- [ ] Rate limiting is active (Redis or in-memory fallback)
- [ ] MFA is enabled for admin accounts
- [ ] Audit logging is reviewed periodically
- [ ] Backup encryption is enabled (`/api/backups/create`)
- [ ] Company IP allowlists are configured for external-facing API keys
- [ ] Security headers are present (verify with `curl -I`)
- [ ] CSP policy is tightened for production (remove `unsafe-inline`/`unsafe-eval` if possible)
