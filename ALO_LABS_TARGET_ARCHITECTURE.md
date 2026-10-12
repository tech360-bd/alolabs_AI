# ALO Labs target architecture — specification, not deployed functionality

**Status: NOT IMPLEMENTED in full.** This is a target and verification contract; it is not a claim of production readiness.

```text
Authenticated tenant-scoped Command/API
  → validated objective and project budget
  → durable command/run/outbox transaction
  → versioned planner and typed dependency graph
  → policy-based agent/skill/model/tool selection
  → isolated, permission-checked task execution with verified handoffs
  → provider adapters and bounded fallback
  → approved side-effect tools in sandboxed environments
  → scoped memory + retrieved, cited, verified evidence
  → deterministic/schema/factual QC → bounded repair → human review
  → resumable workflow and verified OOXML/PDF/CSV/JSON artifacts
  → encrypted, tenant-authorized object storage
  → persisted events/audits/usage/traces and independently running workers
  → accessible live Command Center and customer result
```

## Required boundaries before release

1. **Identity:** explicit tenant selection and least privilege on every route, row, file and worker action; no agent-admin inheritance.
2. **Execution:** typed skill/tool contracts; real provider and external-source tests with captured non-secret evidence; injection-resistant trust boundaries. Absent configuration returns Configuration required.
3. **Durability:** transactional enqueue/outbox, leases/heartbeats, idempotency, retries/cancellation/dead letter, restart and multi-worker failure injection.
4. **Workflow:** versioned sequential/parallel/conditional/loop/approval/compensation with deterministic resume and step ledger.
5. **Security:** sandboxed browser/computer/code execution; per-file tenant ACLs; outbound SSRF protection; side-effect approvals; redacted logs/health; retention.
6. **Operations:** tested MySQL staging migration and rollback, verified encrypted database+storage+config backup/restore, production-grade dependency/CI gate and separate worker health.
7. **Proof:** live configured-provider user→artifact test, negative cross-tenant tests, browser E2E, security review and recovery drill. A green build alone never closes these gates.

No production-labeled ZIP or deploy should be generated before the final gate passes. The existing project and data models are to be evolved additively; see [migration map](ALO_LABS_MIGRATION_MAP.md).
