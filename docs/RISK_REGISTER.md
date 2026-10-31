# Phase 0 security and delivery risk register

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

| ID | Severity | Evidence / uncertainty | Mitigation and exit criterion | Proposed owner / status |
|---|---|---|---|---|
| R01 | Critical | Optional permissions in tool executor; policy accepts approval reference presence | Trace every privileged caller; validate scoped durable single-use grant, deny absent permissions; negative tests | Security/core / open |
| R02 | High | In-memory worker queue and approval maps coexist with persistent paths | Canonical durable authority, transactional state transitions; restart/recovery test each path | Core / open |
| R03 | High | ToolRun audit write failures caught; no signatures in audit helper | Fail-closed privileged events, signed records and immutable checkpoints; outage/tamper tests | Security / open |
| R04 | Critical | Actual production DB/data/backups inaccessible | Read-only approved inventory, encrypted backup and isolated verified restore before any migration | DBA/owner / blocked |
| R05 | Critical | Hostile runtime containment/egress unverified | Disposable non-production sandboxes, deny egress, no secrets/socket/mounts; escape/quota/disposal tests | DevOps/security / blocked |
| R06 | High | Local adapters exist but no model tested | Actual licensed model run and resource/budget/failover benchmarks; no paid mandatory fallback | AI infrastructure / blocked |
| R07 | High | Root licenses do not cover nested dependencies/models/assets; custom/restrictive terms | SBOM/legal review; reject Rescript commercial copy, review Dify/Billion terms, block unlicensed plugins | Legal/maintainers / open |
| R08 | High | Prompt injection through repos/web/skills/memory | Treat artifacts as data; immutable policy, scoped retrieval and malicious fixture tests | Security/QA / open |
| R09 | High | Company/global memory mapping, project provenance not proven | Mandatory project scope, provenance/confidence verification and cross-project negative tests | Memory/QA / open |
| R10 | High | Static auth helper references not endpoint behavior; bypass parameters unanalysed | Method-level auth/tenant/CSRF/rate-limit tests including ping/health exceptions | API security / open |
| R11 | High | Health registered-provider/healthy-RAG fallbacks may overstate readiness | Split configured/reachable/verified; freshness and real probes, fail honestly | Core/UI / open |
| R12 | High | WhatsApp/SMS/email/social side effects and privacy/cost | Official Meta requirements, consent, signatures, deduplication, suppression, approved bounded sends | Communications / planned |
| R13 | Medium | Websites blocked, 2 repositories 404, redirects missing | Preserve unresolved entries; exact owner links/permitted evidence, no guessing | Research/owner / blocked |
| R14 | High | Root package/lockfile consistency, native dependencies and advisories not freshly validated | Approved frozen install/SBOM/advisory/typecheck/test/build in clean CI | QA/DevOps / blocked |
| R15 | High | Agent templates/default concurrency/model tiers not measured capacity | Small pilot, per-tier admission control, measured usage and quotas | AI/core / open |
| R16 | High | Production environment reviewer enforcement not inspected | Verify actual protected environment, deployment artifact approval and absence of bypass credentials | Owner/DevOps / blocked |
| R17 | Medium | Mutable upstream branches and limited source samples | Pin commits, review true execution paths and nested manifests before adoption | Integration maintainers / open |
| R18 | Medium | Audit redaction key names do not guarantee nested/value secret removal | Data minimization and deep redaction; seeded-secret log tests | Security / open |

Severity reflects potential impact, not a demonstrated exploit. Proposed owners are roles, not assigned personnel. No risks were silently resolved or waived. Owner approval of design does not waive production gates.
