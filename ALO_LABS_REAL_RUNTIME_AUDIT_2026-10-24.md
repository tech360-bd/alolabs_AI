# ALO Labs AI — Real Runtime Repository Audit

- **Audit date:** 2026-10-24 (Asia/Dhaka)
- **Checkout:** `/home/user/alolabs_AI`
- **Branch:** `arena/d1f6b0a3-alolabs-ai`, based at `501dc3d54374696bc9ca0ccb43acc3811b7ea537`; worktree changes are part of the pending PR.

**Scope boundary:** This is a source/runtime audit of this isolated checkout and GitHub metadata. No production host, database, process manager, Cloudflare account, or private deployment credentials were accessed. Do not interpret historical repository reports as current live production state.

## Executive result

The repository contains substantial AgentOS execution, routing, tool, queue, workforce, and governance code, plus an Ollama-compatible inference topology. **A working local model and an existing agent completing a real task are not proven here.** There is no model binary in the checkout, no Ollama or Docker executable in this sandbox, and no reachable local inference endpoint. A direct invocation of `scripts/verify-inference.ts --tiers fast --timeout 2000 --json` failed with `fetch failed` against `http://localhost:20128/v1`; result `passed: 0`, `failed: 1`. Therefore the current count of agents that this audit verified completing a real, local-model task is **0**. This is a verification count, not a claim that production has zero successful tasks.

No training run, fine-tuned model, checkpoint, or inference benchmark was found. The method `trainAgent()` in `src/lib/training/pipeline.ts` is explicitly a retrieval-knowledge attachment (`operation: 'retrieval-knowledge-attachment'`), not weight training. Do not call this model training.

## GitHub / Git evidence

