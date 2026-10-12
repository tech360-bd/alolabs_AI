# ALO Labs AIOS — Security Hardening Guide

> **Version:** 0.2.0  
> **Last Updated:** 2025  
> **Audience:** Security engineers and system administrators  
> **Scope:** Supplements the existing `docs/SECURITY.md` with operational hardening guidance

---

## Table of Contents

1. [CSRF Protection](#1-csrf-protection)
2. [Rate Limiting Configuration](#2-rate-limiting-configuration)
3. [Bot Protection](#3-bot-protection)
4. [Brute Force Protection](#4-brute-force-protection)
5. [Secret Management Best Practices](#5-secret-management-best-practices)
6. [File Upload Security](#6-file-upload-security)
7. [Token Rotation Policy](#7-token-rotation-policy)
8. [Session Management](#8-session-management)
9. [Security Headers Reference](#9-security-headers-reference)
10. [Security Audit Checklist](#10-security-audit-checklist)
11. [Penetration Testing Guide](#11-penetration-testing-guide)
12. [Incident Response Procedure](#12-incident-response-procedure)
13. [Compliance Considerations](#13-compliance-considerations)

---

## 1. CSRF Protection

### How It Works

The application uses the `CSRF_SECRET` environment variable to generate and validate CSRF tokens. The Next.js configuration in `next.config.ts` includes `Content-Security-Policy` with `frame-ancestors 'none'` which prevents clickjacking attacks.

### Configuration

```env
# In .env — generate with: openssl rand -base64 32
CSRF_SECRET="your-csrf-secret-here"
```

### Implementation Details

- CSRF tokens are validated on all state-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`)
- Tokens are tied to the user session
- Failed CSRF validation returns HTTP 403

### Verification

```bash
# Test that a POST without CSRF token is rejected
curl -X POST http://localhost:3000/api/some-endpoint \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP Code: %{http_code}\n"
# Expected: HTTP 403 or 401
```

---

## 2. Rate Limiting Configuration

### Multi-Layer Rate Limiting

The system implements rate limiting at three layers:

#### Layer 1: Nginx (Network Level)

Defined in `deploy/nginx/alolabs.conf`:

| Zone | Limit | Burst | Applied To |
|---|---|---|---|
| `api_limit` | 60 req/min | 30 | `/api/*` |
| `panel_limit` | 30 req/min | 20 | Panel pages |
| `auth_limit` | 5 req/min | 5 | `/api/auth/*` |

```nginx
# From deploy/nginx/alolabs.conf
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=60r/m;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

location /api/auth/ {
    limit_req zone=auth_limit burst=5 nodelay;
    # ...
}
```

#### Layer 2: API Gateway (Application Level)

Implemented in `src/lib/api-gateway.ts` — per-API-key rate limiting:

```typescript
// Default: 1000 requests per minute per API key
checkRateLimit(apiKeyId: string, limit: number = 1000): boolean
```

Each API key has a configurable `rateLimit` field. Rate limit windows are 60 seconds, with automatic cleanup every 60 seconds.

#### Layer 3: Redis Rate Limiting (Distributed)

Implemented in `src/lib/redis.ts` using sliding window counters:

```typescript
rateLimitCheck(key: string, limit: number, windowSeconds: number)
```

Returns `{ allowed, remaining, resetAt }`. Falls back to in-memory counting when Redis is unavailable.

### Customizing Rate Limits

**Per API key:** Set the `rateLimit` field when creating API keys via the API Keys panel.

**Per Nginx zone:** Edit `deploy/nginx/alolabs.conf` and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. Bot Protection

### Nginx-Level Bot Blocking

Add to your Nginx configuration:

```nginx
# Block known bad bots
if ($http_user_agent ~* (masscan|nikto|sqlmap|nmap|wpscan|dirbuster)) {
    return 403;
}

# Block requests without User-Agent
if ($http_user_agent = "") {
    return 403;
}
```

### Application-Level Bot Detection

The application's API gateway (`src/lib/api-gateway.ts`) validates:
- Required `Authorization` header for API access
- HMAC signature verification (with 5-minute timestamp window)
- Request origin validation via `ALLOWED_ORIGINS`

### CAPTCHA Integration (Recommended for Public Forms)

For public-facing forms, integrate a CAPTCHA solution:

1. Sign up for **Cloudflare Turnstile** (free) or **reCAPTCHA v3**
2. Add the site key to your public forms
3. Verify the token server-side before processing the request

---

## 4. Brute Force Protection

### Login Rate Limiting

Login endpoints are rate-limited at the Nginx level to **5 requests per minute** (`auth_limit` zone). After 5 failed attempts, the client must wait 60 seconds.

### Account Lockout

The application tracks login failures via audit logs. Implement additional lockout by checking the `AuditLog` table:

```sql
-- Check for recent failed logins (last 15 minutes)
SELECT COUNT(*) FROM AuditLog
WHERE action = 'user.login'
AND details LIKE '%"ip":"ATTACKER_IP"%'
AND createdAt > datetime('now', '-15 minutes');
```

### MFA Protection

Enable MFA (TOTP) for all admin accounts:

1. Navigate to **Settings → Security Center**
2. Enable MFA for the user account
3. Scan the QR code with an authenticator app (Google Authenticator, Authy)
4. Store backup codes securely

With MFA enabled, even compromised passwords cannot be used without the TOTP code.

---

## 5. Secret Management Best Practices

### Secret Storage Hierarchy

| Secret | Storage | Access |
|---|---|---|
| `.env` file | Server filesystem (`/opt/alolabs/agent-hub/.env`) | `alohub` user only, `chmod 600` |
| GitHub Secrets | GitHub encrypted storage | GitHub Actions only |
| Database passwords | `.env` + MariaDB | Application only |
| API keys (customer) | Database (encrypted at rest) | Application only |
| SSL certificates | `/etc/letsencrypt/` | `root` only |

### Secret Generation

Always use cryptographically secure random generation:

```bash
# For 256-bit secrets
openssl rand -base64 32

# For 384-bit secrets (higher security)
openssl rand -base64 48
```

### Secret Rotation Schedule

| Secret | Rotation Frequency | Method |
|---|---|---|
| `NEXTAUTH_SECRET` | Quarterly | Update `.env`, restart service |
| `API_GATEWAY_SECRET` | Quarterly | Update `.env`, update API consumers |
| `CSRF_SECRET` | Annually | Update `.env`, restart service (invalidates sessions) |
| `BACKUP_ENCRYPTION_KEY` | Annually | Re-encrypt recent backups with new key |
| Database password | Bi-annually | Update MariaDB + `.env` + restart |
| API keys | Per-company policy | Regenerate via API Keys panel |
| SSL certificates | Auto (Let's Encrypt) | Verify auto-renewal |

### Secret Auditing

Run the security check script:

```bash
sudo bash /opt/alolabs/agent-hub/deploy/scripts/security-check.sh --json
```

This checks:
- File permissions on `.env`
- Exposed ports
- Default credentials
- Certificate expiration

---

## 6. File Upload Security

### Upload Configuration

The Nginx config limits upload size:

```nginx
client_max_body_size 50m;
```

### Upload Route

File uploads go through `POST /api/uploads` with the following security measures:

1. **Authentication required** — valid session token or API key
2. **File type validation** — only allowed MIME types accepted
3. **File size limit** — enforced at both Nginx and application level
4. **Storage isolation** — files stored via MinIO adapter or local fallback
5. **No direct file execution** — uploaded files served with `Content-Disposition: attachment`

### Recommended Hardening

```env
# In .env, configure allowed upload types (if applicable)
UPLOAD_MAX_SIZE=52428800  # 50 MB
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/gif,application/pdf
```

---

## 7. Token Rotation Policy

### Session Tokens

- **Format:** 48-byte cryptographically random hex string (96 characters)
- **Storage:** Database `Settings` table (key: `session:{token}`)
- **Lifetime:** Until explicitly deleted (logout)
- **Rotation:** On login, a new token is created; old tokens are not invalidated unless logout is called

### API Keys

- **Format:** Prefixed key (e.g., `alo_live_xxxx...`) with SHA-256 hash stored
- **Storage:** `CompanyApiKey` table with encrypted key hash
- **Lifetime:** Configurable expiration per key
- **Rotation:** Regenerate via the API Keys panel; old key remains valid until expiration

### API Key Rotation Procedure

1. **Generate new key** via the API Keys panel
2. **Update consumers** with the new key
3. **Monitor** for usage of the old key
4. **Revoke old key** once all consumers are updated
5. **Verify** no errors in application logs

---

## 8. Session Management

### Session Architecture

```
Login → bcrypt verify → Create 48-byte token → Store in Settings table
         ↓
Request → Extract token from Authorization header → Look up in Settings → Return user
         ↓
Logout → Delete token from Settings table → Session invalidated
```

### Session Security

| Feature | Implementation |
|---|---|
| **Token format** | `crypto.randomBytes(48).toString('hex')` (96 chars) |
| **Token storage** | Database (not localStorage or cookies) |
| **MFA support** | TOTP via `otpSecret` and `otpEnabled` fields |
| **Audit trail** | Login events logged to `AuditLog` |
| **IP tracking** | Client IP recorded on login |
| **User-agent tracking** | UA string recorded on login |

### Session Expiration

Sessions do not automatically expire. To implement session timeout:

1. Add a `createdAt` field to session records
2. Add middleware to check session age
3. Invalidate sessions older than the configured timeout

---

## 9. Security Headers Reference

### Application Headers (next.config.ts)

| Header | Value | Purpose |
|---|---|---|
| `X-Frame-Options` | `DENY` | Prevent framing |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `X-XSS-Protection` | `1; mode=block` | Browser XSS filter |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Block device APIs |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `Content-Security-Policy` | See below | Comprehensive CSP |

### Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' ws: wss:;
frame-ancestors 'none';
```

### Nginx Headers (deploy/nginx/alolabs.conf)

Nginx adds additional headers via the `security-headers.conf` snippet (see [Production Guide](./PRODUCTION-GUIDE.md)).

---

## 10. Security Audit Checklist

### Pre-Production Checklist

- [ ] All secrets in `.env` (not in code)
- [ ] `.env` file has `chmod 600` permissions
- [ ] `NEXTAUTH_SECRET` is cryptographically random (48+ chars)
- [ ] Owner password is strong (16+ chars, mixed case, numbers, symbols)
- [ ] MFA enabled for all admin accounts
- [ ] SSL certificates valid (not expired, not self-signed)
- [ ] Security headers verified (use https://securityheaders.com)
- [ ] Rate limiting enabled at Nginx level
- [ ] Firewall (UFW) only allows 22, 80, 443
- [ ] Database not accessible from public IP
- [ ] Redis not accessible from public IP
- [ ] Default credentials changed (Grafana, MariaDB, Redis)
- [ ] Debug endpoints blocked from public (`/api/debug`, `/api/health`)
- [ ] CORS restricted to production domains only
- [ ] Backup encryption enabled
- [ ] Off-site backups configured
- [ ] Audit logging enabled
- [ ] `ssh-keygen -t ed25519` used for SSH keys (not RSA)

### Monthly Audit

- [ ] Review `AuditLog` table for suspicious activity
- [ ] Check for unused API keys and revoke
- [ ] Review Grafana dashboards for anomalies
- [ ] Verify backup restoration works
- [ ] Check SSL certificate expiration dates
- [ ] Review server access logs for attack patterns
- [ ] Rotate `NEXTAUTH_SECRET` and `API_GATEWAY_SECRET`
- [ ] Run `security-check.sh` and review results

---

## 11. Penetration Testing Guide

### Pre-Test Preparation

1. **Notify stakeholders** — schedule a testing window
2. **Create a test environment** — never test against production directly
3. **Back up the system** — `sudo bash deploy/scripts/backup.sh --id pre-pentest`
4. **Document the scope** — what is and isn't in scope

### Test Categories

| Category | Tools | What to Test |
|---|---|---|
| **Authentication** | Manual, Burp Suite | Brute force, session hijacking, MFA bypass |
| **Authorization** | Manual | Horizontal/vertical privilege escalation |
| **API Security** | Burp Suite, Postman | Injection, parameter tampering, IDOR |
| **XSS** | XSStrike, Manual | Reflected, stored, DOM-based |
| **CSRF** | Manual | State-changing requests without token |
| **Rate Limiting** | `wrk`, `ab` | Endpoint rate limit bypass |
| **Headers** | `curl -I`, securityheaders.com | Missing or misconfigured headers |
| **SSL/TLS** | `testssl.sh`, SSL Labs | Weak ciphers, protocol versions |
| **Infrastructure** | Nmap, Nikto | Open ports, server version disclosure |

### Example Test Commands

```bash
# Check SSL configuration
testssl.sh https://panel.alolabs.net

# Check for open ports (from external)
nmap -sT -p 1-65535 your-server-ip

# Test rate limiting on auth endpoint
for i in {1..20}; do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://panel.alolabs.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}'; done

# Check security headers
curl -sI https://panel.alolabs.net | grep -iE "x-frame|x-content-type|strict-transport|content-security"
```

### Post-Test

1. Review all findings
2. Categorize by severity (Critical, High, Medium, Low, Informational)
3. Create GitHub issues for each finding
4. Fix and re-test
5. Document results and lessons learned

---

## 12. Incident Response Procedure

### Severity Classification

| Level | Description | Response Time | Example |
|---|---|---|---|
| **P1 — Critical** | Active breach, data exposure | < 15 minutes | Database leak, active exploitation |
| **P2 — High** | Vulnerability found, no active exploit | < 1 hour | SQL injection in a non-public endpoint |
| **P3 — Medium** | Security weakness, limited impact | < 24 hours | Missing rate limit on one endpoint |
| **P4 — Low** | Best practice violation | < 1 week | Verbose error messages in production |

### P1 Response Playbook

1. **Contain** (0–5 min)
   - Block the attack vector (Nginx rule, IP block)
   - Disable affected service if needed
   - Preserve evidence (logs, database state)

2. **Assess** (5–15 min)
   - Determine scope of compromise
   - Identify affected data and users
   - Check for lateral movement

3. **Communicate** (15–30 min)
   - Notify security team and stakeholders
   - Prepare initial incident report
   - Do NOT communicate externally yet

4. **Remediate** (30 min–4 hours)
   - Patch the vulnerability
   - Rotate compromised credentials
   - Restore from clean backup if needed

5. **Recover** (4–24 hours)
   - Verify the fix
   - Re-enable services
   - Monitor for recurrence

6. **Post-Incident** (1–7 days)
   - Write full incident report
   - Update security controls
   - Schedule follow-up testing

### Evidence Preservation

```bash
# Preserve logs immediately
sudo cp -a /var/log/nginx/ /tmp/incident-nginx-logs/
sudo journalctl -u alolabs-agent-hub --since "1 hour ago" > /tmp/incident-app-logs.txt
sudo cp /opt/alolabs/agent-hub/logs/ /tmp/incident-app-logs-dir/ -a
sudo mysqldump -h 127.0.0.1 -u alohub_user -p alohub_production > /tmp/incident-db-dump.sql
```

---

## 13. Compliance Considerations

### GDPR (EU Data Protection)

| Requirement | Implementation |
|---|---|
| Data minimization | Only collect necessary data |
| Right to erasure | User deletion API available |
| Data portability | Export endpoints available |
| Consent management | OAuth consent flows |
| Data breach notification | Incident response procedure |

### SOC 2 Type II

| Trust Service | Relevant Controls |
|---|---|
| **CC6 — Logical Access** | MFA, session management, API key auth |
| **CC7 — System Operations** | Monitoring, alerting, backups |
| **CC8 — Change Management** | CI/CD pipeline, deployment approvals |
| **CC9 – Risk Mitigation** | Security scanning, penetration testing |

### Recommended Compliance Tools

| Tool | Purpose |
|---|---|
| `security-check.sh` | Automated security assessment |
| GitHub CodeQL | Static application security testing |
| Trivy | Container vulnerability scanning |
| SSL Labs | TLS configuration testing |
| OWASP ZAP | Automated penetration testing |