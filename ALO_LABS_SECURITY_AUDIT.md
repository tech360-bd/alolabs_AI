# AgentOS security audit — 2026-10-09

**Follow-up:** The file-authorization FAIL below was reproduced with two real tenants on an isolated standalone server (A downloaded, listed and deleted B's file). A subsequent bounded repair added persisted local ownership metadata and membership checks; 11/11 real HTTP retests passed. The original finding is retained as historical evidence; current *local file-route* boundary is PARTIAL, not full storage certification. Legacy files lack metadata and are intentionally denied until ownership is reconciled; other document/knowledge/S3 and production storage boundaries remain NOT VERIFIED. See [`ALO_LABS_FILE_TENANT_ACL_TEST.md`](ALO_LABS_FILE_TENANT_ACL_TEST.md).

**Status: PARTIAL; NOT a penetration test. Production gate: BLOCKED.**

| Boundary | Evidence | Gap / required verification | Status |
|---|---|---|---|
| Authentication | Existing session auth; new v1 hashed API keys with scopes and expiration; selected v1 tests and a read-only-key smoke | Independently review all legacy endpoints, key rotation, rate limits and session controls | PARTIAL |
| Tenant context | v1 session picks the user's **first** company membership (`src/lib/v1-auth.ts`); selected v1 routes filter company | Explicit tenant selection and per-resource/legacy cross-tenant tests required | PARTIAL |
| File authorization | `src/lib/storage/local-storage.ts` path traversal tested | New local storage lacks per-file tenant/owner ACL metadata; do not expose private uploads cross-tenant | FAIL |
| Public health | `src/app/api/v1/health/route.ts` returns caught DB/queue/router exception messages in public JSON | Redact operational details; provide separate, appropriate readiness probes with restricted diagnostics | PARTIAL |
| Side effects | Approval records decision; agent/admin separation in design | Approval resumption and deny-before-side-effect proof missing | PARTIAL |
| External content | Legacy runtime has output controls | Prompt/document/tool injection, SSRF, citations and source trust boundaries need adversarial tests | NOT VERIFIED |
| Browser/computer | No certified sandbox in new execution path | Isolation, network policy, per-action audit/cancel and abuse tests required before enabling | NOT IMPLEMENTED |
| Dependency supply chain | Prior `npm audit --omit=dev` found **9 production findings (5 high, 4 moderate)** | Triage advisories with compatible upgrades and rerun CI audit | FAIL |
| Deployment/restore | Existing backup/deploy scripts and Actions | Production restore drill, secrets encryption/rotation, worker isolation and full CI release gate missing | NOT VERIFIED |

No secret values were inventoried. `.env` and local DB files are intentionally excluded from published reports. Existing legacy security guides are historical documentation, not independent proof. Remediation must start with the per-file ACL and tenant authorization boundaries; do not certify vulnerable or untested endpoints by virtue of a working UI.