- GitHub default branch is `main`; last reported push was 2026-10-19 at `501dc3d`.
- GitHub API listed five pull requests (#1–#5), all merged; no open PRs and no GitHub releases.
- Remote branches observed: `main`, `arena/8cc412a3-alolabs-ai`, `arena/e5e6e47b-alolabs-ai`, `arena/623884c3-alolabs-ai`, `arena/e0ab3e36-alolabs-ai`, `arena/38000575-alolabs-ai`, and `fix/production-dependency-audit`. The active Arena branch is local and session-bound; it must not be replaced by another branch.
- The current checkout is based at `501dc3d` (latest main in this audit's GitHub snapshot). Capability registry and explicit hosted-provider opt-in changes are in the pending branch worktree; do not describe them as already committed.
- On main workflow run `39269407609` (2026-10-19), CI quality/safety passed (including Prisma generation, typecheck, full test suite, lint, build and artifact checks), but the deployment-configuration job failed at “Validate required production SSH secrets”; deploy was skipped. On backup run `39888732052` (2026-10-23), the same secret-validation step failed and “Run verified server-side backup” was skipped. The attempt to fetch detailed Actions logs from the log host failed; job/step conclusions above are available from GitHub API. No production deployment or backup is evidenced by those runs.

## Repository inventory and classifications

Repository counts are static checkout counts, not a quality or runtime score: 407 `src/app/api/**/route.ts` files, 91 test files under `__tests__`, and 6 MySQL SQL migration files. The application is Next.js/TypeScript with Prisma; `schema.prisma` is SQLite-oriented and `schema.mysql.prisma` is present. Existing worker, run, and workflow subsystems are retained; no duplicate runtime was introduced.

| Capability | Classification | Source / function evidence | What is actually verified here |
|---|---|---|---|
| Department/workforce plan | IMPLEMENTED BUT UNTESTED IN LIVE DB | `src/lib/department-registry/registry.ts`; `src/lib/workforce/plan.ts`; `src/lib/workforce/provision.ts`; `scripts/provision-workforce.ts` | Deterministic plan unit tests passed (45 tests). Historical `ALO_LABS_WORKFORCE_AUDIT_2026-10-12.md` reports 100 departments / 2,000 configured agents in its isolated real SQLite DB, explicitly 0 operational. This checkout contains no DB file and no production DB access; current row counts are unknown. |
| AI employee identities | IMPLEMENTED; LIVE ROW COUNT BLOCKED | Prisma `AIEmployeeIdentity`; `src/lib/workforce/employee-identities.ts`; provisioning/verification scripts | Schema and source exist. No live DB query was made. Do not claim 2,000 identity rows from the presence of scripts. There is an older `WORKFORCE_AUDIT.md` from commit `87349b8` saying no employee model; that report predates the later `AIEmployeeIdentity` schema and is stale for current source. |
| Agent execution | IMPLEMENTED; REAL MODEL PATH BLOCKED | `src/app/api/agent-runtime/execute/route.ts`; `src/lib/agent-runtime/execution.ts`; `runToolLoop()` in `tool-loop.ts` | Route uses `secureRoute`, role checks and tenant-scoped agent lookup. Tool loop is bounded and permission-checked. Unit tests passed for execution policy/runtime pieces; no local-provider success path available. |
| Durable run queue | IMPLEMENTED; REAL TASK SUCCESS NOT VERIFIED | `POST /api/runs`; `src/lib/runs/index.ts`; `src/lib/workers/*`; `src/lib/job-queue.ts` | Persistent run/checkpoint/worker code exists. Selected AgentOS run pipeline tests passed. No database-backed, authenticated task was run in this checkout. |
| Multi-agent workflow | PARTIALLY IMPLEMENTED | `src/lib/multi-agent-orchestrator/orchestrator.ts`; `src/lib/workflow-engine/index.ts`; `workflows/definitions/*` | Existing orchestration unit tests passed, but every approval/parallel/recovery branch was not exercised end-to-end. |
| Tool calls and permissions | IMPLEMENTED; INTEGRATION PARTIAL | `src/lib/agent-runtime/tool-loop.ts`; `src/lib/tools/{registry,policy,execute}.ts` | Code checks per-agent permissions and uses persisted tool-run logic. Tests do not demonstrate safe real API/database effects across tenants. |
| Model routing | IMPLEMENTED; LOCAL INFERENCE BLOCKED | `src/lib/ai-router/{router,provider-registry,ollama-provider,model-tiers}.ts`; `src/lib/multi-tenant-ai/{policy,service}.ts` | Existing policy/model-tier/router tests passed. Hosted provider guards are fail-closed in company-scoped routing; implicit ZAI activation is now disabled unless `ZAI_SDK_ENABLED=true`. No active endpoint/model exists in this sandbox. |
| Ollama deployment | CONFIGURED, NOT RUN | `docker-compose.inference.yml`; `scripts/verify-inference.ts` | Compose defines Ollama and OpenAI-compatible gateway. Docker unavailable here. Actual inference probe failed as described above. |
| Model files/registry | NO WEIGHTS FOUND; CATALOG ONLY | `src/lib/open-source-models.ts`; `src/lib/model-registry.ts`; `src/lib/ai-router/model-tiers.ts` | Search of repository (excluding dependencies) found no GGUF, safetensors, PyTorch checkpoints, or other model weights. Model IDs and metadata are configuration, not weights or proof of permission/availability. |
| RAG/memory | PARTIALLY IMPLEMENTED | `src/lib/rag-engine.ts`; `src/lib/qdrant.ts`; `src/lib/memory/index.ts`; `src/lib/agent-runtime/pipeline.ts` | Retrieval/memory code exists. No live vector service/document was used; tenant isolation, source provenance, embedding quality and citation correctness not verified in this session. |
| “Training” | NOT MODEL FINE-TUNING | `src/lib/training/pipeline.ts`: `uploadSource`, `parseDocument`, `chunkDocument`, `embedChunks`, `trainAgent`, `evaluateTraining`, `deployTraining` | `trainAgent` attaches an indexed source to an agent; deployment changes retrieval source status after readiness evaluation. No LoRA/QLoRA trainer, curated dataset split, checkpoint export or training logs were found in this path. No verified training/checkpoint found in repo. |
| CRM / education / English assessment / MarketingOS | PARTIAL CODE / CONNECTOR STATUS UNVERIFIED | Domain routes and services exist in `src/app/api` and `src/lib`; no safe tenant credentials supplied | No authenticated business-system task was executed. Student, visa, payment and publishing workflows remain unverified and must keep human approval. |
| Speech/vision/document processing | PARTIAL / PROVIDER-DEPENDENT | `src/lib/media-generation/*`; Ollama family capability mapping; provider adapters | Adapter/catalog metadata is not evidence of installed models, OCR/doc parser, speech recognition or synthesis quality. None was run here. |
| Fine-tuning/model evaluation/rollback | MISSING AS A VERIFIED WEIGHT PIPELINE | `src/lib/chief-architect/index.ts` has gating criteria; `AgentEvaluation` records exist | Governance/evaluation models and proposal code are not a dataset-to-checkpoint training pipeline. No trained model exists as verified artifact. |
| Production deployment / backup / rollback | BLOCKED | `.github/workflows/deploy.yml`; backup workflow; GitHub run/job records | Current GitHub evidence shows missing production SSH-secret validation and skipped deployment/backup steps. Production process/database were not touched. No backup/restore or rollback drill was performed. |
| Cloudflare / public HTTPS | BLOCKED | Requires DNS/Cloudflare origin/network/operator access | Sandbox outbound access is restricted to GitHub and package hosts. Domain route, Cloudflare health, and current 502 could not be probed or changed. |

### Model subsystem facts

- This repository does not implement base-model architecture or model weights. It integrates provider APIs and a configured Ollama-compatible inference backend.
- Configured default model IDs include 72B, 32B, 7B, 1.5B, and 300M classes in `src/lib/ai-router/model-tiers.ts`; these are configuration, not downloaded models. A 72B default is not appropriate for the observed sandbox's 3.8 GiB RAM. Production hardware is unknown, so no production model size is endorsed.
- No GPU was observed in the sandbox (`nvidia-smi` absent); 2 vCPU, 3.8 GiB RAM, 21 GiB filesystem with ~20 GiB free were visible. No `ollama`, `docker`, or local endpoint was present. These are sandbox facts only, not production capacity.
- No base model, RAG-based “training”, model fine-tuning, or training-from-scratch claim is supported by this checkout's evidence.

## Changes made during this audit

1. Kept the existing architecture. Did not add agents, employee rows, migrations, new databases, or external framework dependencies.
2. Made the inference Compose model-pull step default to only `qwen2.5:1.5b-instruct` instead of automatically pulling the configured 72B/32B/7B model set. Additional IDs must be explicitly supplied using `MODEL_PULL_MODELS` after host RAM/disk review. This is a safer pull default, **not** proof that the model runs or fits production hardware.
3. Updated `docs/INFERENCE_TIERS.md` to verify only the fast starter by default and removed a fabricated-looking sample transcript as benchmark evidence.
4. Disabled implicit ZAI registration (`ZAI_SDK_ENABLED=false` by default; explicit opt-in only) in the changes included with this pending PR.
5. Added/retained focused regression tests. `git diff --check` passed. Compose YAML parsed with `js-yaml`, and its shell command passed `sh -n` after Compose's escaped-dollar expansion.

## Verification rounds

1. **Repository/code:** partial. GitHub/commit/PR/workflow metadata reviewed; focused tests executed. Full repository test suite, lint, Prisma generation, full typecheck, and production build not passed in this environment. `npm ci --ignore-scripts` succeeded; `npx prisma generate` failed fetching Prisma engines from `binaries.prisma.sh` due network restriction. Typecheck then produced missing-generated-Prisma-type diagnostics and cascades; treat as blocked, not source-pass/fail evidence.
2. **AI model:** fail/blocked. Real local probe failed (`fetch failed`, 0/1 fast tier). No latency/quality/RAM model benchmark.
3. **AI agents:** not passed. No completed actual local model task, so **0 agents verified operational in this audit**.
4. **Business integrations:** not run; no isolated integration tenant credentials/test fixtures.
5. **Production/security:** not run against production. CI main's source safety gates passed on Oct 19 but deployment secret validation failed; backup validation failed Oct 23 and actual backup was skipped. No restart/deployment/DB access/rollback/HTTPS test.

## Database recovery follow-up (2026-10-24)

This follow-up adds `deploy/scripts/inventory-data-sources.sh`, a read-only production-host discovery helper and `docs/DATABASE-RECOVERY-PROCEDURE.md`. The helper was syntax-checked and exercised only against a temporary synthetic SQLite fixture; its counts from that test fixture are not production evidence. `npm run verify:mysql` passes the repository's static checks (SQLite/MySQL Prisma model and logical field-type parity: 192/192 models, 0 parity errors; 436 indexed fields; no detected LongText index/relation collisions; 13 critical field checks). This does not validate a live MySQL schema or migration.

The workforce provisioner CLI now defaults to dry-run; writes require `--apply`, and `--apply` cannot be combined with `--verify` or `--dry-run`. `npm run provision:workforce` is preview-only; `npm run provision:workforce:apply` is the explicit mutating command. The CLI mode parser has regression coverage. This is a safeguard, not authorization to provision production rows without owner approval, backup/restore, recovery findings and reconciliation.

### Repository-wide validation snapshot (2026-10-24)

- `npm run lint`: passes with 0 errors and 1 warning for the external font stylesheet in the root app layout; the two stale ESLint-disable directives have been removed.
- `npm run check:prisma-delegates`: passes (163 referenced delegates).
- `npm run check:workflows`: 17 workflow definitions, 109 steps, 0 errors and 0 warnings after changing 27 single-word workflow triggers to more specific multi-word request phrases. This validates static definitions only; it does not prove that the updated definitions were imported into any live database or that any workflow executes end to end.
- `npm test -- --reporter=json`: 1,167 passed, 8 failed, 44 skipped. All 8 failures were isolated SQLite integration assertions blocked because the `better-sqlite3` native binding is missing. Attempted local rebuild could not fetch Node headers due TLS/ECONNRESET. No production system was involved.
- `npm run typecheck`: blocked because the generated Prisma client is absent (`.prisma/client/default` and exported `PrismaClient`/`Prisma` missing), causing cascading type errors. Prisma engine generation previously failed on TLS/network restrictions. Do not treat this as a code-clean typecheck.
- `npm run report:tiers:json` reports a checked-in workforce template (2,000 configured CSV rows), not live production agents or measured capacity. It explicitly warns that the router lacks per-tier admission control. No production hardware, model inference, authenticated AgentOS task, or live workflow execution was verified.

A focused file search of this checkout and `/home/user` found no SQLite database, SQLite backup, SQL dump, MySQL dump, or DB backup artifact (the search excluded `node_modules`). This says nothing about `/root`, remote hosts, cloud snapshots, object storage, or other operator-managed backup locations. No credential file was opened, no production connection attempted, and no database was queried.

The legacy `scripts/migrate-sqlite-to-mysql.ts` apply implementation is **unsafe for production**: it clears target tables with `DELETE`, disables foreign-key checks, clears SQL mode, skips missing target tables/columns, and does not wrap the import in a transaction. It cannot provide an idempotent, lossless, relationship-verified recovery. Its apply path is now fail-closed and throws before opening either database; the default mode remains a source-only preview. A regression test verifies the guard. This is a safety block, not a replacement migration engine; no records were migrated. `prisma/schema.mysql.prisma` and six MySQL SQL migration files exist, but a live MySQL compatibility/migration check was not run.

Health endpoints exist at `/api/health`, `/api/health/ready`, and related paths. Their live 200/readiness behavior cannot be verified without a configured database and running app. The comprehensive health response contains hardcoded subsystem/feature assertions, so its response body must not be treated as production health evidence by itself.


1. In a maintenance-approved session on the **actual model host**, report RAM, CPU, GPU/VRAM, disk free, container/cgroup memory, and whether Ollama is installed. Do not use this sandbox reading as the production host profile.
2. Provision/authorize a local inference runtime on an isolated staging host, select one commercially permitted model matching measured resources, pin its version/digest, and run `scripts/verify-inference.ts --tiers fast` (or the actual selected tier). Store raw JSON output, model digest, host metrics and repeat-run latency.
3. Restore/generated Prisma client via a permitted, reproducible CI environment; run full typecheck, lint, tests and build. Do not bypass Prisma engine download validation or fabricate client types.
4. Against a disposable staging database and synthetic tenant data, run one existing authorized agent through authenticated submission → durable queue → local inference → allowed tool → structured output/QC → persisted result and audit log. Record task/run IDs and tool events. Add fault/retry and cross-tenant denial checks.
5. Reconcile current agent and `AIEmployeeIdentity` counts using read-only production queries only after credentials/approval are available. Report configured vs provisioned vs real successful execution separately; do not equate agent rows and employee identities.
6. Build the five-agent pilot from the same measured path before enrolling more departments. Integrate CRM/English/MarketingOS only with sandbox API credentials and explicit human-approval policies.
7. For production, first create and verify a restorable database + uploaded-file + configuration backup in isolation, establish rollback, and fix GitHub production SSH secrets. Do not deploy until all gates pass.
8. Diagnose Cloudflare 502 separately with DNS, TLS, origin reachability and reverse-proxy logs using an authorized network/Cloudflare session. No such access was available here.

**Acceptance state: NOT MET.** The core blocker is not absence of agent code; it is absence of a reachable, verified local model and a database-backed real task run, compounded by unavailable production hardware/access and failed production deployment/backup preflights.
