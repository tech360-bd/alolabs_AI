# ALO Education Master Prompt — Phase 0 / 1 / 2 Audit

**Date:** 2026-10-09, re-measured 2026-10-12
**Branch:** `arena/a1b46708-alolabs-net-ai`
**Base:** `1cb5f1e` (Merge pull request #12 from `arena/20918bcf-alolabs-net-ai`)
**Scope of this document:** Phase 0 (requirement + repository audit), Phase 1 (read requirements / inspect project) and Phase 2 (requirement-to-code matrix, conflict identification) of the Master Enterprise Platform prompt.

> **Re-measurement note (2026-10-12).** This audit was first run against `f225b98`. Between then and now
> `main` was force-pushed to a **new single-commit squashed history** (`1cb5f1e`, 1 commit total, dated
> 2026-10-12) that shares **no common ancestor** with `f225b98` — `git merge-base f225b98 1cb5f1e` returns
> nothing. That new history adds substantial work (`src/lib/api/secure-crud.ts`, `src/lib/api/secure-route.ts`,
> the whole `src/lib/workforce/` tree, workforce-provisioning migrations, and ~10.8k lines across 99 files).
> Every figure below has been **re-measured against `1cb5f1e`**. This branch was rebased onto it so that this
> PR adds exactly one file and deletes nothing.

**Status: STOP — a blocking scope conflict was found before any code was written.**
No source code was modified in this phase. Sections 3.4 ("Resolve architecture conflicts safely") and 63 ("Work in controlled phases") of the prompt both require this conflict to be identified and documented before implementation proceeds.

---

## 1. The blocking finding

**The repository checked out at `/home/user/alolabs.net_ai` is not the "ALO Education" international-education-consultancy platform described by the master prompt. It is `alolabs-agentos`, an enterprise AI-agent operating system.**

Evidence:

| Claim in master prompt | What the repository actually contains | How measured |
|---|---|---|
| "ALO Education International Education Consultancy" | `package.json` → `"name": "alolabs-agentos"`, `"description": "ALO Labs AgentOS / AI-EOS — Enterprise Artificial Intelligence Operating System"` | `cat package.json` |
| Public consultancy website with ~32 page areas (§6) | **5** `page.tsx` files: `/`, `/brand`, `/design`, `/site`, `/invoice` | `find src/app -name page.tsx` |
| 137 API routes | **366** `route.ts` files under `src/app/api` | `find src/app/api -name route.ts \| wc -l` |
| 175 Prisma models | **179** `model` blocks in `prisma/schema.prisma` | `grep -c "^model "` |
| 75 view components | **230** `.tsx` files under `src/components` | `find src/components -name "*.tsx" \| wc -l` |
| "Prisma 6 with MySQL" as the production database | `prisma/schema.prisma` datasource is **`provider = "sqlite"`**, `url = env("DATABASE_URL")`; `.env.example` line 24 → `DATABASE_URL=file:./db/custom.db`. MySQL exists only as a separate, secondary file `prisma/schema.mysql.prisma` | `head -12 prisma/schema.prisma`; `grep DATABASE_URL .env.example` |
| Student IDs in the format `ALO-S-20001` | **0** occurrences of `ALO-S-` anywhere in the repository | `grep -rn "ALO-S-"` → count 0 |
| WhatsApp pool `01805020100`–`01805020119` | **0** occurrences of `0180502010` anywhere in the repository | `grep -rn "0180502010"` → count 0 |
| "ALO Education" as the product identity | 18 files mention the string, all as one of several *sister companies / departments / brand entries* inside the AgentOS product (e.g. `src/app/api/sister-companies/route.ts`, `src/lib/department-registry/registry.ts`, `src/components/panels/brand-management-panel.tsx`) | `grep -ril "alo education"` |

`README.md` states the product identity directly, and its own header warning says the historical counts in it "have not been fully re-audited":

> **AgentOS transformation status (2026-10-08): experimental / NOT production-ready.** … Current schema: **175 Prisma models**. Current checks: typecheck, lint (1 warning), **724 tests across 51 files**…

The repo's own verified-baseline document (`ALO_LABS_VERIFIED_BASELINE.md`, captured 2026-10-08) describes an *AgentOS* source baseline, not an education consultancy baseline.

### 1.1 Models the prompt says exist, checked against the actual schema

Every one of the following returns **0** matches for `^model <Name> ` in `prisma/schema.prisma`:

`Student`, `Lead`, `Counselor`, `Employee`, `Visa`, `VisaCase`, `Scholarship`, `Sla`,
`WhatsAppNumber`, `WhatsAppContact`, `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppTemplate`,
`FollowUpSchedule`, `SlaEscalation`, `DashboardAlarm`, `DeleteRequest`, `NoteVersion`,
`DocumentSecurityIncident`, `WhatsAppRawEvent`.

Only `Payment` and `Invoice` exist (1 each), and they belong to the AgentOS billing domain (`SubscriptionPlan`, `Subscription`, `Invoice`, `Payment`), not to student tuition/service fees.

§27 of the prompt asserts the audit "reports" these 12 WhatsApp/SLA models. **They do not exist in this schema.** The WhatsApp integration that *does* exist stores its state as JSON blobs in the generic `Settings` table:

```
src/app/api/whatsapp/numbers/route.ts
  → db.settings.findUnique({ where: { key: 'whatsapp:numbers' } })
  → interface StoredWhatsAppNumber { id, phoneNumberId, displayName, businessName,
                                     accessToken, isDefault, aiEnabled, ... }
```

There is no `WhatsAppNumber` table, no raw-event table, no deduplication key, no SLA table.

### 1.2 Education-domain surface that *does* exist

Not zero — but it is a thin slice of a 366-route API, and it is AgentOS-shaped:

- **6 Prisma models:** `University`, `UniversityFaculty`, `UniversityCourse`, `UniversityScholarship`, `UniversityAccommodation`, `UniversityIntake` (schema lines 2074–2196).
- **6 API routes:** `src/app/api/universities/{route,[id]/route,courses/route,scholarships/route,accommodation/route,stats/route}.ts`.
- **2 seed scripts:** `scripts/seed-universities.ts` (2,537 lines) and `scripts/seed-education.ts` (1,160 lines — tutors/courses for a tutoring hub, not study-abroad applications).
- **2 hub routes:** `src/app/api/education-hub/route.ts`, `src/app/api/interview-hub/route.ts`.
- **No** student, application, offer, visa, deposit, counselor-assignment, SLA or partner-isolation model anywhere.

### 1.3 What the repository *is* genuinely good at (maps to Part IV of the prompt)

Part IV (AI Enterprise Operating System) is the one part of the master prompt that matches this codebase well:

| Prompt target (§29) | Actual | Evidence |
|---|---|---|
| 100 departments | **100** department configs | `grep -c "departmentId: '" src/lib/department-registry/registry.ts` → 100 |
| 2,000 agents | **2,320** declared agent slots summed across the 100 departments (`agentCount` field) — *declared inventory, not executable agents* | `grep -oE "agentCount: [0-9]+" … \| awk '{s+=$2}'` → 2320 |
| 20 AI engines / skills / prompts / SOPs / constitutional rules | Models exist: `Skill`, `SkillVersion`, `PromptTemplate`, `EnterpriseSOP`, `ConstitutionalRule`, `Agent`, `AgentVersion`, `AgentRun`, `AgentHealth`, `AgentEvaluation`, `AIProviderConfig`, `ModelRoutingDecision` | schema model list |
| Provider abstraction (§33) | `AIProviderConfig.provider` supports `openai-compatible, anthropic, ollama, openrouter, groq, deepseek, mistral, zai-sdk`; fields for `encryptedApiKey`, `keyFingerprint`, `lastHealthStatus`, `maxRetries`, `timeoutMs` | schema line 3365 |
| Job queue / background workers (§48) | `JobQueue`, `QueueItem`, `src/lib/job-queue.ts`, `src/instrumentation.node.ts` (3-second poll, 10-minute stale-job startup recovery, queue name `agentos`) | `ALO_LABS_VERIFIED_BASELINE.md` |

---

## 2. Measured baseline (this is what actually exists — the prompt's §3.3 table is not current)

The prompt says "Do not assume these counts are still current. Measure the actual project and database." Measured:

| Area | Prompt's reported baseline | **Measured in this repo** |
|---|---:|---:|
| Prisma models | 175 | **179** |
| API routes | 137 | **366** |
| View components | 75 | **230** `.tsx` in `src/components` |
| App Router pages | (not stated) | **5** |
| Test files | 51 (per README) | **68** |
| Seed files | 21 | **21** `seed-*` scripts in `scripts/` (46 scripts total) — *this one figure does match* |
| Verified universities | 239 | **cannot verify — no database present** |
| Courses | 467 | **cannot verify — no database present** |
| Student records | 14 | **0 — no `Student` model exists** |
| Leads | 26 | **cannot verify — no `Lead` model; `CrmContact`/`CrmDeal` exist instead** |
| Documents | 121 | **cannot verify — no database present** |
| WhatsApp number pool | 20 | **0 rows verifiable; no `WhatsAppNumber` model** |
| Departments | (not stated) | **100** in `department-registry` |

**There is no database in this checkout.** `find . -name "*.db" -o -name "*.sqlite*"` returns nothing; `.gitignore` excludes the SQLite/WAL files. `prisma/migrations/` contains only `mysql/` with 3 raw `.sql` files (`20261008_agentos_foundation.sql`, `20261009_agentos_hardening.sql`, `20261009_agentos_hardening_rollback.sql`) — no Prisma migration history for the active SQLite schema.

Consequence: every data-count claim in the prompt's baseline table (universities, courses, students, leads, documents, WhatsApp numbers) is **unverifiable from this repository** and must not be repeated as fact.

---

## 3. Quality gates actually executed

Dependencies installed with `npm ci --ignore-scripts --no-audit --no-fund` → **759 packages, exit 0**. (`--ignore-scripts` was required; see §4.)

### 3.1 ESLint — PASS

```
$ npx eslint .
src/app/layout.tsx
  64:9  warning  Custom fonts not added in `pages/_document.js`…  @next/next/no-page-custom-font
src/lib/storage/local-storage.ts
  101:3 warning  Unused eslint-disable directive (no problems were reported from 'no-control-regex')

✖ 2 problems (0 errors, 2 warnings)
```

**0 errors.** Matches the repo's own documented "lint (1 warning)" baseline within one warning.

### 3.2 Vitest — 984 passed / 8 failed / 39 skipped; 60 of 68 files passed

```
$ npx vitest run
Test Files  8 failed | 60 passed (68)
     Tests  8 failed | 984 passed | 39 skipped (1031)
```

All 8 failing files are in `__tests__/integration/` and all fail for the same environment reason — the
missing native `better-sqlite3` binding and the un-generated Prisma client — not because of a code defect:

| Failing file | Failed assertions | Cause |
|---|---|---|
| `agent-health-integrity.test.ts` | 0 / 5 (file-level) | import failure → Prisma client not generated |
| `ai-provider-config.test.ts` | 0 / 7 (file-level) | import failure → Prisma client not generated |
| `backup-restore.test.ts` | 7 / 8 | `Could not locate the bindings file … better_sqlite3.node` |
| `job-queue-durability.test.ts` | 0 / 10 (file-level) | import failure → Prisma client not generated |
| `prisma-foreign-keys.test.ts` | 0 / 4 (file-level) | import failure → Prisma client not generated |
| `run-resume.test.ts` | 0 / 3 (file-level) | import failure → Prisma client not generated |
| `sqlite-foreign-keys.test.ts` | 1 / 1 | `Could not locate the bindings file … better_sqlite3.node` |
| `workforce-provisioning.test.ts` | 0 / 11 (file-level) | needs a real SQLite DB via `scripts/sqlite-push.ts` + Prisma client |

984 passing tests is the real, reproducible signal here. Note that `workforce-provisioning.test.ts` is new
on `1cb5f1e` and is the most heavily environment-dependent of the set — its own header states it runs
"against a REAL SQLite database (schema applied by `scripts/sqlite-push.ts`, queries through the
application's Prisma client)", so it cannot pass in this sandbox by construction.

### 3.3 TypeScript — 416 errors, ALL caused by the un-generated Prisma client (NOT reproducible here)

```
$ npx tsc --noEmit     # exit 2
total errors: 416, across 134 files
  376  TS7006  Parameter implicitly has an 'any' type
   34  TS2305  Module '"@prisma/client"' has no exported member 'Prisma'
    2  TS2345 / 2 TS18046 / 1 TS2322 / 1 TS2307
```

Root cause, confirmed: `npx prisma generate` fails in this sandbox.

```
Error: request to https://binaries.prisma.sh/all_commits/c2990dca…/debian-openssl-3.0.x/schema-engine.gz.sha256
       failed, reason: Client network socket disconnected before secure TLS connection was established
```

With no generated client, `Prisma` is not exported and every Prisma-typed callback parameter degrades to implicit `any`. **These 416 errors are an artifact of the sandbox, not a statement about the code.** The prompt's §56 claim of a passing typecheck could neither be reproduced nor refuted here.

### 3.4 Production build — NOT ATTEMPTED

`npm run build` requires a generated Prisma client and therefore cannot run in this sandbox. Reported as unverified rather than claimed.

---

## 4. Sandbox limitations that block parts of the prompt

This sandbox has outbound access only to `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`. Consequences, all encountered:

1. **`better-sqlite3` cannot be compiled.** `prebuild-install` falls back to `node-gyp rebuild`, which needs `https://nodejs.org/download/release/v22.22.3/node-v22.22.3-headers.tar.gz` → `ECONNRESET`. Hence `npm ci` must run with `--ignore-scripts`, and hence all DB-backed integration tests fail.
2. **`prisma generate` cannot run.** Engine binaries live on `binaries.prisma.sh`. Hence §3.3.
3. **No live database, no production host.** §59/§60 (deployment and production smoke tests) cannot be performed or verified from here.
4. **§4 benchmarking is partially blocked.** `ucas.com`, `idp.com`, `applyboard.com`, `commonapp.org`, `salesforce.com`, `hubspot.com`, `intercom.com`, `linear.app`, `notion.so`, `stripe.com` are all outside the allowlist. Per the prompt's own instruction — "If external browsing is unavailable, record that limitation instead of inventing benchmark findings" — **no benchmark findings are recorded in this document, and none will be invented.**
5. **§11 / §36 real scholarship and university data cannot be sourced or verified** from official sites. Per the prompt's non-negotiables, nothing will be fabricated to fill those tables.

---

## 5. Requirement-to-code matrix (Phase 2), condensed

| Prompt section | Requirement | Actual state in this repo | Status |
|---|---|---|---|
| §6–13 Part I | Public consultancy website: home, destinations, university/course/scholarship directories + detail pages, blog, FAQ, policies, SEO, sitemap | 5 pages total. `/site` is an AgentOS marketing page ("1020 AI agents across 100+ departments"). `sitemap.ts` exists (281 bytes). No destination/university/course/scholarship **pages** — only JSON API routes | **MISSING** (wrong product) |
| §14–15 | 30 role-based workspaces | 1 global `EnterpriseShell` (`src/app/page.tsx`, client-rendered, `ssr: false`) with `src/components/enterprise/panels/*` and `src/components/panels/*` (230 tsx). Panel-per-feature, not route-per-role | **PARTIAL** (different architecture) |
| §16 | Super Admin Command Center | `src/components/panels/super-admin-command-center.tsx` exists — but for AgentOS metrics, not students/applications/visas | **PARTIAL** |
| §17 | CRM lifecycle (NEW → … → ENROLLED) | `CrmContact`, `CrmDeal`, `CrmPipeline`, `CrmPipelineStage`, `CrmActivity`, `CrmNote`, `CrmLeadScore` + `src/app/api/crm/*`. Generic sales pipeline; **no education stages, no counselor assignment, no follow-up scheduler** | **PARTIAL** (generic CRM only) |
| §18 | Counselor dashboard + Student 360 (`ALO-S-20001`) | No `Student` model, no `ALO-S-` format anywhere | **MISSING** |
| §19 | Student portal | No student model, no student routes | **MISSING** |
| §20 | Application processing workflow | No application model | **MISSING** |
| §21 | Visa case management | No visa model | **MISSING** |
| §22 | Partner portal + partner isolation | `Company`, `CompanyUser`, `CompanyApiKey`, `CompanyPermission`, `TenantConfig`, `AgentCompanyAccess`, `SkillCompanyAccess` — multi-tenant for **agents**, not education partners | **PARTIAL** (agent tenancy only) |
| §23 | HRM / payroll / leave / salary slips | No `Employee`, payroll, attendance or leave model | **MISSING** |
| §24 | Finance dashboard | `Invoice`, `Payment`, `Subscription`, `SubscriptionPlan`, `CostEstimate`, `TokenUsage` — AI-usage billing, not student payments/commissions | **PARTIAL** (different domain) |
| §25 | Marketing command center | `Brand`, `marketing-kit`, `src/lib/marketing-kit/`, `src/components/marketing/`, social APIs. No campaign-attribution-to-lead model | **PARTIAL** |
| §26 | Omnichannel unified inbox | `Conversation`, `ConversationMessage`, social/email routes. No unified cross-channel inbox with SLA/priority/intent | **PARTIAL** |
| §27 | WhatsApp enterprise (12 named models) | 4 routes (`webhook`, `send`, `numbers`, `campaigns`) + `src/lib/whatsapp/` (`client`, `ai-handler`, `types`). State is JSON in `Settings`. **None of the 12 named models exist.** No raw-event storage, no dedup key, no STOP/START consent model, no follow-up templates | **PARTIAL / mostly MISSING** |
| §28 | SLA command center (Asia/Dhaka, Sat–Thu 09:00–18:00) | No `Sla`, `SlaEscalation` or `DashboardAlarm` model. `DepartmentConfig.sla` holds only `{ responseTimeMs, uptimePercent }` for agent departments. No office-hours engine | **MISSING** |
| §29–35 Part IV | AI agent OS: 100 depts / 2,000 agents / 20 engines / 10,000 skills / 50,000 prompts / 500 rules / 500 SOPs | **Strong match.** 100 departments; 2,320 declared agent slots; `Agent`/`AgentVersion`/`AgentRun`/`AgentHealth`/`AgentEvaluation`/`AgentGovernanceEvent`; `Skill`/`SkillVersion`/`SkillValidationLog`; `PromptTemplate`; `EnterpriseSOP`; `ConstitutionalRule`; `AIProviderConfig` with 8 providers; `Approval`/`ToolApprovalRequest`/`BlockedAction` for human-in-the-loop | **PARTIAL — the one area worth building on** (inventory counts still unverified against a live DB) |
| §36 | University monitoring center | No source-registry / snapshot / change-detection model | **MISSING** |
| §37 | Knowledge center | `KnowledgeNode`, `KnowledgeEdge`, `RagCollection`, `RagDocument`, `RagChunk`, `RagQuery`, `RagAnswer`, `RagFeedback` + `src/lib/rag-engine.ts` — general-purpose RAG, not education knowledge | **PARTIAL** |
| §38 | Document + storage security (UUID names, SHA-256, magic bytes) | `File` model, `src/lib/storage/`, `src/lib/minio.ts`, `scripts/verify-file-acl.mjs`, `ALO_LABS_FILE_TENANT_ACL_TEST.md`. Storage pools named in the prompt (`STUDENT_PARTNER`, `OFFICIAL`, `OPERATIONAL`) **not found** | **PARTIAL** |
| §39 | Document review workflow | No review/approve/reject lifecycle on `File` | **MISSING** |
| §40 | Access control center | `Role`, `Permission`, `RolePermission`, `FeatureFlag`, `src/lib/route-auth.ts`, `src/lib/api-auth.ts`, `src/lib/v1-auth.ts`, `bcrypt` + `jsonwebtoken`. Real RBAC exists — for AgentOS roles (`super_admin, admin, manager, operator, viewer` per `User.role`), not the 30 education roles | **PARTIAL** |
| §41 | Note versioning + delete requests | No `NoteVersion`, no `DeleteRequest`. `CrmNote` has no version history | **MISSING** |
| §42 | Review management / Google Business Profile | `MarketplaceReview` is for marketplace listings, not student testimonials. No GBP OAuth | **MISSING** |
| §43 | Notification center | `Notification` model + `src/app/api/notifications` — exists, generic | **PARTIAL** |
| §44 | Reporting & analytics | `Metric`, `Alert`, `UsageLog`, `*UsageSummary`, `src/app/api/analytics`, `/metrics` — AgentOS telemetry, not education reports | **PARTIAL** |
| §45 | Global search / command palette | `cmdk` dependency; `src/components/enterprise/enterprise-shell.tsx` shell | **PARTIAL** |
| §46 | Student lifecycle LEAD → … → ALUMNI | Not modelled | **MISSING** |
| §47 | Tasks / appointments / follow-ups | `Task`, `TaskStep`, `TaskError`, `src/app/api/meetings` — agent tasks, not counselor follow-ups | **PARTIAL** |
| §48 | Background jobs | `JobQueue`, `QueueItem`, `src/lib/job-queue.ts`, `src/instrumentation.node.ts`, `src/lib/workers/` | **IMPLEMENTED** (AgentOS scope) |
| §49–52 | DB / security / performance / observability | Real: `SecurityEvent`, `ProtectionLog`, `RateLimitRecord`, `AuditLog`, `ErrorLog`, `HealthCheck`, `src/lib/security/`, `src/lib/rate-limiter.ts`. Provider is **SQLite**, not the MySQL the prompt assumes | **PARTIAL** |
| §53 | High-priority gaps (SLA service, alarm UI, follow-up templates, scheduler, STOP/START, raw events, Dhaka office hours) | **All 7 remain MISSING** — none can be "completed" because none of the underlying models exist | **MISSING ×7** |
| §55 | External blockers (Meta Cloud API, GBP OAuth, Graph API) | `WHATSAPP_*` env vars read in `src/app/api/whatsapp/webhook/route.ts`; `.env` absent. **No credentials present; nothing can be connection-tested here** | **EXTERNAL BLOCKED** |
| §59–60 | Deployment + production smoke tests | `deploy/`, `ecosystem.config.js`, `Caddyfile`, `docker-compose*.yml`, `scripts/{deploy,rollback,healthcheck}.sh` exist. **No production host reachable from this sandbox** | **NOT VERIFIABLE HERE** |

### 5.1 Status roll-up (this repository, as measured)

Counting the 33 sections above at section granularity:

- **IMPLEMENTED + VERIFIED:** 1 (§48 background jobs — verified by the 984 passing tests, which include job-queue unit coverage)
- **PARTIAL:** 14
- **MISSING:** 13
- **EXTERNAL BLOCKED:** 1 (§55)
- **NOT VERIFIABLE IN THIS SANDBOX:** 4 (§56 build/typecheck, §59, §60, §4 benchmarking)

This is deliberately *not* comparable to the prompt's "312 of 358 implemented" figure. That figure describes a different codebase and cannot be reproduced from anything present here.

---

## 6. The decision required before Phase 3

Per §3.4: *"If the current project or a newer authoritative deployment instruction establishes a different stack, identify the conflict, document the evidence, and preserve the working production architecture until the correct target is established."*

That is where this audit stops. Three mutually exclusive paths, none of which should be chosen silently:

**Option A — Wrong repository.** The ALO Education platform lives elsewhere. Provide the correct repository/host and the Phase 0–2 audit will be re-run against it. *Cost: nothing wasted here; the audit method transfers directly.*

**Option B — Build ALO Education inside this repository.** The education domain is added alongside AgentOS: ~20 new Prisma models (`Student`, `Application`, `VisaCase`, `Scholarship`, `Sla`, `SlaEscalation`, `DashboardAlarm`, `FollowUpSchedule`, `WhatsAppRawEvent`, `NoteVersion`, `DeleteRequest`, …), ~27 new public pages, and the 7 §53 automations. This **preserves** all 179 existing models and 366 routes (nothing is deleted), but it makes one repository serve two very different products. *Cost: very large; several sessions.*

**Option C — Scope to what this repository actually is.** Execute Part IV (AI Enterprise Operating System) properly against the real 100-department / 2,320-slot registry: verify which of the 2,320 declared agents are actually executable, complete the provider health-check path, and finish the human-approval and audit-trail loop. *Cost: moderate; high fit.*

**Recommendation: confirm Option A first.** The prompt's own §2 rule — *"Never introduce a second implementation of a feature without first checking whether an equivalent system already exists"* — plus the 0-for-20 model result in §1.1 make it far more likely that the education platform exists somewhere else than that it was meant to be grown out of an agent-runtime codebase.

---

## 7. Reproduction commands

```bash
cd /home/user/alolabs.net_ai
npm ci --ignore-scripts --no-audit --no-fund   # 759 packages; --ignore-scripts is required (see §4.1)
npx eslint .                                    # 0 errors, 2 warnings
npx vitest run                                  # 984 passed / 8 failed / 39 skipped; 60/68 files
npx tsc --noEmit                                # 416 errors — Prisma client not generated (§3.3)
npx prisma generate                             # FAILS: binaries.prisma.sh unreachable

grep -c "^model "          prisma/schema.prisma                    # 179
find src/app/api -name route.ts | wc -l                            # 366
find src/app -name page.tsx                                        # 5
grep -c "departmentId: '"  src/lib/department-registry/registry.ts # 100
```
