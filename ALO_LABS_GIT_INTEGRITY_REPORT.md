# Git integrity and source preservation report

Capture: 2026-10-08T18:44:50.568550+00:00 UTC. **Historical Phase 0: NOT VERIFIED.** The repository HEAD is a usable source comparison point for the earlier pass; it does not prove preservation of a historical deployment or production data. No history was changed by this audit.

- Branch: `arena/b86c5c11-alolabs-net-ai`; HEAD: `07668db093c415d5f805aeb93b8952be5dbf9628`.
- HEAD parents: `07668db093c415d5f805aeb93b8952be5dbf9628`; reachable commits locally: 1.
- Local/remote branches: `* arena/b86c5c11-alolabs-net-ai;   main;   remotes/origin/HEAD -> origin/main;   remotes/origin/main`; tags: `none`.
- Remote: `origin` at github.com/engralaminn-collab/alolabs.net_ai (no credentials reported). Deployment/release commit provenance: NOT VERIFIED.
- HEAD paths: 1056; currently tracked: 1056; original paths missing: 0; modified tracked: 16; untracked nonignored before this report: 91; ignored paths enumerated by Git: 59934 (counts include generated caches).

## Tracked changes relative to HEAD

| Path | Status |
|---|---|
| `.env.example` | MODIFIED |
| `.gitignore` | MODIFIED |
| `README.md` | MODIFIED |
| `__tests__/unit/lib/storage.test.ts` | MODIFIED |
| `docs/SECURITY.md` | MODIFIED |
| `docs/TROUBLESHOOTING.md` | MODIFIED |
| `package-lock.json` | MODIFIED |
| `package.json` | MODIFIED |
| `prisma/schema.mysql.prisma` | MODIFIED |
| `prisma/schema.prisma` | MODIFIED |
| `src/__tests__/lib/job-queue.test.ts` | MODIFIED |
| `src/app/api/commands/route.ts` | MODIFIED |
| `src/components/enterprise/enterprise-shell.tsx` | MODIFIED |
| `src/lib/db.ts` | MODIFIED |
| `src/lib/job-queue.ts` | MODIFIED |
| `src/proxy.ts` | MODIFIED |

## New nonignored files (including this report when generated)

