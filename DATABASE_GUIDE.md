# ALO Labs AIOS — Database Guide

## Overview

The platform uses **Prisma ORM** with **SQLite** as the primary database. Multi-database adapters are available for Postgres and MySQL via `src/lib/db-adapters/`. The schema defines **122 models** with comprehensive indexing.

### Database Configuration

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")  // default: "file:./dev.db"
}
```

### Common Commands

```bash
bun run db:push       # Push schema changes to database (dev)
bun run db:generate   # Regenerate Prisma client
bun run db:migrate    # Create a migration (dev)
bun run db:reset      # Reset database (dev only)
```

---

## Schema Overview

Models are organized into functional domains. Each domain is documented below with its models, key fields, and relationships.

---

## Domain: Users & Authentication

### User

Core user account with RBAC role.

| Field | Type | Notes |
|------|------|-------|
| `id` | String (cuid) | Primary key |
| `email` | String | Unique, used for login |
| `passwordHash` | String | bcrypt, 12 rounds |
| `name` | String | Display name |
| `role` | String | `super_admin`, `admin`, `manager`, `operator`, `viewer` |
| `isActive` | Boolean | Soft-disable accounts |
| `lastLoginAt` | DateTime? | Updated on successful login |
| `otpSecret` | String? | TOTP secret (base32) |
| `otpEnabled` | Boolean | MFA toggle |

**Relations**: `AuditLog[]`, `Approval[]`, `OAuthAccount[]`, `Command[]`

### OAuthAccount

Linked third-party OAuth identities.

| Field | Type |
|------|------|
| `id` | String (cuid) |
| `provider` | String |
| `providerAccountId` | String |
| `userId` | String (FK → User) |

### OAuthProvider

Configuration for OAuth providers (Google, GitHub, etc.).

### SsoConfig

SSO/SAML configuration for enterprise identity providers.

---

## Domain: RBAC

### Role

| Field | Type |
|------|------|
| `id` | String (cuid) |
| `name` | String (unique) |
| `description` | String? |

**Relations**: `RolePermission[]`

### Permission

| Field | Type |
|------|------|
| `id` | String (cuid) |
| `name` | String (unique) |
| `resource` | String | Resource being protected |
| `action` | String | `read`, `write`, `delete`, `admin` |

**Relations**: `RolePermission[]`

### RolePermission

Join table with cascade deletes.

| Field | Type |
|------|------|
| `roleId` | String (FK → Role) |
| `permissionId` | String (FK → Permission) |
| `@@unique([roleId, permissionId])` |

---

## Domain: Departments

### Department

| Field | Type | Notes |
|------|------|-------|
| `id` | String (cuid) | Primary key |
| `name` | String (unique) | Display name |
| `slug` | String (unique) | URL-safe identifier |
| `managerId` | String? | User ID of department manager |
| `agentCount` | Int | Denormalized count |
| `sortOrder` | Int | UI display order |
| `status` | String | `active`, `inactive` |

**Relations**: `Agent[]`, `DepartmentMemory[]`

---

## Domain: Agents

### Agent

The central model representing an AI agent.

| Field | Type | Notes |
|------|------|-------|
| `id` | String (cuid) | Primary key |
| `agentId` | String (unique) | `AGENT-XXXX` format |
| `name` | String | Display name |
| `slug` | String (unique) | URL identifier |
| `departmentId` | String (FK → Department) |
| `departmentName` | String | Denormalized |
| `purpose` | String | One-line description |
| `type` | String | `conversational`, `autonomous`, `workflow`, `specialized` |
| `role` | String | `manager`, `planner`, `execution`, `qa`, `report`, etc. |
| `status` | String | `active`, `inactive`, `archived` |
| `version` | Int | Config version |
| `allowedSkills` | String (JSON) | Whitelisted skill slugs |
| `forbiddenSkills` | String (JSON) | Blacklisted skill slugs |
| `allowedTools` | String (JSON) | Whitelisted tool names |
| `forbiddenTools` | String (JSON) | Blacklisted tool names |
| `inputSchema` | String (JSON) | Expected input shape |
| `outputSchema` | String (JSON) | Expected output shape |
| `workflowSteps` | String (JSON) | Workflow step definitions |
| `protectionRules` | String (JSON) | Safety/protection rules |
| `approvalRules` | String (JSON) | When approval is needed |
| `handoffRules` | String (JSON) | When to delegate to other agents |
| `qualityChecklist` | String (JSON) | Quality gate checklist |
| `selfImprovement` | String (JSON) | Learning configuration |
| `productivityRules` | String (JSON) | Resource limits per task |

**Relations**: `Department`, `AgentVersion[]`, `AgentPermission[]`, `Task[]`, `AgentMemory[]`, `AgentCompanyAccess[]`, `AgentHealth[]`, `AgentStatusHistory[]`, `AgentTrainingRecord[]`, `AgentRun[]`

**Index**: `departmentId`

### AgentVersion

Config snapshot per version.

| Field | Type |
|------|------|
| `agentId` | String (FK → Agent, cascade) |
| `version` | Int |
| `config` | String (JSON) |
| `changeLog` | String? |
| `@@unique([agentId, version])` |

### AgentPermission

Resource-level permissions for agents.

| Field | Type |
|------|------|
| `agentId` | String (FK → Agent, cascade) |
| `resourceId` | String |
| `accessLevel` | String | `read`, `write`, `execute`, `admin` |

### AgentMemory

| Field | Type | Notes |
|------|------|-------|
| `agentId` | String (FK → Agent, cascade) |
| `category` | String | `general`, `learning`, `correction`, `pattern` |
| `content` | String | Memory content |
| `temperature` | String | `hot`, `warm`, `cold` |
| `successCount` | Int | Times this memory led to success |
| `useCount` | Int | Times this memory was accessed |
| `promotedAt` | DateTime? | When promoted from cold to warm |

**Index**: `agentId`

### AgentHealth

Health monitoring records.

### AgentStatusHistory

State transition log.

### AgentTrainingRecord

Training event log.

### AgentPerformanceScore

Aggregated performance metrics (daily/weekly/monthly).

| Field | Type |
|------|------|
| `agentId` | String |
| `period` | String | `daily`, `weekly`, `monthly` |
| `successRate` | Float |
| `errorRate` | Float |
| `avgRuntimeMs` | Int |
| `outputQualityScore` | Float |
| `productivityScore` | Float |

### AgentRun

Individual agent execution record.

| Field | Type |
|------|------|
| `agentId` | String (FK → Agent) |
| `taskId` | String? (FK → Task) |
| `status` | String | `running`, `completed`, `failed` |
| `input` | String (JSON) |
| `output` | String? |
| `durationMs` | Int? |

**Indexes**: `agentId`, `taskId`, `status`, `createdAt`

---

## Domain: Skills

### Skill

Reusable capability that agents can invoke.

| Field | Type | Notes |
|------|------|-------|
| `id` | String (cuid) |
| `name` | String |
| `slug` | String (unique) |
| `category` | String | Skill category |
| `categorySlug` | String |
| `version` | String | SemVer (default: `1.0.0`) |
| `status` | String | `private`, `approved`, `quarantined`, `disabled` |
| `riskLevel` | String | `low`, `medium`, `high` |
| `requiresApproval` | Boolean |
| `runtime` | String | `node`, `python`, `builtin` |
| `allowedTools` | String (JSON) |
| `forbiddenTools` | String (JSON) |
| `inputs` | String (JSON) | Expected input parameters |
| `outputs` | String (JSON) | Output specification |
| `validationRules` | String (JSON) |
| `securityRules` | String (JSON) |
| `costPolicy` | String (JSON) |
| `safetyRules` | String (JSON) |
| `content` | String | SKILL.md body (the actual skill definition) |

**Relations**: `SkillVersion[]`, `SkillPermission[]`, `SkillValidationLog[]`, `SkillCompanyAccess[]`, `SkillRun[]`

### SkillVersion

| Field | Type |
|------|------|
| `skillId` | String (FK → Skill, cascade) |
| `version` | String |
| `content` | String | Full skill content snapshot |
| `@@unique([skillId, version])` |

### SkillPermission

| Field | Type |
|------|------|
| `skillId` | String (FK → Skill, cascade) |
| `roleId` | String? |
| `accessLevel` | String | `use` |

**Index**: `skillId`

### SkillValidationLog

| Field | Type |
|------|------|
| `skillId` | String (FK → Skill, cascade) |
| `status` | String | `PASS`, `WARNING`, `BLOCKED` |
| `reason` | String? |
| `checkedBy` | String? |

### SkillRun

Execution record for skill invocations.

---

## Domain: Tasks & Workflows

### Task

| Field | Type |
|------|------|
| `id` | String (cuid) |
| `commandId` | String? (FK → Command) |
| `title` | String |
| `description` | String? |
| `status` | String | `pending`, `in_progress`, `completed`, `failed`, `blocked` |
| `priority` | String | `medium` (default), `low`, `high`, `critical` |
| `departmentId` | String? |
| `agentId` | String? (FK → Agent) |
| `workflowId` | String? (FK → Workflow) |

**Relations**: `Agent?`, `Workflow?`, `TaskStep[]`, `Output[]`, `TaskError[]`, `AgentRun[]`, `SkillRun[]`

**Indexes**: `agentId`, `workflowId`

### TaskStep

| Field | Type |
|------|------|
| `taskId` | String (FK → Task, cascade) |
| `stepNumber` | Int |
| `agentId` | String? |
| `skillId` | String? |
| `action` | String |
| `input` | String (JSON) |
| `output` | String? |
| `status` | String | `pending`, `in_progress`, `completed`, `failed` |

**Index**: `taskId`

### TaskError

Error records for failed task steps.

### Command

User-issued commands that get parsed and dispatched.

| Field | Type |
|------|------|
| `rawCommand` | String | Original user input |
| `parsedIntent` | String? | Detected intent |
| `detectedDept` | String? | Detected department |
| `workflowId` | String? (FK → Workflow) |
| `status` | String | `pending`, `processing`, `completed`, `failed`, `blocked` |

**Indexes**: `status`, `createdAt`, `userId`

### Workflow

| Field | Type |
|------|------|
| `name` | String (unique) |
| `slug` | String (unique) |
| `triggers` | String (JSON) | Event/cron triggers |
| `stepConfigs` | String (JSON) | Step configuration |
| `status` | String | `active`, `inactive` |

**Relations**: `WorkflowStep[]`, `WorkflowPermission[]`, `Command[]`, `WorkflowRun[]`, `Task[]`, `WorkflowImprovementRequest[]`

### WorkflowStep

| Field | Type |
|------|------|
| `workflowId` | String (FK → Workflow, cascade) |
| `stepNumber` | Int |
| `agentId` | String? |
| `skillId` | String? |
| `action` | String |
| `config` | String (JSON) |

**Index**: `workflowId`

### WorkflowRun

Execution record for workflow runs.

| Field | Type |
|------|------|
| `workflowId` | String (FK → Workflow) |
| `companyId` | String? (FK → Company) |
| `status` | String | `running`, `completed`, `failed` |
| `durationMs` | Int? |

**Indexes**: `workflowId`, `companyId`, `status`, `createdAt`

### WorkflowPermission, WorkflowBuildRequest, WorkflowImprovementRequest, WorkflowUsageSummary

Supporting models for workflow management.

---

## Domain: Automation

### AutomationTrigger

| Field | Type |
|------|------|
| `name` | String |
| `eventType` | String | Event that triggers the automation |
| `actionType` | String | What to do when triggered |
| `config` | String (JSON) |
| `isActive` | Boolean |

### AutomationAction

Individual action within an automation trigger.

### AutomationTriggerLog

Execution log for automation triggers.

---

## Domain: Multi-Tenant (Companies)

### Company

| Field | Type | Notes |
|------|------|-------|
| `id` | String (cuid) |
| `name` | String |
| `slug` | String (unique) |
| `domain` | String? |
| `status` | String | `active`, `inactive` |
| `allowedWorkflows` | String (JSON) | Whitelisted workflow slugs |
| `allowedDepartments` | String (JSON) | Whitelisted department slugs |
| `monthlyUsageLimit` | Int | Token limit per month |
| `paidApiAllowed` | Boolean | External paid API access |
| `smsAllowed` | Boolean | SMS sending capability |
| `whatsappBulkAllowed` | Boolean | Bulk WhatsApp |
| `publicPublishAllowed` | Boolean | Public content publishing |
| `apiSecret` | String? | Company API secret |

**Relations**: `CompanyUser[]`, `CompanyApiKey[]`, `UsageLog[]`, `CompanyPermission[]`, `Subscription?`, `Invoice[]`, `Payment[]`, `TokenBudget?`, `TenantConfig?`, `CompanyDomain[]`, `CompanyIpAllowlist[]`, `AgentCompanyAccess[]`, `SkillCompanyAccess[]`, `WebhookConfig[]`, `WorkflowRun[]`, `CompanyMemory[]`, `Brand?`

### CompanyUser

Company membership with role.

| `companyId` | String (FK → Company, cascade) |
| `userId` | String |
| `role` | String | `operator` (default) |
| `@@unique([companyId, userId])` |

### CompanyApiKey

| Field | Type | Notes |
|------|------|-------|
| `companyId` | String (FK → Company, cascade) |
| `keyHash` | String (unique) | SHA-256 hash |
| `keyPrefix` | String | First 8 chars for identification |
| `keyType` | String | `test`, `live`, `restricted`, `service`, `webhook` |
| `scopes` | String (JSON) | Permission scopes |
| `rateLimit` | Int | Requests per minute |
| `ipAllowlist` | String (JSON) | Allowed IPs |
| `isActive` | Boolean |
| `expiresAt` | DateTime? |
| `rotatedAt` | DateTime? |
| `previousKeyHash` | String? | For grace period |

**Index**: `companyId`

### CompanyPermission, CompanyDomain, CompanyIpAllowlist, CompanyMemory, TenantConfig

Supporting models for multi-tenant access control and configuration.

---

## Domain: Billing

### SubscriptionPlan

| Field | Type |
|------|------|
| `name` | String (unique) |
| `slug` | String (unique) |
| `priceMonthly` | Float |
| `priceYearly` | Float |
| `agentLimit` | Int | Default: 100 |
| `skillLimit` | Int | Default: 500 |
| `workflowLimit` | Int | Default: 100 |
| `monthlyTokens` | Int | Default: 1,000,000 |
| `monthlyRequests` | Int | Default: 50,000 |
| `features` | String (JSON) |
| `isEnterprise` | Boolean |

### Subscription

| `companyId` | String (unique, FK → Company) |
| `planId` | String (FK → SubscriptionPlan) |
| `status` | String | `active`, `past_due`, `cancelled` |
| `currentPeriodStart` | DateTime |
| `currentPeriodEnd` | DateTime |

### Invoice, Payment

Financial transaction records.

### CostEstimate

| Field | Type |
|------|------|
| `provider` | String | AI provider or service name |
| `modelOrService` | String | Specific model/service |
| `estimatedUnits` | Int |
| `estimatedCost` | Float |
| `currency` | String | Default: `USD` |
| `localAlternative` | String? | Suggested free alternative |
| `status` | String | `pending`, `approved`, `rejected`, `expired` |

**Indexes**: `companyId`, `status`, `createdAt`

### TokenBudget

Per-company token budget tracking.

### TokenUsage

Individual token usage records.

---

## Domain: CRM

### CrmContact

| Field | Type |
|------|------|
| `firstName` | String |
| `lastName` | String |
| `email` | String? |
| `phone` | String? |
| `company` | String? |
| `status` | String | `lead`, `prospect`, `customer`, `churned` |

### CrmDeal

| Field | Type |
|------|------|
| `title` | String |
| `value` | Float? |
| `stage` | String |
| `pipelineId` | String? |
| `contactId` | String? |
| `status` | String | `open`, `won`, `lost` |

### CrmPipeline, CrmPipelineStage, CrmActivity, CrmNote, CrmLeadScore

Supporting CRM models.

---

## Domain: RAG (Retrieval-Augmented Generation)

### RagCollection

| Field | Type |
|------|------|
| `companyId` | String? |
| `name` | String |
| `documentCount` | Int |
| `status` | String | `active` |

### RagDocument

| Field | Type | Notes |
|------|------|-------|
| `collectionId` | String (FK → RagCollection) |
| `companyId` | String? |
| `name` | String |
| `source` | String? |
| `classification` | String | `public`, `internal`, `confidential`, `restricted`, `highly_restricted` |
| `checksum` | String? | For deduplication |
| `version` | Int |
| `chunkCount` | Int |
| `status` | String | `indexed` |

### RagChunk

| Field | Type |
|------|------|
| `documentId` | String |
| `companyId` | String? |
| `content` | String |
| `embedding` | String? | Base64 or JSON vector |
| `metadata` | String (JSON) |
| `position` | Int |

### RagQuery, RagAnswer, RagFeedback

Query logging and feedback collection.

---

## Domain: Memory

### MemoryShortTerm

Session-scoped memory with TTL.

| Field | Type |
|------|------|
| `sessionId` | String |
| `taskId` | String? |
| `agentId` | String? |
| `content` | String |
| `expiresAt` | DateTime? |

### MemoryLongTerm

Permanent knowledge store.

| Field | Type | Notes |
|------|------|-------|
| `scope` | String | `global`, `company`, `department`, `agent` |
| `scopeId` | String? |
| `category` | String |
| `content` | String |
| `source` | String? |
| `confidence` | Float | 0-1 |
| `approvedBy` | String? |

### MemoryStaticRule

Immutable rules that agents cannot modify.

| Field | Type |
|------|------|
| `scope` | String | `global`, `company`, `department` |
| `ruleType` | String | `protection`, `payment`, `approval`, `rbac`, `data_classification` |
| `ruleKey` | String |
| `ruleValue` | String |
| `isLocked` | Boolean | Default: true |

---

## Domain: Job Queue

### JobQueue

| Field | Type |
|------|------|
| `name` | String (unique) |
| `maxRetries` | Int | Default: 3 |
| `concurrency` | Int | Default: 5 |
| `isActive` | Boolean |

### QueueItem

| Field | Type |
|------|------|
| `queueId` | String (FK → JobQueue) |
| `jobType` | String |
| `priority` | Int |
| `payload` | String (JSON) |
| `status` | String | `queued`, `processing`, `completed`, `failed`, `cancelled` |
| `attempts` | Int |
| `maxAttempts` | Int |
| `scheduledAt` | DateTime? | For delayed execution |

---

## Domain: Webhooks

### WebhookConfig

| Field | Type |
|------|------|
| `companyId` | String (FK → Company, cascade) |
| `name` | String |
| `url` | String |
| `events` | String (JSON) | Event types to deliver |
| `secret` | String? | HMAC signing secret |
| `isActive` | Boolean |

**Indexes**: `companyId`, `isActive`

### WebhookDelivery

Delivery log with status, response code, and retry count.

---

## Domain: Monitoring & Observability

### Metric

Generic metric storage for Prometheus-compatible export.

### HealthCheck

| Field | Type |
|------|------|
| `service` | String |
| `status` | String | `healthy`, `degraded`, `down` |
| `responseMs` | Int? |
| `details` | String? |

### InfraService

External service registration (Postgres, Redis, MinIO, Qdrant, etc.).

### WorkerNode

Background worker node tracking.

### SecurityEvent

Security-relevant event log.

### AuditLog

| Field | Type |
|------|------|
| `userId` | String? (FK → User) |
| `action` | String |
| `resource` | String |
| `details` | String (JSON) |
| `ipAddress` | String? |

**Index**: `userId`

### ServerLog, ErrorLog, DeploymentLog

System log models.

---

## Domain: Approvals & Protection

### Approval

| Field | Type | Notes |
|------|------|-------|
| `type` | String | `agent_build`, `skill_build`, `workflow_build`, `tool_approval`, `paid_api`, `deployment`, `shell_command`, etc. |
| `title` | String |
| `requestJson` | String (JSON) |
| `status` | String | `pending`, `approved`, `rejected`, `expired` |
| `requestedBy` | String? (FK → User) |
| `reviewedBy` | String? |

### AgentBuildRequest, SkillBuildRequest, WorkflowBuildRequest, ToolApprovalRequest

Typed build/approval requests.

### ProtectionLog, BlockedAction, PaymentGuardLog

Protection engine audit trail.

---

## Domain: Usage & Billing

### UsageLog

| Field | Type |
|------|------|
| `companyId` | String? (FK → Company) |
| `commandId` | String? |
| `agentId` | String? |
| `skillId` | String? |
| `tokensOrLocalUsed` | Int |
| `paidApiUsed` | Boolean |
| `externalCostRisk` | String | `none`, `low`, `medium`, `high` |
| `status` | String |

**Indexes**: `companyId`, `status`, `createdAt`

### CompanyUsageSummary, AgentUsageSummary, WorkflowUsageSummary

Pre-aggregated usage metrics per period.

---

## Domain: Marketplace

### MarketplaceListing

Skills or agents available for installation.

### MarketplaceReview

User reviews of marketplace items.

---

## Domain: Other Models

| Model | Purpose |
|-------|---------|
| `Settings` | Key-value configuration store (also stores sessions) |
| `File` | Uploaded file metadata |
| `Notification` | User notifications |
| `Alert` | System alerts |
| `Incident` | Operational incidents |
| `Brand` | Company brand configuration |
| `ModelRegistry` | LLM model registry |
| `ModelHealth` | LLM model health tracking |
| `ModelAssignment` | Agent ↔ model assignments |
| `McpServer` | MCP (Model Context Protocol) server registry |
| `FeatureFlag` | Feature flag toggles |
| `Output` | Task output records |
| `FeedbackLog` | User feedback on agent outputs |
| `ToolRun` | Tool invocation log |
| `LearningReport` | Agent self-improvement reports |
| `ProductivityReport` | Agent productivity scores |
| `AutomationSuggestion` | Suggested automations |
| `CapabilityRequest` | Requests for new capabilities |
| `SOPUpdate` | Standard operating procedure changes |
| `DomainDeployment` | Domain deployment records |
| `ProjectUpload` | Project upload tracking |
| `DisasterRecoveryConfig` | DR configuration |
| `RecoveryRun` | DR execution logs |

---

## Multi-Database Support

The `src/lib/db-adapters/` directory provides adapters for multiple databases:

| Adapter | File | Status |
|---------|------|--------|
| SQLite | `sqlite-adapter.ts` | Primary (used via Prisma) |
| Postgres | `postgres-adapter.ts` | Available |
| MySQL/MariaDB | `mysql-adapter.ts` | Available |

The `Manager` class in `manager.ts` provides a unified interface for managing database adapters and connections.

---

## Migration Strategy

### Development

Use `bun run db:push` for rapid prototyping. This applies schema changes directly without creating migration files.

### Production

Use `bun run db:migrate` to create named migration files. These can be reviewed, tested, and applied via the `/api/db/migrate` endpoint.

### Backup & Restore

```bash
# Via API
POST /api/backups/create   # Creates a backup
POST /api/backups/restore   # Restores from a backup
GET  /api/backups            # Lists available backups

# Via scripts
deploy/scripts/backup.sh
deploy/scripts/restore.sh
```

---

## Index Reference

The schema defines 40+ indexes for query optimization. Key indexed fields:

| Model | Indexed Fields |
|-------|---------------|
| Agent | `departmentId` |
| AgentRun | `agentId`, `taskId`, `status`, `createdAt` |
| SkillRun | `skillId`, `taskId`, `status`, `createdAt` |
| WorkflowRun | `workflowId`, `companyId`, `status`, `createdAt` |
| UsageLog | `companyId`, `status`, `createdAt` |
| Command | `status`, `createdAt`, `userId` |
| WebhookConfig | `companyId`, `isActive` |
| CompanyApiKey | `companyId` |
| ToolRun | `taskId`, `agentId`, `status`, `createdAt` |
| CostEstimate | `companyId`, `status`, `createdAt` |
| AuditLog | `userId` |
| AgentMemory | `agentId` |
| TaskStep | `taskId` |
| WorkflowStep | `workflowId` |
| SkillPermission | `skillId` |
| PaymentGuardLog | `apiName`, `createdAt` |
| QueueItem | `queueId` (via JobQueue FK) |