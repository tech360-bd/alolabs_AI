# Database Inventory — ALO LABS Private AI Platform Audit

> Audit date: 2026-11-11 · Branch: `docs/private-ai-platform-phase1-audit` · Method: read-only source verification.

## Datasource configuration

| Aspect | Dev | Production |
|---|---|---|
| Schema file | `prisma/schema.prisma` | `prisma/schema.mysql.prisma` |
| Provider | SQLite | MySQL / MariaDB |
| Model count | 221 | 221 (parity maintained) |
| Parity mechanism | `scripts/generate-mysql-schema.ts` | same |
| Enforcement | `src/lib/production-database.ts` refuses SQLite in prod | `.env.example:38-40` |

## Migrations

- `prisma/migrations/mysql/` — 8 hand-written SQL files, 2026-10-08 → 2026-11-11.
- Newest: `20261111_voice_gap_closure.sql` (landed with commit `7b9d192`).
- Each migration has a paired rollback file.
- **No baseline SQLite prisma migrations** — `db:migrate` = `prisma migrate dev` would create history from scratch (P2 gap).

## Key model groups (221 total — selected)

### Identity & tenancy
| Model | Key fields | Schema line |
|---|---|---|
| `User` | `role String @default("viewer")` (free-form: super_admin, admin, manager, operator, viewer) | `:16` |
| `Company` | `paidApiAllowed`, `smsAllowed`, `whatsappBulkAllowed`, `publicPublishAllowed`, `monthlyUsageLimit` (boolean flags, not structured entitlements) | `:729-800` |
| `CompanyUser` | `role String @default("operator")` (owner, admin, manager, operator, employee) | `:806` |
| `CompanyApiKey` | `keyHash String @unique`, `keyPrefix`, `keySuffix`, `scopes String` (JSON), `rateLimit Int @default(1000)`, `expiresAt DateTime?` | `:819-831` |
| `Session` (via `Settings` key `session:<sha256>`) | opaque token, hashed at rest | `src/lib/auth.ts:12-33` |

### AI infrastructure
| Model | Key fields | Schema line |
|---|---|---|
| `Agent` | `systemInstructions String?`, `runtimeProfile Json?` (model config, knowledge scope, memory policy, resource limits), `companyId String?`, `departmentId String?` | `:96-159` |
| `VoiceAgent` | `systemInstructions String?`, `knowledgeScope Json?`, `greeting String?`, `fallbackMessage String?` | `:3941-3969` |
| `Department` | `companyId String?` | `:319` |
| `Task` | `companyId String?`, `userId String?`, `agentId String?`, `status`, `startedAt`, `completedAt` | `:319-337` |
| `RunEvent` | `runId`, event type, payload | orchestration trace |
| `Skill` | `companyId String?` | |

### Knowledge / RAG
| Model | Key fields | Schema line |
|---|---|---|
| `RagCollection` | `companyId String?` | `:1045+` |
| `RagDocument` | `collectionId`, `companyId` | |
| `RagChunk` | `documentId`, `embedding` | |
| `RagQuery` | `companyId`, `query`, `result` | |
| `RagAnswer` | `queryId`, `answer`, `citations` | |
| `RagFeedback` | `answerId`, `rating` | |

### CRM (tenant-scoped — fixed in PR #28)
| Model | Key fields | Schema line |
|---|---|---|
| `CrmContact` | `companyId String?` `@@index([companyId])` | `:1864` |
| `CrmDeal` | `companyId String?`, `contactId`, `pipelineId` | |
| `CrmActivity` | `companyId String?`, `contactId?`, `dealId?` | |
| `CrmPipeline` | `companyId String?` | |
| `CrmLeadScore` | `contactId` (no own companyId; inherits through contact) | |

### Subscriptions (partial)
| Model | Key fields | Schema line |
|---|---|---|
| `SubscriptionPlan` | `agentLimit`, `skillLimit`, `workflowLimit`, `monthlyTokens`, `monthlyRequests`, `features Json` | `:1234-1254` |
| `Subscription` | `companyId`, `planId`, `status` | `:1256-1271` |

### Webhooks
| Model | Key fields | Schema line |
|---|---|---|
| `WebhookConfig` | `companyId`, `url`, `events String` (JSON), `secret String` | `:979-996` |
| `WebhookDelivery` | `webhookId`, `payload`, `status`, `deliveredAt` | `:1761-1776` |

### Cost / usage / audit
| Model | Key fields | Schema line |
|---|---|---|
| `CostEstimate` | `companyId String?`, `estimatedCost`, `actualCost`, `status` | |
| `PaymentGuardLog` | **no `companyId`** (global platform table) | |
| `UsageLog` | `companyId String?`, `paidApiUsed Boolean`, `tokensOrLocalUsed Int` | |
| `AuditLog` | `userId`, `action`, `resource`, `details` | |
| `SecurityEvent` | `type`, `severity`, `details` | `:2078` (types: security, performance, data, infrastructure) |

## Missing models vs spec

| Spec requirement | Status |
|---|---|
| `Service` (service catalog) | **NOT FOUND** |
| `Entitlement` (per-tenant service entitlements) | **NOT FOUND** |
| `Quota` (usage quotas) | **NOT FOUND** (only `Subscription.monthlyTokens`/`monthlyRequests`) |
| `ProjectDiscovery` (discovery reports) | **NOT FOUND** |
| `CapabilityAssessment` (capability reports) | **NOT FOUND** |
| `ExternalProject` (customer-connected projects with discovery) | **NOT FOUND** (only generic `Project` model) |

## Role model — current vs spec

| Source | Roles defined |
|---|---|
| `User.role` (`schema.prisma:16`) | `super_admin`, `admin`, `manager`, `operator`, `viewer` (free-form String) |
| `CompanyUser.role` (`schema.prisma:806`) | `owner`, `admin`, `manager`, `operator`, `employee` |
| API keys | implicit role `"api"` at auth (`src/lib/v1-auth.ts:98`) |
| `ADMIN_ROLES` whitelist | `['super_admin', 'admin']` (`src/lib/api/secure-route.ts:47`) |
| **Spec's 7 roles** | **NONE exist**: `PLATFORM_SUPER_ADMIN`, `AI_WORKFORCE_ADMIN`, `AI_MODEL_ADMIN`, `SECURITY_ADMIN`, `INFRASTRUCTURE_ADMIN`, `TENANT_ADMIN`, `API_CONSUMER` (0 matches in `src/` or `prisma/`) |

## Migration strategy note

The spec requires additive migrations only (no destructive changes). All new models (`Service`, `Entitlement`, `ProjectDiscovery`, `CapabilityAssessment`, `WebhookDelivery` dispatch log, etc.) would be added as new `model` blocks in both `schema.prisma` and `schema.mysql.prisma`, with paired `prisma/migrations/mysql/*.sql` files containing `CREATE TABLE` only (no `DROP`, no `ALTER` on existing tables unless additive column).