| Path | Status |
|---|---|
| `ALO_LABS_AGENTOS_FINAL_AUDIT.md` | UNTRACKED |
| `ALO_LABS_API_VERIFICATION.md` | UNTRACKED |
| `ALO_LABS_COMPLETE_FILE_INVENTORY.md` | UNTRACKED |
| `ALO_LABS_CURRENT_ARCHITECTURE.md` | UNTRACKED |
| `ALO_LABS_DATABASE_VERIFICATION.md` | UNTRACKED |
| `ALO_LABS_FILE_CHANGE_REPORT.md` | UNTRACKED |
| `ALO_LABS_FORENSIC_AUDIT.md` | UNTRACKED |
| `ALO_LABS_GIT_INTEGRITY_REPORT.md` | UNTRACKED |
| `ALO_LABS_MIGRATION_MAP.md` | UNTRACKED |
| `ALO_LABS_SECURITY_AUDIT.md` | UNTRACKED |
| `ALO_LABS_TARGET_ARCHITECTURE.md` | UNTRACKED |
| `ALO_LABS_VERIFIED_BASELINE.md` | UNTRACKED |
| `ALO_LABS_VERIFIED_BASELINE_DATABASE.md` | UNTRACKED |
| `ALO_LABS_VERIFIED_BASELINE_ENV.md` | UNTRACKED |
| `ALO_LABS_VERIFIED_BASELINE_FILES.txt` | UNTRACKED |
| `ALO_LABS_VERIFIED_BASELINE_HASHES.txt` | UNTRACKED |
| `ALO_LABS_VERIFIED_BASELINE_ROUTES.md` | UNTRACKED |
| `BACKUP_RECOVERY.md` | UNTRACKED |
| `__tests__/api/runs.test.ts` | UNTRACKED |
| `__tests__/helpers/fake-db.ts` | UNTRACKED |
| `__tests__/unit/agentos-artifacts.test.ts` | UNTRACKED |
| `__tests__/unit/agentos-configuration-required.test.ts` | UNTRACKED |
| `__tests__/unit/agentos-planner.test.ts` | UNTRACKED |
| `__tests__/unit/agentos-runs-pipeline.test.ts` | UNTRACKED |
| `__tests__/unit/agentos-storage-real.test.ts` | UNTRACKED |
| `__tests__/unit/agentos-v1-auth.test.ts` | UNTRACKED |
| `__tests__/unit/agentos-v1-boundaries.test.ts` | UNTRACKED |
| `__tests__/unit/agentos-workflow-engine.test.ts` | UNTRACKED |
| `audit/AGENTOS_FORENSIC_AUDIT.md` | UNTRACKED |
| `docs/ADMIN_GUIDE.md` | UNTRACKED |
| `docs/AGENTOS_GUIDE.md` | UNTRACKED |
| `docs/AGENT_BUILDER_GUIDE.md` | UNTRACKED |
| `docs/API_DOCUMENTATION.md` | UNTRACKED |
| `docs/ARCHITECTURE.md` | UNTRACKED |
| `docs/DEPLOYMENT_GUIDE.md` | UNTRACKED |
| `docs/MEMORY_GUIDE.md` | UNTRACKED |
| `docs/MODEL_ROUTER_GUIDE.md` | UNTRACKED |
| `docs/TOOL_REGISTRY_GUIDE.md` | UNTRACKED |
| `docs/WORKFLOW_GUIDE.md` | UNTRACKED |
| `prisma/migrations/mysql/20261008_agentos_foundation.sql` | UNTRACKED |
| `scripts/dev-generate-client.sh` | UNTRACKED |
| `scripts/seed-agentos.ts` | UNTRACKED |
| `scripts/sqlite-push.ts` | UNTRACKED |
| `src/app/api/artifacts/[id]/download/route.ts` | UNTRACKED |
| `src/app/api/artifacts/[id]/route.ts` | UNTRACKED |
| `src/app/api/artifacts/route.ts` | UNTRACKED |
| `src/app/api/projects/[id]/route.ts` | UNTRACKED |
| `src/app/api/projects/[id]/runs/route.ts` | UNTRACKED |
| `src/app/api/projects/route.ts` | UNTRACKED |
| `src/app/api/runs/[id]/events/route.ts` | UNTRACKED |
| `src/app/api/runs/[id]/route.ts` | UNTRACKED |
| `src/app/api/runs/route.ts` | UNTRACKED |
| `src/app/api/storage/files/[id]/route.ts` | UNTRACKED |
| `src/app/api/storage/files/route.ts` | UNTRACKED |
| `src/app/api/v1/agents/[id]/route.ts` | UNTRACKED |
| `src/app/api/v1/agents/[id]/run/route.ts` | UNTRACKED |
| `src/app/api/v1/agents/route.ts` | UNTRACKED |
| `src/app/api/v1/approvals/[id]/route.ts` | UNTRACKED |
| `src/app/api/v1/approvals/route.ts` | UNTRACKED |
| `src/app/api/v1/artifacts/[id]/route.ts` | UNTRACKED |
| `src/app/api/v1/artifacts/route.ts` | UNTRACKED |
| `src/app/api/v1/command/route.ts` | UNTRACKED |
| `src/app/api/v1/events/route.ts` | UNTRACKED |
| `src/app/api/v1/health/route.ts` | UNTRACKED |
| `src/app/api/v1/memory/route.ts` | UNTRACKED |
| `src/app/api/v1/models/route.ts` | UNTRACKED |
| `src/app/api/v1/projects/[id]/route.ts` | UNTRACKED |
| `src/app/api/v1/projects/route.ts` | UNTRACKED |
| `src/app/api/v1/runs/[id]/route.ts` | UNTRACKED |
| `src/app/api/v1/runs/route.ts` | UNTRACKED |
| `src/app/api/v1/skills/route.ts` | UNTRACKED |
| `src/app/api/v1/tasks/[id]/route.ts` | UNTRACKED |
| `src/app/api/v1/tasks/route.ts` | UNTRACKED |
| `src/app/api/v1/tools/route.ts` | UNTRACKED |
| `src/app/api/v1/workflows/[id]/run/route.ts` | UNTRACKED |
| `src/app/api/v1/workflows/route.ts` | UNTRACKED |
| `src/app/api/workflows/[id]/run/route.ts` | UNTRACKED |
| `src/components/enterprise/panels/agentos-command.tsx` | UNTRACKED |
| `src/components/enterprise/panels/agentos-runs.tsx` | UNTRACKED |
| `src/components/enterprise/panels/run-view.tsx` | UNTRACKED |
| `src/instrumentation.node.ts` | UNTRACKED |
| `src/instrumentation.ts` | UNTRACKED |
| `src/lib/artifacts/index.ts` | UNTRACKED |
| `src/lib/projects/index.ts` | UNTRACKED |
| `src/lib/qc/index.ts` | UNTRACKED |
| `src/lib/runs/index.ts` | UNTRACKED |
| `src/lib/runs/planner.ts` | UNTRACKED |
| `src/lib/storage/index.ts` | UNTRACKED |
| `src/lib/v1-auth.ts` | UNTRACKED |
| `src/lib/v1.ts` | UNTRACKED |
| `src/lib/workflow-engine/index.ts` | UNTRACKED |
| `src/types/better-sqlite3.d.ts` | UNTRACKED |

## Ignored locations (counts only; no private content)

| Top-level path | Git-listed ignored paths |
|---|---:|
| `.arena-tmp` | 16 |
| `.env` | 1 |
| `.next` | 10494 |
| `db` | 3 |
| `dev.log` | 1 |
| `next-env.d.ts` | 1 |
| `node_modules` | 49415 |
| `server.log` | 1 |
| `src` | 1 |
| `tsconfig.tsbuildinfo` | 1 |

## Preservation result

- Original HEAD paths deleted/missing: **0**; renamed/moved: NOT VERIFIED beyond Git path membership (no original path is missing).
- HEAD is the actual previous-pass code snapshot; it is **not** an independently verified pre-product deployment or production-data snapshot. Historical source preservation against deployed production: **NOT VERIFIED**.
- `git status` is dirty; no commits, merges, force pushes, rewrites or remote actions performed in this phase.
- New baseline SHA-256 hashes cover the exact 1,141 pre-repair files; [manifest](ALO_LABS_VERIFIED_BASELINE.md). Subsequent report files must be included in the final inventory, not retroactively added to the baseline.
