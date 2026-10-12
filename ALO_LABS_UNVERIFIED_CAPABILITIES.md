# Unverified and incomplete capabilities — 2026-10-09

This register preserves the earlier audit's limitations. “Implemented” code, local test, real execution and production certification are separate states. Details: [`ALO_LABS_AGENTOS_FINAL_AUDIT.md`](ALO_LABS_AGENTOS_FINAL_AUDIT.md) and [`ALO_LABS_PRODUCTION_EVIDENCE_MATRIX.md`](ALO_LABS_PRODUCTION_EVIDENCE_MATRIX.md).

| Capability | Current status | Required integration/test method | Evidence now | Final status |
|---|---|---|---|---|
| Historical Phase 0 inventory | NOT VERIFIED | Cannot retroactively recreate pre-change full inventory; preserve new baseline | Baseline hashes from this phase | NOT VERIFIED |
| Production data/DB/storage backup + restore | NOT VERIFIED | Owner-approved production-consistent backup, isolated restore, row/ACL comparison | Only local SQLite backup/restore tested | NOT VERIFIED |
| Production migration/rollback/MySQL restore | NOT VERIFIED | Isolated target-version MySQL migration + fresh restore + app integration | SQL supplied; no MySQL service | NOT VERIFIED |
| Foreign-key enforcement in sandbox | FAIL | Reconcile SQLite schema/migration with 175 Prisma models; protect existing data | Local SQLite snapshot has zero FK definitions | FAIL |
| All endpoint security | NOT VERIFIED | 682 method-level negative auth/tenant/rate-limit/CSRF/audit tests | Static matrix and selected live storage tests | NOT VERIFIED |
| File tenant ACLs | PARTIAL | Ownership backfill, signed URLs, documents/knowledge/temp/S3, storage restore/role tests | Real HTTP exploit found; new local file A→B download/list/delete denied 11/11 | PARTIAL |
| Live provider execution/router fallback | CONFIGURATION REQUIRED | Protected staging keys/egress, real provider calls + fault injection | No key/endpoint configured; real failure path only | NOT VERIFIED |
| Agent→skill→tool real workflow | NOT VERIFIED | Run complete safe real-provider task with typed skill/tool and events | Stub success tests and no-provider failure path only | NOT VERIFIED |
| Queue interruption and workflow restart | NOT VERIFIED | Interrupt actual long-running job and compare durable state/no duplicate effects | Atomic claims/startup stale recovery code, no drill | NOT VERIFIED |
| Memory scope/expiration/tenant isolation | PARTIAL | Real multi-tenant store/retrieve/expire/delete and audit tests | Legacy memory code and selected v1 route tests | PARTIAL |
| RAG parse/index/retrieve/citation/source checks | PARTIAL | Known source document, tenant denied search, provenance/claim checks | Legacy RAG and stub/unit tests only | PARTIAL |
| QC→repair→human approval continuation | PARTIAL | Real provider invalid result, bounded repair, approval/reject continuation | Deterministic tests; approval decision does not auto-resume | PARTIAL |
| Browser/computer sandbox | NOT IMPLEMENTED | Isolated per-run sandbox, permission/effects audit, abuse tests | No certified browser/computer path | NOT IMPLEMENTED |
| Real PDF/DOCX/XLSX/PPTX artifact generation | NOT IMPLEMENTED in new path | Generate, inspect, checksum, authorize, version OOXML/PDF | Markdown diagnostic artifact only | NOT IMPLEMENTED |
| UI metrics and browser E2E | NOT VERIFIED | Trace each visible metric to DB/service and browser exercise desktop/mobile | Dev preview, mocked login-flow test | NOT VERIFIED |
| CI/CD + dependency safety | FAIL | Reproducible lock, dependency triage, integrated release/security gates | `npm audit --omit=dev`: 9 (5 high, 4 moderate) | FAIL |
| Production deployment | NOT VERIFIED | Staged full topology, worker/provider/DB/storage health, smoke, rollback | Only sandbox standalone boot | NOT VERIFIED |

No row can move to PASS based solely on code presence, a mock, or a passing build. This list is not exhaustive of the 130-section target specification; additional routes/integrations remain pending review.
