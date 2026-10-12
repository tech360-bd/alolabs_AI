# ALO Labs Agent Hub — API Reference

> **Base URL:** `https://api.alolabs.net`  
> **Panel URL:** `https://panel.alolabs.net`  
> **Version:** Production  
> **Last Updated:** 2025

---

## Table of Contents

- [Authentication](#authentication)
- [Overview](#overview)
- [Auth Endpoints](#1-auth-endpoints)
- [Agent Endpoints](#2-agent-endpoints)
- [Skill Endpoints](#3-skill-endpoints)
- [Workflow Endpoints](#4-workflow-endpoints)
- [Task & Queue Endpoints](#5-task--queue-endpoints)
- [Company & Tenant Endpoints](#6-company--tenant-endpoints)
- [Security & Protection Endpoints](#7-security--protection-endpoints)
- [Monitoring & Observability Endpoints](#8-monitoring--observability-endpoints)
- [Billing Endpoints](#9-billing-endpoints)
- [Operations Endpoints](#10-operations-endpoints)
- [LLM & AI Endpoints](#11-llm--ai-endpoints)
- [RAG Endpoints](#12-rag-endpoints)
- [Data Models](#data-models)
- [Error Responses](#error-responses)

---

## Authentication

All API endpoints (except login and health) require authentication via a Bearer token in the `Authorization` header.

```
Authorization: Bearer <session-token>
```

For API Gateway access (external integrations), use an API key:

```
Authorization: Bearer <api-key>
```

Or with HMAC signing:

```
Authorization: Bearer <api-key>
X-ALO-Timestamp: <unix-ms>
X-ALO-Signature: <hmac-sha256>
X-ALO-Company-Id: <company-id>
X-ALO-User-Id: <user-id>
X-ALO-Request-Id: <uuid>
```

---

## Overview

The API is organized into the following domains:

| Domain                | Endpoint Prefix                    | Endpoints |
|-----------------------|------------------------------------|-----------|
| Auth                  | `/api/auth/`                       | 10        |
| Agents                | `/api/agents/`                     | 4         |
| Skills                | `/api/skills/`                     | 4         |
| Workflows             | `/api/workflows/`                  | 3         |
| Tasks & Queues        | `/api/tasks/`, `/api/queues/`, `/api/jobs/` | 8 |
| Company & Tenant      | `/api/companies/`, `/api/tenant-*/` | 8      |
| Security & Protection | `/api/protection/`, `/api/gateway/` | 8      |
| Monitoring            | `/api/metrics/`, `/api/alerts/`, `/api/observability/` | 7 |
| Billing               | `/api/billing/`, `/api/payment-guard/` | 8     |
| Operations            | `/api/deploy/`, `/api/backups/`, `/api/workers/` | 8 |

---

## 1. Auth Endpoints

### POST `/api/auth/login`

Authenticate a user and obtain a session token.

**Auth Required:** No

**Request Body:**

| Field      | Type   | Required | Description           |
|------------|--------|----------|-----------------------|
| `email`    | string | Yes      | User email            |
| `password` | string | Yes      | User password         |

**Response (200):**

```json
{
  "user": {
    "id": "clx...",
    "email": "admin@alolabs.net",
    "name": "Admin User",
    "role": "super_admin"
  },
  "token": "a1b2c3d4e5...96-char-hex-string"
}
```

**Response (200, MFA required):**

```json
{
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "User",
    "role": "manager",
    "mfaRequired": true
  },
  "token": null,
  "mfaPending": true
}
```

**Error Responses:**

| Status | Condition                     |
|--------|-------------------------------|
| 400    | Missing email or password     |
| 401    | Invalid credentials           |
| 403    | Account is disabled           |

---

### POST `/api/auth/logout`

Invalidate the current session.

**Auth Required:** Yes

**Request Body:** None

**Response (200):**
```json
{ "message": "Logged out" }
```

---

### GET `/api/auth/me`

Get the current authenticated user's profile.

**Auth Required:** Yes

**Response (200):**
```json
{
  "id": "clx...",
  "email": "admin@alolabs.net",
  "name": "Admin User",
  "role": "super_admin",
  "isActive": true
}
```

---

### POST `/api/auth/mfa/setup`

Initialize TOTP-based MFA for the current user.

**Auth Required:** Yes

**Response (200):**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrUri": "otpauth://totp/ALO%20Labs%20Agent%20Hub:user@example.com?secret=...",
  "backupCodes": ["abc123", "def456", "..."]
}
```

---

### POST `/api/auth/mfa/verify`

Verify the TOTP code to complete MFA setup or login.

**Auth Required:** Partial (after login with mfaPending)

**Request Body:**

| Field  | Type   | Required | Description              |
|--------|--------|----------|--------------------------|
| `code` | string | Yes      | 6-digit TOTP code        |
| `token`| string | Conditional | Session token (for mfaPending login flow) |

**Response (200):**
```json
{
  "user": { "id": "...", "email": "...", "role": "..." },
  "token": "session-token-here",
  "mfaEnabled": true
}
```

---

### POST `/api/auth/mfa/disable`

Disable MFA for the current user.

**Auth Required:** Yes

**Request Body:**

| Field  | Type   | Required | Description              |
|--------|--------|----------|--------------------------|
| `code` | string | Yes      | Current TOTP code to confirm |

---

### GET `/api/auth/oauth/providers`

List configured OAuth providers.

**Auth Required:** Yes (admin roles)

**Response (200):**
```json
{
  "data": [
    {
      "id": "...",
      "provider": "google",
      "clientId": "google-client-id.apps.googleusercontent.com",
      "isActive": true,
      "createdAt": "..."
    }
  ]
}
```

---

### POST `/api/auth/oauth/providers`

Register a new OAuth provider.

**Auth Required:** Yes (super_admin)

**Request Body:**

| Field       | Type    | Required | Description            |
|-------------|---------|----------|------------------------|
| `provider`  | string  | Yes      | Provider name (google, github, etc.) |
| `clientId`  | string  | Yes      | OAuth client ID        |
| `clientSecret` | string | Yes | OAuth client secret  |
| `scopes`    | string  | No       | Comma-separated scopes |
| `callbackUrl` | string | No | OAuth callback URL  |

---

### DELETE `/api/auth/oauth/providers`

Remove an OAuth provider.

**Auth Required:** Yes (super_admin)

**Request Body:**

| Field | Type   | Required | Description   |
|-------|--------|----------|---------------|
| `id`  | string | Yes      | Provider ID   |

---

### GET `/api/auth/sso`

Retrieve SSO configuration (SAML, LDAP, OIDC).

**Auth Required:** Yes (admin roles)

---

## 2. Agent Endpoints

### GET `/api/agents`

List agents with pagination and filtering.

**Auth Required:** No (read-only)

**Query Parameters:**

| Parameter    | Type   | Default | Description                          |
|--------------|--------|---------|--------------------------------------|
| `search`     | string | `""`    | Search by agent name                 |
| `department` | string | `""`    | Filter by department slug            |
| `role`       | string | `""`    | Filter by role (manager, specialist, etc.) |
| `status`     | string | `""`    | Filter by status (active, inactive)  |
| `page`       | int    | `1`     | Page number                          |
| `limit`      | int    | `50`    | Items per page (max 100)             |

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "agentId": "AGENT-0001",
      "name": "Executive Strategy Planner",
      "slug": "executive-strategy-planner",
      "departmentName": "Executive",
      "role": "manager",
      "status": "active",
      "version": 1,
      "purpose": "Strategic planning and decision support"
    }
  ],
  "total": 2000,
  "page": 1,
  "limit": 50,
  "totalPages": 40
}
```

---

### GET `/api/agents/registry`

List agents with full protocol data for the registry view.

**Auth Required:** No (read-only)

---

### GET `/api/agent-stability/health`

Get agent stability and health metrics.

**Auth Required:** No

**Response (200):**
```json
{
  "totalAgents": 2000,
  "activeAgents": 1890,
  "unstableAgents": 12,
  "healthScore": 94.5
}
```

---

### POST `/api/agent-factory/build`

Build/configure a new agent from a specification.

**Auth Required:** Yes

**Request Body:**

| Field           | Type   | Required | Description                    |
|-----------------|--------|----------|--------------------------------|
| `name`          | string | Yes      | Agent display name             |
| `departmentId`  | string | Yes      | Department to assign           |
| `role`          | string | Yes      | Agent role                     |
| `purpose`       | string | Yes      | Agent purpose description      |
| `allowedSkills` | array  | No       | Skills this agent can use      |
| `forbiddenSkills` | array | No | Skills this agent cannot use |
| `allowedTools`  | array  | No       | Tools this agent can use       |
| `protectionRules` | array | No | Security protection rules   |

---

## 3. Skill Endpoints

### GET `/api/skills`

List skills with pagination and filtering.

**Auth Required:** Yes

**Query Parameters:**

| Parameter  | Type   | Default | Description                      |
|------------|--------|---------|----------------------------------|
| `search`   | string | `""`    | Search by skill slug             |
| `category` | string | `""`    | Filter by category               |
| `status`   | string | `""`    | Filter by status (private, approved, quarantined, disabled) |
| `page`     | int    | `1`     | Page number                      |
| `limit`    | int    | `20`    | Items per page (max 100)         |

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "name": "Code Review",
      "slug": "code-review",
      "category": "Engineering",
      "title": "Automated Code Review",
      "status": "approved",
      "riskLevel": "low",
      "requiresApproval": true,
      "version": "1.0.0"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

---

### POST `/api/skills`

Create a new skill.

**Auth Required:** Yes

**Request Body:**

| Field              | Type    | Required | Description                       |
|--------------------|---------|----------|-----------------------------------|
| `name`             | string  | Yes      | Skill name                        |
| `slug`             | string  | No       | URL slug (auto-generated from name) |
| `category`         | string  | No       | Skill category                    |
| `title`            | string  | No       | Display title                     |
| `status`           | string  | No       | `private` (default), `approved`, `quarantined`, `disabled` |
| `riskLevel`        | string  | No       | `low` (default), `medium`, `high` |
| `requiresApproval` | boolean | No       | Whether approval is needed (default: true) |
| `purpose`          | string  | No       | Skill purpose                     |
| `content`          | string  | No       | Skill content / prompt            |
| `safetyRules`      | array   | No       | Safety rule definitions           |
| `allowedTools`     | array   | No       | Allowed tool list                 |
| `forbiddenTools`   | array   | No       | Forbidden tool list               |
| `inputs`           | array   | No       | Input schema definitions          |
| `outputs`          | array   | No       | Output schema definitions         |

**Response (201):** Returns the created skill object.

---

### GET `/api/skills/registry`

List skills with full registry metadata.

**Auth Required:** No (read-only)

---

### POST `/api/skill-factory/build`

Build/configure a new skill from a specification.

**Auth Required:** Yes

---

### GET `/api/skill-runs/[taskId]`

Get the result of a specific skill execution.

**Auth Required:** Yes

**Path Parameters:**

| Field    | Type   | Description                |
|----------|--------|----------------------------|
| `taskId` | string | Skill run task identifier  |

---

## 4. Workflow Endpoints

### GET `/api/workflows`

List all workflows.

**Auth Required:** No (read-only)

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "name": "Customer Onboarding",
      "slug": "customer-onboarding",
      "description": "Automated customer onboarding workflow",
      "triggers": "manual,webhook",
      "stepCount": 5,
      "departmentId": "clx...",
      "status": "active",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T00:00:00Z"
    }
  ]
}
```

---

### POST `/api/workflow-factory/build`

Build a new workflow from a specification.

**Auth Required:** Yes

---

### GET `/api/company/workflows/allowed`

List workflows allowed for the current company context.

**Auth Required:** Yes

---

## 5. Task & Queue Endpoints

### GET `/api/tasks`

List tasks with pagination.

**Auth Required:** No (read-only)

**Query Parameters:**

| Parameter | Type | Default | Description          |
|-----------|------|---------|----------------------|
| `page`    | int  | `1`     | Page number          |
| `limit`   | int  | `20`    | Items per page (max 100) |

**Response (200):**
```json
{
  "logs": [
    {
      "id": "clx...",
      "type": "agent_run",
      "status": "completed",
      "agentId": "clx...",
      "startedAt": "2025-01-15T10:00:00Z",
      "completedAt": "2025-01-15T10:00:05Z",
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-15T10:00:05Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

### GET `/api/jobs`

List background jobs.

**Auth Required:** No

---

### GET `/api/jobs/stats`

Get job execution statistics.

**Auth Required:** No

---

### GET `/api/jobs/[id]`

Get details of a specific job.

**Auth Required:** No

---

### GET `/api/queues`

List all job queues with item counts grouped by status.

**Auth Required:** No

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "name": "ai-inference",
      "description": "AI model inference queue",
      "concurrency": 5,
      "maxRetries": 3,
      "isActive": true,
      "counts": {
        "pending": 12,
        "processing": 3,
        "completed": 845,
        "failed": 2
      },
      "totalItems": 862,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T12:00:00Z"
    }
  ]
}
```

---

### POST `/api/queues`

Create a new job queue.

**Auth Required:** No

**Request Body:**

| Field          | Type    | Required | Description                  |
|----------------|---------|----------|------------------------------|
| `name`         | string  | Yes      | Queue name (unique)          |
| `description`  | string  | No       | Queue description            |
| `concurrency`  | number  | No       | Max concurrent jobs (default: 3) |
| `maxRetries`   | number  | No       | Max retry attempts (default: 3) |
| `isActive`     | boolean | No       | Whether queue is active (default: true) |

**Response (201):** Returns the created queue object.

**Error Responses:**

| Status | Condition                    |
|--------|------------------------------|
| 400    | Missing or empty name        |
| 409    | Queue name already exists    |

---

### GET `/api/queues/[id]/items`

List items in a specific queue.

**Auth Required:** No

---

### GET `/api/queues/[id]/items/[itemId]`

Get a specific queue item.

**Auth Required:** No

---

## 6. Company & Tenant Endpoints

### GET `/api/companies`

List all companies.

**Auth Required:** No (read-only)

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "name": "ALO Labs Inc.",
      "slug": "alo-labs",
      "domain": "alolabs.net",
      "status": "active",
      "webCrmConnected": true,
      "monthlyUsageLimit": 10000,
      "usageCount": 4523,
      "userCount": 12
    }
  ]
}
```

---

### POST `/api/companies`

Create a new company (tenant).

**Auth Required:** No

**Request Body:**

| Field    | Type   | Required | Description                |
|----------|--------|----------|----------------------------|
| `name`   | string | Yes      | Company display name       |
| `slug`   | string | Yes      | URL-safe identifier (unique) |
| `domain` | string | Yes      | Company domain             |

**Response (201):**
```json
{
  "id": "clx...",
  "name": "New Company",
  "slug": "new-company",
  "domain": "newcompany.com",
  "status": "active",
  "webCrmConnected": false,
  "monthlyUsageLimit": 10000,
  "usageCount": 0,
  "userCount": 0
}
```

**Error Responses:**

| Status | Condition                       |
|--------|---------------------------------|
| 400    | Missing required fields         |
| 409    | Company slug already exists     |

---

### GET `/api/company-access`

Get company access information for the current user.

**Auth Required:** Yes

---

### GET `/api/company/usage`

Get usage statistics for a company.

**Auth Required:** Yes

---

### GET `/api/company/tasks`

Get tasks associated with a company.

**Auth Required:** Yes

---

### GET `/api/company/agents/allowed`

List agents allowed for a company based on its subscription and permissions.

**Auth Required:** Yes

---

### POST `/api/company/command`

Execute a company-level command.

**Auth Required:** Yes

---

### GET `/api/tenant-admin/config`

Get tenant configuration for a company. Creates defaults if none exist.

**Auth Required:** No (requires `companyId` query parameter)

**Query Parameters:**

| Field       | Type   | Required | Description   |
|-------------|--------|----------|---------------|
| `companyId` | string | Yes      | Company ID    |

**Response (200):**
```json
{
  "config": {
    "companyId": "clx...",
    "primaryColor": "#003ABC",
    "locale": "en",
    "timezone": "Asia/Dhaka",
    "notificationsEnabled": true,
    "webhookTimeoutMs": 30000,
    "maxConcurrentJobs": 5,
    "logoUrl": null,
    "customDomain": null,
    "emailFrom": null,
    "supportEmail": null,
    "config": "{}"
  }
}
```

---

### POST `/api/tenant-admin/config`

Create or update tenant configuration (upsert).

**Auth Required:** No (requires `companyId` in body)

**Request Body:**

| Field                   | Type    | Required | Description                     |
|-------------------------|---------|----------|---------------------------------|
| `companyId`             | string  | Yes      | Company ID                      |
| `logoUrl`               | string  | No       | Custom logo URL                 |
| `primaryColor`          | string  | No       | Brand primary color             |
| `customDomain`          | string  | No       | Custom domain for tenant        |
| `emailFrom`             | string  | No       | Sender email address            |
| `supportEmail`          | string  | No       | Support email address           |
| `locale`                | string  | No       | Default locale                  |
| `timezone`              | string  | No       | Default timezone                |
| `notificationsEnabled`  | boolean | No       | Enable notifications            |
| `webhookTimeoutMs`      | number  | No       | Webhook timeout in ms           |
| `maxConcurrentJobs`     | number  | No       | Max concurrent job count        |
| `config`                | object  | No       | Additional JSON configuration   |

---

### GET `/api/tenant-admin/quotas`

Get quota configuration for a tenant.

**Auth Required:** Yes

---

### GET `/api/tenant-admin/users`

List users within a tenant.

**Auth Required:** Yes

---

## 7. Security & Protection Endpoints

### POST `/api/protection`

Evaluate an action against the 18-category protection rule engine.

**Auth Required:** No

**Request Body (Phase 2 — Full context):**

| Field                    | Type    | Required | Description                                       |
|--------------------------|---------|----------|---------------------------------------------------|
| `companyId`              | string  | No       | Company performing the action                     |
| `userId`                 | string  | No       | User performing the action                        |
| `agentId`                | string  | No       | Agent executing the action                        |
| `action`                 | string  | Yes      | Action description                                |
| `resource`               | string  | No       | Target resource                                   |
| `dataClassification`     | string  | No       | `public`, `internal`, `confidential`, `restricted`, `secret` |
| `financialCost`          | number  | No       | Estimated cost in USD                             |
| `isExternalCommunication`| boolean | No       | Action involves external parties                  |
| `isPublicPublishing`     | boolean | No       | Action publishes to public                        |
| `isDataDeletion`         | boolean | No       | Action deletes data                               |
| `isProductionChange`     | boolean | No       | Action modifies production systems                |
| `isCredentialAccess`     | boolean | No       | Action accesses credentials/secrets               |
| `isLegalSensitive`       | boolean | No       | Action involves legal matters                     |
| `isStudentPrivacy`       | boolean | No       | Action involves student/education data            |
| `isCrossCompanyAccess`   | boolean | No       | Action accesses another company's data            |
| `isBulkOperation`        | boolean | No       | Action affects multiple records                   |
| `bulkCount`              | number  | No       | Number of records affected (for bulk operations)  |
| `toolName`               | string  | No       | Tool being used                                   |
| `modelName`              | string  | No       | AI model being used                               |

**Response (200):**
```json
{
  "allowed": false,
  "reason": "Credential access is always blocked for non-super-admin users",
  "riskLevel": "critical",
  "requiresApproval": true,
  "approvalType": "super_admin",
  "blockedRules": ["credential_access", "role_check"],
  "warnings": ["Financial cost exceeds $100 threshold"]
}
```

**Protection Rule Categories (18 total):**

| #  | Category              | Default Behavior                                    |
|----|-----------------------|-----------------------------------------------------|
| 1  | Company access        | Block if company inactive/suspended                 |
| 2  | User role             | Verify user role for destructive actions            |
| 3  | Agent permission      | Verify agent has resource access                    |
| 4  | Tool permission       | Check allowed/forbidden tool lists                  |
| 5  | Data classification   | Risk mapping: public → secret                       |
| 6  | Action risk           | Detect high/medium/low action words                 |
| 7  | Financial cost        | Thresholds at $10 / $100 / $1,000                   |
| 8  | External communication| Requires approval                                   |
| 9  | Public publishing     | Requires Super Admin approval                       |
| 10 | Data deletion         | Always requires approval                            |
| 11 | Infrastructure change | Always requires approval                            |
| 12 | Production deployment | Always requires Super Admin approval                |
| 13 | Credential access     | **ALWAYS blocked** for non-super-admin              |
| 14 | Legal sensitivity     | Requires legal team review                          |
| 15 | Student privacy       | Strict protection + privacy officer approval         |
| 16 | Cross-company leakage | **ALWAYS BLOCKED**                                  |
| 17 | Bulk operations       | Approval if >10, Super Admin if >100                |
| 18 | Model output validation | 13 prompt injection pattern detection             |

---

### POST `/api/protection/evaluate`

Standalone full protection evaluation endpoint.

**Auth Required:** No

Same request/response format as `/api/protection` but always uses the full 18-category engine.

---

### GET `/api/protection/logs`

List protection evaluation logs.

**Auth Required:** Yes

---

### GET `/api/protection/report`

Generate a protection audit report.

**Auth Required:** Yes

---

### POST `/api/gateway/verify`

Verify an API gateway request (API key + HMAC + rate limit + user resolution).

**Auth Required:** No (this IS the gateway verification)

**Request Body:**

```json
{
  "headers": {
    "authorization": "Bearer alo_company_xxxxx...",
    "x-alo-company-id": "clx...",
    "x-alo-user-id": "clx...",
    "x-alo-request-id": "uuid-here",
    "x-alo-timestamp": "1705312800000",
    "x-alo-signature": "hmac-hex-string"
  },
  "body": { "any": "payload" },
  "url": "/api/agents",
  "method": "GET"
}
```

**Response (200):**
```json
{
  "authenticated": true,
  "company": {
    "id": "clx...",
    "name": "ALO Labs Inc.",
    "slug": "alo-labs"
  },
  "user": {
    "id": "clx...",
    "role": "manager"
  },
  "apiKey": {
    "id": "clx...",
    "scopes": ["agents:read", "skills:read"],
    "rateLimit": 1000
  }
}
```

**Error Responses:**

| Status | Condition                              |
|--------|----------------------------------------|
| 401    | Missing/invalid API key                |
| 401    | HMAC verification failed               |
| 401    | Request timestamp expired (>5 min)     |
| 429    | Rate limit exceeded                    |

---

### POST `/api/gateway/sign`

Generate an HMAC-SHA256 signature for testing/integration.

**Auth Required:** No

---

### GET `/api/api-keys`

List API keys with optional filtering.

**Auth Required:** No

**Query Parameters:**

| Parameter  | Type   | Description                     |
|------------|--------|---------------------------------|
| `company`  | string | Filter by company slug          |
| `search`   | string | Search by key name or company   |

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "name": "Production API Key",
      "companyId": "clx...",
      "companyName": "ALO Labs Inc.",
      "companySlug": "alo-labs",
      "keyPrefix": "alo_alo-lab",
      "keyType": "production",
      "scopes": ["agents:read", "agents:write"],
      "rateLimit": 1000,
      "isActive": true,
      "lastUsedAt": "2025-01-15T10:00:00Z",
      "expiresAt": null,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### POST `/api/api-keys`

Create a new API key for a company.

**Auth Required:** No

**Request Body:**

| Field       | Type    | Required | Description                        |
|-------------|---------|----------|------------------------------------|
| `companyId` | string  | Yes      | Company to associate key with      |
| `name`      | string  | Yes      | Key display name                   |
| `keyType`   | string  | No       | `test` (default) or `production`   |
| `scopes`    | array   | No       | Permission scopes (default: `[]`)  |
| `rateLimit` | number  | No       | Requests per minute (default: 1000)|
| `expiresAt` | string  | No       | ISO date for key expiration        |

**Response (201):**
```json
{
  "id": "clx...",
  "name": "Production API Key",
  "plainKey": "REDACTED_EXAMPLE_CREDENTIAL",
  "keyPrefix": "alo_alo-lab"
}
```

> **Important:** The `plainKey` is returned **only once** during creation. It cannot be retrieved later. Store it securely.

---

### DELETE `/api/api-keys/[id]`

Revoke/delete an API key.

**Auth Required:** Yes

---

### GET `/api/api-management`

Get API management overview with analytics.

**Auth Required:** No

**Response (200):**
```json
{
  "keyCount": 15,
  "activeKeys": 12,
  "totalRequests": 45230,
  "rateLimitHits": 23,
  "topConsumers": [...],
  "avgResponseTime": 142,
  "errorRate": 0.3
}
```

---

## 8. Monitoring & Observability Endpoints

### GET `/api/health`

Basic health check. Returns system counts and feature flags.

**Auth Required:** No (restricted to private IPs via Nginx on `api.alolabs.net`)

**Response (200):**
```json
{
  "system_name": "ALO Labs Agent Hub",
  "subtitle": "Central AI Workforce for All ALO Group Companies",
  "companies_count": 5,
  "agents_count": 2000,
  "skills_count": 150,
  "workflows_count": 45,
  "departments_count": 100,
  "usage_logs_count": 45230,
  "payment_guard_enabled": true,
  "protection_mode_enabled": true,
  "self_improvement_enabled": true,
  "productivity_mode_enabled": true,
  "rag_enabled": true,
  "status": "healthy",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

### GET `/api/health/deep`

Deep health check including database, Redis, and service dependencies.

**Auth Required:** No (restricted to private IPs via Nginx)

---

### GET `/api/system-health`

Comprehensive system health with service-level details.

**Auth Required:** No

---

### GET `/api/observability/dashboard`

Get observability dashboard summary data (alerts, metrics, service health).

**Auth Required:** No

---

### GET `/api/metrics`

Query historical metrics.

**Auth Required:** No

---

### POST `/api/metrics/collect`

Trigger on-demand metrics collection (8 system metrics: agents, tasks, queues, companies, tokens, etc.).

**Auth Required:** No

---

### GET `/api/metrics/prometheus`

Export metrics in Prometheus exposition format.

**Auth Required:** No (restricted to private IPs via Nginx)

---

### GET `/api/alerts`

List all alerts with firing status and silence information.

**Auth Required:** No

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "name": "High Error Rate",
      "severity": "critical",
      "condition": "error_rate > 5%",
      "isFiring": true,
      "isSilenced": false,
      "lastFiredAt": "2025-01-15T11:30:00Z",
      "silencedUntil": null,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-15T11:30:00Z"
    }
  ]
}
```

---

### POST `/api/alerts`

Create a new alert rule.

**Auth Required:** No

**Request Body:**

| Field       | Type   | Required | Description                                    |
|-------------|--------|----------|------------------------------------------------|
| `name`      | string | Yes      | Alert name                                     |
| `severity`  | string | No       | `info`, `warning` (default), `critical`        |
| `condition` | string | Yes      | Alert condition expression                     |

---

### PATCH `/api/alerts`

Update an alert (silence, acknowledge, toggle firing state).

**Auth Required:** No

**Request Body:**

| Field          | Type    | Required | Description                                    |
|----------------|---------|----------|------------------------------------------------|
| `id`           | string  | Yes      | Alert ID                                       |
| `isFiring`     | boolean | No       | Set firing state                               |
| `silencedUntil`| string  | No       | ISO date to silence until (null to unsilence)  |
| `acknowledge`  | boolean | No       | If true and firing, silence for 24 hours       |

---

## 9. Billing Endpoints

### GET `/api/billing/plans`

List all active subscription plans.

**Auth Required:** No (GET)

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "name": "Professional",
      "slug": "professional",
      "description": "For growing teams",
      "priceMonthly": 99,
      "priceYearly": 990,
      "agentLimit": 500,
      "skillLimit": 1000,
      "workflowLimit": 200,
      "monthlyTokens": 5000000,
      "monthlyRequests": 100000,
      "features": ["priority-support", "custom-domains"],
      "isEnterprise": false,
      "sortOrder": 1
    }
  ]
}
```

---

### POST `/api/billing/plans`

Create a new subscription plan.

**Auth Required:** Yes (super_admin only)

**Request Body:**

| Field              | Type    | Required | Description                  |
|--------------------|---------|----------|------------------------------|
| `name`             | string  | Yes      | Plan name                    |
| `slug`             | string  | Yes      | URL slug (unique)            |
| `description`      | string  | No       | Plan description             |
| `priceMonthly`     | number  | No       | Monthly price in USD         |
| `priceYearly`      | number  | No       | Yearly price in USD          |
| `agentLimit`       | number  | No       | Max agents (default: 100)    |
| `skillLimit`       | number  | No       | Max skills (default: 500)    |
| `workflowLimit`    | number  | No       | Max workflows (default: 100) |
| `monthlyTokens`    | number  | No       | Monthly token allowance      |
| `monthlyRequests`  | number  | No       | Monthly API request limit    |
| `features`         | array   | No       | Feature list                 |
| `isEnterprise`     | boolean | No       | Enterprise flag              |
| `sortOrder`        | number  | No       | Display order                |

---

### GET `/api/billing/subscriptions`

List all subscriptions with plan and company details.

**Auth Required:** No (GET)

---

### POST `/api/billing/subscriptions`

Create a new subscription for a company. Auto-generates the first invoice.

**Auth Required:** Yes

**Request Body:**

| Field          | Type   | Required | Description                              |
|----------------|--------|----------|------------------------------------------|
| `companyId`    | string | Yes      | Company to subscribe                     |
| `planId`       | string | Yes      | Plan to subscribe to                     |
| `billingCycle` | string | No       | `monthly` (default) or `yearly`          |
| `trialDays`    | number | No       | Trial period in days (creates as `trial` status) |

**Response (201):**
```json
{
  "id": "clx...",
  "companyId": "clx...",
  "planId": "clx...",
  "plan": { "name": "Professional", "slug": "professional" },
  "status": "active",
  "trialEndsAt": null,
  "currentPeriodStart": "2025-01-15T00:00:00Z",
  "currentPeriodEnd": "2025-02-15T00:00:00Z",
  "firstInvoiceId": "clx...",
  "firstInvoiceNumber": "INV-2025-0001"
}
```

**Error Responses:**

| Status | Condition                              |
|--------|----------------------------------------|
| 400    | Missing companyId or planId           |
| 400    | Company or plan not found              |
| 400    | Company already has a subscription     |

---

### GET `/api/billing/subscriptions/[id]`

Get a specific subscription with details.

**Auth Required:** Yes

---

### GET `/api/billing/invoices`

List invoices with optional filtering.

**Auth Required:** No (GET)

**Query Parameters:**

| Parameter   | Type   | Description                |
|-------------|--------|----------------------------|
| `companyId` | string | Filter by company          |
| `status`    | string | Filter by status           |

**Response (200):**
```json
{
  "data": [
    {
      "id": "clx...",
      "subscriptionId": "clx...",
      "companyId": "clx...",
      "company": { "name": "ALO Labs Inc.", "slug": "alo-labs" },
      "subscription": {
        "plan": { "name": "Professional" },
        "status": "active"
      },
      "invoiceNumber": "INV-2025-0001",
      "amount": 99.00,
      "currency": "USD",
      "status": "sent",
      "dueDate": "2025-02-08T00:00:00Z",
      "paidAt": null,
      "lineItems": [
        { "description": "Professional Plan — Monthly subscription", "amount": 99.00, "quantity": 1 }
      ],
      "notes": "First invoice for Professional plan"
    }
  ]
}
```

---

### POST `/api/billing/invoices`

Generate a new invoice for a subscription.

**Auth Required:** Yes

---

### GET `/api/billing/payments`

List payments with optional filtering.

**Auth Required:** No (GET)

---

### POST `/api/billing/payments`

Record a payment (manual or external).

**Auth Required:** Yes

**Request Body:**

| Field          | Type   | Required | Description                    |
|----------------|--------|----------|--------------------------------|
| `companyId`    | string | Yes      | Paying company                 |
| `amount`       | number | Yes      | Payment amount                 |
| `invoiceId`    | string | No       | Associated invoice             |
| `currency`     | string | No       | `USD` (default)                |
| `method`       | string | No       | `manual` (default), `stripe`, `bank_transfer` |
| `transactionRef` | string | No | External transaction reference |
| `notes`        | string | No       | Payment notes                  |
| `status`       | string | No       | `pending` (default), `completed`, `failed`, `refunded` |

> If `status` is `completed` and an `invoiceId` is provided, the associated invoice is automatically marked as `paid`.

---

### POST `/api/usage/check`

Multi-layer usage quota validation (company limits → plan limits → token budget).

**Auth Required:** No

**Request Body:**

| Field            | Type   | Required | Description                              |
|------------------|--------|----------|------------------------------------------|
| `companyId`      | string | Yes      | Company to check                         |
| `action`         | string | Yes      | `agent_run`, `skill_run`, `workflow_run`, `api_call` |
| `estimatedTokens`| number | No       | Estimated token consumption              |

**Response (200, allowed):**
```json
{
  "allowed": true,
  "limits": {
    "monthlyRequests": { "used": 4523, "limit": 10000 },
    "tokenBudget": {
      "monthly": { "used": 2500000, "limit": 5000000 },
      "daily": { "used": 85000, "limit": 200000 }
    },
    "plan": {
      "name": "Professional",
      "agentLimit": 500,
      "skillLimit": 1000,
      "workflowLimit": 200,
      "monthlyRequests": 100000,
      "monthlyTokens": 5000000
    }
  },
  "warnings": ["Monthly usage at 45% (4523/10000)"]
}
```

**Response (200, blocked):**
```json
{
  "allowed": false,
  "reason": "Token budget exhausted (5,000,000/5,000,000 tokens)",
  "limits": {
    "resource": "tokens",
    "used": 5000000,
    "limit": 5000000
  },
  "warnings": []
}
```

---

### POST `/api/payment-guard`

Check whether a payment-impacting action is allowed.

**Auth Required:** No

---

### GET `/api/payment-guard/report`

Get payment guard activity report.

**Auth Required:** Yes

---

## 10. Operations Endpoints

### GET `/api/deploy`

List deployment records.

**Auth Required:** No

---

### POST `/api/deploy`

Create a new deployment record.

**Auth Required:** Yes

---

### GET `/api/backups`

List backup records.

**Auth Required:** No

---

### POST `/api/backups/create`

Create a manual backup.

**Auth Required:** Yes

**Response (200):**
```json
{
  "id": "clx...",
  "backupId": "manual_20250115_120000",
  "size": "15MB",
  "duration": 3.2,
  "status": "completed"
}
```

---

### POST `/api/backups/restore`

Restore from a backup.

**Auth Required:** Yes

**Request Body:**

| Field       | Type   | Required | Description    |
|-------------|--------|----------|----------------|
| `backupId`  | string | Yes      | Backup ID      |

---

### GET `/api/workers`

List background workers with status.

**Auth Required:** No

---

### POST `/api/workers`

Manage workers (start, stop, restart, configure pool).

**Auth Required:** Yes

---

### POST `/api/workers/action`

Execute a worker action.

**Auth Required:** Yes

---

### GET `/api/notifications`

List notifications.

**Auth Required:** No

---

### POST `/api/notifications/read`

Mark notifications as read.

**Auth Required:** Yes

**Request Body:**

| Field       | Type            | Required | Description                          |
|-------------|-----------------|----------|--------------------------------------|
| `ids`       | array of string | No       | Specific notification IDs to mark   |
| `all`       | boolean         | No       | Mark all as read                     |

---

### GET `/api/outputs`

List agent/skill outputs with pagination and filtering.

**Auth Required:** No

---

### GET `/api/outputs/[taskId]`

Get output for a specific task.

**Auth Required:** No

---

### GET `/api/logs`

Centralized log viewer with pagination.

**Auth Required:** No

**Query Parameters:**

| Parameter  | Type   | Description                      |
|------------|--------|----------------------------------|
| `level`    | string | Filter by level (info, warn, error) |
| `page`     | int    | Page number                      |
| `limit`    | int    | Items per page                   |

---

### POST `/api/logs`

Ingest a log entry (creates ServerLog and/or ErrorLog records).

**Auth Required:** No

---

### DELETE `/api/logs`

Prune old logs based on retention settings.

**Auth Required:** Yes

---

### GET `/api/audit-logs`

List audit log entries.

**Auth Required:** No

---

### GET `/api/settings`

Get system settings.

**Auth Required:** No

---

### POST `/api/settings`

Update system settings.

**Auth Required:** Yes

---

### GET `/api/roles`

List defined roles.

**Auth Required:** No

---

### GET `/api/departments`

List all departments.

**Auth Required:** No

---

### GET `/api/users`

List users.

**Auth Required:** No

---

### GET `/api/analytics`

Get analytics/telemetry data.

**Auth Required:** No

---

### POST `/api/super-chat`

Super admin chat / command interface.

**Auth Required:** Yes (super_admin)

---

### POST `/api/commands`

Execute system commands.

**Auth Required:** Yes

---

### GET `/api/usage`

Get usage statistics.

**Auth Required:** No

---

### GET `/api/token-usage`

Get token consumption data.

**Auth Required:** No

---

### GET `/api/token-budget`

Get token budget configuration and status.

**Auth Required:** No

---

### GET `/api/productivity`

Get productivity metrics.

**Auth Required:** No

---

### GET `/api/productivity/report`

Get detailed productivity report.

**Auth Required:** No

---

### GET `/api/self-improvement`

Get self-improvement metrics and status.

**Auth Required:** No

---

### GET `/api/self-improvement/report`

Get detailed self-improvement report.

**Auth Required:** No

---

### GET `/api/quality`

List quality assessments.

**Auth Required:** No

**Query Parameters:**

| Parameter    | Type   | Description           |
|--------------|--------|-----------------------|
| `agentId`    | string | Filter by agent       |
| `skillId`    | string | Filter by skill       |
| `workflowId` | string | Filter by workflow    |
| `page`       | int    | Page number           |
| `limit`      | int    | Items per page        |

---

### POST `/api/quality`

Create a quality assessment.

**Auth Required:** No

**Request Body:**

| Field       | Type   | Required | Description                                      |
|-------------|--------|----------|--------------------------------------------------|
| `score`     | number | Yes      | Quality score (0–100)                            |
| `agentId`   | string | No       | Associated agent                                 |
| `skillId`   | string | No       | Associated skill                                 |
| `workflowId`| string | No       | Associated workflow                              |
| `assessor`  | string | No       | `system`, `human`, `peer`                        |
| `level`     | string | No       | `draft`, `junior`, `mid`, `senior`, `expert`, `dept_lead` |
| `criteria`  | object | No       | Assessment criteria (JSON)                       |
| `notes`     | string | No       | Assessment notes                                 |

---

### GET `/api/feedback`

List feedback entries.

**Auth Required:** No

---

### GET `/api/webhooks`

List webhook configurations.

**Auth Required:** No

---

### POST `/api/webhooks`

Create a webhook configuration.

**Auth Required:** No

**Request Body:**

| Field       | Type   | Required | Description                |
|-------------|--------|----------|----------------------------|
| `companyId` | string | Yes      | Company to associate with  |
| `name`      | string | Yes      | Webhook name               |
| `url`       | string | Yes      | Webhook URL                |
| `events`    | array  | Yes      | Event types to subscribe to|

---

### GET `/api/webhooks/deliveries`

List webhook delivery logs.

**Auth Required:** No

---

### GET `/api/webhooks/[id]`

Get a specific webhook configuration.

**Auth Required:** No

---

### GET `/api/marketplace`

List marketplace listings.

**Auth Required:** No

---

### GET `/api/marketplace/[id]`

Get a specific marketplace listing.

**Auth Required:** No

---

### POST `/api/marketplace/[id]/install`

Install a marketplace listing.

**Auth Required:** Yes

---

### GET `/api/marketplace/[id]/reviews`

Get reviews for a marketplace listing.

**Auth Required:** No

---

### GET `/api/prompts`

List prompt vault entries.

**Auth Required:** No

---

### POST `/api/prompts`

Create a prompt vault entry.

**Auth Required:** Yes

---

### PUT `/api/prompts/[id]`

Update a prompt vault entry.

**Auth Required:** Yes

---

### DELETE `/api/prompts/[id]`

Delete a prompt vault entry.

**Auth Required:** Yes

---

### GET `/api/tools`

List registered tools.

**Auth Required:** No

---

### POST `/api/tools`

Register a new tool.

**Auth Required:** Yes

---

### DELETE `/api/tools`

Delete a tool.

**Auth Required:** Yes

---

### GET `/api/mcp-servers`

List MCP (Model Context Protocol) servers.

**Auth Required:** No

---

### POST `/api/mcp-servers`

Create or update an MCP server.

**Auth Required:** Yes

---

### DELETE `/api/mcp-servers`

Delete an MCP server.

**Auth Required:** Yes

---

### GET `/api/incidents`

List incidents.

**Auth Required:** No

---

### POST `/api/incidents`

Create a new incident.

**Auth Required:** Yes

---

### PUT `/api/incidents/[id]`

Update an incident.

**Auth Required:** Yes

---

### GET `/api/emergency`

List emergency kill switch states.

**Auth Required:** No

---

### POST `/api/emergency`

Toggle an emergency kill switch.

**Auth Required:** Yes

---

### POST `/api/emergency/action`

Execute an emergency action.

**Auth Required:** Yes

---

### GET `/api/uploads`

Get upload information.

**Auth Required:** Yes

---

### GET `/api/cost-estimate`

Get a cost estimate for an operation.

**Auth Required:** No

---

### GET `/api/cost-estimates/[id]`

Get a specific cost estimate.

**Auth Required:** No

---

### GET `/api/capability/requests`

List capability requests.

**Auth Required:** No

---

### POST `/api/capability/request`

Submit a capability request.

**Auth Required:** Yes

---

### GET `/api/approvals`

List approval requests.

**Auth Required:** No

---

### GET `/api/dashboard/stats`

Get dashboard statistics.

**Auth Required:** No

---

### GET `/api/dashboard/cost`

Get cost dashboard data.

**Auth Required:** No

---

### GET `/api/dashboard/usage`

Get usage dashboard data.

**Auth Required:** No

---

### GET `/api/dashboard/security`

Get security dashboard data.

**Auth Required:** No

---

### GET `/api/dashboard/super-admin`

Get super admin dashboard data.

**Auth Required:** Yes (super_admin)

---

### GET `/api/memory`

Get agent memory entries.

**Auth Required:** No

---

### POST `/api/memory`

Create an agent memory entry.

**Auth Required:** No

---

### GET `/api/crm-connections`

List CRM connections.

**Auth Required:** No

---

### GET `/api/tenant-gateway`

Get tenant gateway overview.

**Auth Required:** No

---

### GET `/api/tenant-gateway/logs`

Get tenant gateway request logs.

**Auth Required:** No

---

### GET `/api/tenant-gateway/distribution`

Get tenant gateway traffic distribution.

**Auth Required:** No

---

### GET `/api/task-steps/[taskId]`

Get task execution steps.

**Auth Required:** No

---

### GET `/api/agent-runs/[taskId]`

Get agent run details.

**Auth Required:** No

---

### GET `/api`

Root API endpoint. Returns API information.

**Auth Required:** No

---

## 11. LLM & AI Endpoints

### GET `/api/llm/models`

List all available LLM models (built-in + dynamic from Settings).

**Auth Required:** No

**Response (200):**
```json
{
  "models": [
    {
      "id": "deepseek-v3",
      "name": "DeepSeek V3",
      "provider": "local",
      "costPer1kTokens": 0,
      "maxContext": 64000,
      "supportsStreaming": true,
      "capabilities": ["code_generation", "analysis", "conversation", "data_processing", "creative"],
      "status": "active"
    },
    {
      "id": "deepseek-r1",
      "name": "DeepSeek R1",
      "provider": "local",
      "costPer1kTokens": 0,
      "maxContext": 64000,
      "supportsStreaming": false,
      "capabilities": ["analysis", "creative", "conversation"],
      "status": "active"
    }
  ],
  "routingRules": [
    { "taskType": "code_generation", "modelId": "deepseek-coder", "priority": 1 },
    { "taskType": "analysis", "modelId": "deepseek-r1", "priority": 1 }
  ],
  "total": 3
}
```

---

### POST `/api/llm/models`

Add or configure a dynamic LLM model.

**Auth Required:** No

**Request Body:**

| Field                | Type    | Required | Description                    |
|----------------------|---------|----------|--------------------------------|
| `id`                 | string  | Yes      | Unique model identifier        |
| `name`               | string  | Yes      | Display name                   |
| `provider`           | string  | No       | `local` (default) or external  |
| `costPer1kTokens`    | number  | No       | Cost per 1k tokens in USD      |
| `maxContext`         | number  | No       | Max context window (default: 32000) |
| `supportsStreaming`  | boolean | No       | Supports SSE streaming (default: true) |
| `capabilities`       | array   | No       | Capability tags                |
| `status`             | string  | No       | `active` (default) or `disabled`|

---

### POST `/api/llm/route`

Intelligent model routing — selects the best model for a given task using 6-factor scoring (capability match, context window, cost, quality, streaming support, stability).

**Auth Required:** No

**Request Body:**

| Field            | Type   | Required | Description                    |
|------------------|--------|----------|--------------------------------|
| `taskType`       | string | Yes      | Task type for routing          |
| `message`        | string | No       | Input message/prompt           |
| `maxTokens`      | number | No       | Expected max tokens            |
| `requireStream`  | boolean | No       | Require streaming capability   |

**Response (200):**
```json
{
  "selectedModel": "deepseek-coder",
  "reason": "Best capability match for code_generation with 32000 context",
  "scores": {
    "deepseek-v3": { "total": 82, "capability": 90, "context": 85, "cost": 100, "quality": 80 },
    "deepseek-coder": { "total": 95, "capability": 100, "context": 70, "cost": 100, "quality": 95 }
  }
}
```

---

### POST `/api/llm/stream`

Streaming LLM endpoint with automatic model selection, token budget enforcement, and performance metrics recording (latency, TTFT — Time To First Token).

**Auth Required:** No

**Request Body:**

| Field        | Type   | Required | Description              |
|--------------|--------|----------|--------------------------|
| `messages`   | array  | Yes      | Chat message array       |
| `model`      | string | No       | Override model selection |
| `maxTokens`  | number | No       | Max response tokens      |
| `companyId`  | string | No       | For token budget tracking|

**Response:** Server-Sent Events (SSE) stream.

---

## 12. RAG Endpoints

### GET `/api/rag/collections`

List RAG (Retrieval-Augmented Generation) collections.

**Auth Required:** No

---

### POST `/api/rag/documents`

Upload/manage RAG documents.

**Auth Required:** Yes

---

### POST `/api/rag/query`

Query the RAG system.

**Auth Required:** No

---

### GET `/api/rag/logs`

List RAG query logs.

**Auth Required:** No

---

## Data Models

### User Roles

| Role         | Description                                    |
|--------------|------------------------------------------------|
| `super_admin`| Full system access, can manage all resources   |
| `admin`      | Administrative access, most management functions |
| `manager`    | Team management, agent/skill management        |
| `operator`   | Operational access, can run agents/workflows   |
| `viewer`     | Read-only access                               |

### Agent Roles

| Role            | Description                                    |
|-----------------|------------------------------------------------|
| `manager`       | Coordinates department agents, higher timeouts (600s) |
| `planner`       | Task planning and scheduling                   |
| `execution`     | Primary task execution                         |
| `qa`            | Quality assurance, testing focus               |
| `report`        | Report generation and analysis                 |
| `automation`    | Batch processing, 10 concurrent tasks, 5 retries|
| `safety`        | Security-only skills, fast timeout (60s)       |
| `memory`        | Knowledge management, higher memory items      |
| `productivity`  | Productivity tracking and optimization         |
| `owner_approval`| Approval authority for critical actions        |
| `specialist`    | General purpose, default role                  |

### Task Statuses

| Status       | Description                    |
|--------------|--------------------------------|
| `pending`    | Waiting to be executed         |
| `running`    | Currently executing            |
| `completed`  | Successfully completed          |
| `failed`     | Execution failed               |
| `cancelled`  | Cancelled by user or system    |

### Subscription Statuses

| Status      | Description                     |
|-------------|---------------------------------|
| `trial`     | In trial period                 |
| `active`    | Active and billing              |
| `past_due`  | Payment overdue                 |
| `cancelled` | Cancelled by user or system     |

### Data Classification Levels

| Level         | Risk   | Description                         |
|---------------|--------|-------------------------------------|
| `public`      | None   | Publicly accessible data             |
| `internal`    | Low    | Internal company data               |
| `confidential`| Medium | Sensitive business data             |
| `restricted`  | High   | Highly restricted data              |
| `secret`      | Critical| Top-secret / classified data         |

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Human-readable error message"
}
```

Standard HTTP status codes are used:

| Status | Meaning                                |
|--------|----------------------------------------|
| 200    | Success                                |
| 201    | Created                                |
| 400    | Bad Request — invalid input            |
| 401    | Unauthorized — missing or invalid auth |
| 403    | Forbidden — insufficient permissions    |
| 404    | Not Found                              |
| 409    | Conflict — duplicate resource          |
| 429    | Too Many Requests — rate limited       |
| 500    | Internal Server Error                  |