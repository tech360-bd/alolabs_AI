# ALO Labs current architecture — evidence-based snapshot

**As of 2026-10-09 (Asia/Dhaka). Status: PARTIAL; NOT production certified.** See the 1,132-row [source inventory](ALO_LABS_COMPLETE_FILE_INVENTORY.md) and the earlier [forensic review](audit/AGENTOS_FORENSIC_AUDIT.md). This snapshot is retrospective: the earlier implementation was already underway before the file-level inventory in the current request was created.

| Layer | Existing implementation | Evidence boundary |
|---|---|---|
| Web | Next.js app/router, enterprise shell, Command Center panels; 362 API `route.ts` files, 5 `page.tsx` files (counts at inspection) | Route presence does not establish correct auth, backend or mobile UX; see API verification report. |
| Identity | Session auth, company membership, v1 company API keys and scopes in `src/lib/v1-auth.ts`/`v1.ts` | v1 session chooses first membership, not an explicit tenant selector. Legacy paths not exhaustively audited. |
| Execution | `POST /api/runs` persists AgentOSRun/RunEvent and enqueues QueueItem; `instrumentation.node.ts` polls; planner, agent selection, Task/TaskStep, existing AgentExecutionEngine/AIRouter, QC and Markdown artifact | Real unconfigured-provider failure HTTP journey observed; configured-provider success and skill/tool execution in this path NOT VERIFIED. |
| Workflow | Legacy workflow schema/builder plus new sequential runner | Parallel/conditional/loop/approval continuation incomplete. |
| Data | Prisma SQLite schema (175 models), MySQL variant, additive four-model SQL; local sandbox DB ignored by Git | MySQL migration/restore and existing production data preservation NOT VERIFIED. SQLite schema push is for sandbox only. |
| Files/knowledge | Local filesystem storage, Artifact content in DB, existing memory/RAG | New local file storage has no per-file tenant ACL metadata. Source verification and secure retrieval incomplete. |
| Operations | Docker/compose/PM2/Caddy, GitHub Actions, backup/deploy scripts; sandbox standalone smoke | No production deployment/backup restore evidence; `bun.lock` CI vs modified npm lock requires reproducibility review. |

## Observed end-to-end boundary

`authenticated HTTP → queued run → worker → heuristic plan → selected agent → real runtime/router → Configuration required → dependent steps skipped → diagnostic artifact/event → API` was observed. This demonstrates honest failure handling, **not** live successful AI execution. Development preview is not a deployment certificate.

## Critical architectural hazards

- Public aggregate health handler (`src/app/api/v1/health/route.ts`) reflects DB, queue and router state but returns raw caught exception messages and does not provide the five separate `/health/{database,queue,ai,storage}` endpoints requested. Redaction/exposure review required.
- Worker recovery is startup-only for processing jobs older than 10 minutes; automatic approval continuation and multi-replica event fanout are incomplete.
- New route contract coverage and legacy tenant isolation have not been established per endpoint.
- `deploy/scripts/backup.sh` can snapshot the DB and selected storage, but a full config/source/restore exercise for this version is not evidenced; do not infer recoverability from the script's name or manifest.
