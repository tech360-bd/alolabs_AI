# Awesome AI Agents → ALO Labs integration audit

- **Prepared:** 2026-10-24 (Asia/Dhaka)
- **External source:** [`slavakurilyak/awesome-ai-agents`](https://github.com/slavakurilyak/awesome-ai-agents)
- **Inspected commit:** `a32e86f60db8dd9556218403532264e0794822c4` (shallow clone, local audit)

**Catalog snapshot:** `awesome-agents.json`, 305 entries / 36 declared categories. Its repository license is MIT; that license does not grant rights to the separately listed projects.

## Decision

Do not import an agent framework wholesale or launch 305 third-party agents. The source is an editorial discovery catalog, not an SDK, compatible manifest format, security review, or executable agent fleet. Reuse the existing ALO runtime and selectively adopt patterns behind its permissioned execution boundary. The first implementation in this branch adds authenticated capability discovery at `GET /api/agent-capabilities` and a curated in-repository manifest in `src/lib/agent-capability-registry.ts`. It does **not** install or execute third-party code.

## What was verified in the checkout

| Area | Evidence in source/docs | Conclusion |
|---|---|---|
| AgentOS execution | `src/lib/agent-runtime/execution.ts`, `tool-loop.ts`, `pipeline.ts`; runtime has tenant-aware execution, bounded tool loops and permission checks | Code exists; do not infer a successful real-provider task from presence. |
| Multi-agent workflows | `src/lib/multi-agent-orchestrator/orchestrator.ts` and `src/lib/workflow-engine` | Orchestration code exists; all continuation/approval/parallel paths have not been proven operational. |
| Model providers | `src/lib/ai-router/*-provider.ts`, router and provider registry | Adapters exist. Provider credentials/endpoints are not present in this checkout's evidence; live model success is not verified. |
| Agent/employee scale | Prisma `Agent`, `AIEmployeeIdentity`; workforce provisioning and verification scripts; prior evidence docs | Configured/provisioned record counts are not execution evidence. This task did not connect to production or count live DB rows. |
| Permissions and task queue | `src/lib/tools`, agent runtime and queue/execution code | Permission enforcement is implemented in code; tenant boundary, retry/idempotency and real tool effects need focused end-to-end verification. |
| Learning/evolution | `src/lib/agent-learning`, `agent-evolution-engine.ts`, evolution/proposal models | Proposals and learning code exist; safe isolated evaluation/deployment approval loop is not verified as a whole. |
| Production | Existing evidence in `ALO_LABS_CURRENT_ARCHITECTURE.md`, `ALO_LABS_UNVERIFIED_CAPABILITIES.md`, `ALO_LABS_PRODUCTION_EVIDENCE_MATRIX.md` | Not certified. User explicitly reports missing standalone build files and a stale process working directory. Production process, DB, build and deployment were not touched. No backup or rollback was executed, so none is represented as verified. |
| Available test tooling | `package.json` defines Vitest, integration and E2E tests | Latest checkout run: 1,167 tests passed, 8 SQLite integration tests failed because the `better-sqlite3` native binding could not be built (Node headers unavailable over TLS), and 44 tests were skipped. See `ALO_LABS_REAL_RUNTIME_AUDIT_2026-10-24.md` for validation limits. |

The repository's previous evidence reports classify live provider success, complete agent→tool workflows, production backup/restore and production deployment as unverified/configuration required. This audit preserves that boundary; it did not independently connect to production.

## Catalog capability comparison

Catalog category totals (multi-category entries count once per category): AI agents 103; development frameworks 89; safety 27; long-term memory 25; tool/function calling 28 combined; MCP servers 21; observability 14; evaluation 13; local inference 10; web browsing 7; structured outputs 6; flow engineering 5. The JSON snapshot does **not** provide dedicated categories for CRM, education, marketing, or document-processing agents. An entry's category or popularity is not evidence of safety, license compatibility, maintenance or suitability.

| Requested domain | Catalog leads/patterns | ALO comparison and decision |
|---|---|---|
| Orchestration | Development frameworks, agent teams and workflow-oriented projects | ALO already has a multi-agent orchestrator and workflow engine. Reuse; evaluate behavior and durable recovery before replacing anything. |
| Coding | Coding/terminal agents and tool-use projects | ALO tool loop is bounded and permissioned; avoid exposing shell or repository mutation to general-purpose agents. No third-party coding agent enabled. |
| Research | Research agents (e.g. GPT Researcher listing) | ALO has routing/retrieval building blocks; source provenance and citation checking are not fully verified. Candidate pattern, not adopted dependency. |
| Browser automation | `Web Browsing Frameworks` (7; e.g. browser-use, Steel Browser) | No certified isolated browser execution path found. Do not enable until sandboxing, domain allowlists, secrets isolation and effect auditing are tested. |
| RAG and memory | Long-Term Memory (25), retrieval-oriented projects | Existing memory/RAG pipeline exists but tenant isolation, source validation, retention and citations remain partial. Improve existing pipeline rather than add parallel memory stores. |
| Document processing | No clear dedicated category in the inspected category list | No verified end-to-end PDF/DOCX/XLSX/PPTX processing/generation capability established by this audit. Integrate a parser only after format, malware, PII and tenant-boundary tests. |
| Marketing | Agent projects may be tagged only as generic agents | No verified MarketingOS connector established. Public publishing requires explicit human approval. |
| CRM / education | Generic agent entries only; no dedicated catalog taxonomy | No verified authenticated tenant-scoped CRM, English exam or learning portal connector established. Student/visa/payment decisions must remain human-approved. |
| Evaluation | Evaluation frameworks (13), observability frameworks (14) | ALO has evaluation/health code and audit events, but no production benchmark baseline verified. Use a repeatable held-out eval suite; do not publish scores without runs and sample sizes. |
| Model/local inference | Local Inference category (10) | ALO has Ollama and other adapters in source. No available local endpoint, model hardware profile, throughput or quality benchmark was verified. Self-hosted preference is not evidence of zero cost or parity. |
| Safety and standards | Safety (27), MCP (21), standards (11) | These are candidates for protocol/adversarial testing. MCP should be treated as an untrusted tool boundary with explicit allowlists, not blanket access. |

### Third-party due diligence boundary

The catalog snapshot identifies projects and repository URLs, but its MIT license is only for the catalog itself. This audit did not clone, inspect, build, threat-model, dependency-scan, or benchmark each linked project. Therefore **no listed project is approved for production adoption**. Before choosing one: pin a commit; inspect source and transitive dependencies; verify that project's license and notices; check release/maintenance history and security advisories; assess network/data flows, runtime and hardware; then build an isolated adapter and run tenant, permission, prompt-injection, availability, and license checks. Popularity/stars are not a security signal.

## Capability registry added

`GET /api/agent-capabilities` requires an existing valid Bearer session token and supports `category`, `status` and `search` filters. The response returns curated manifests for capabilities already present or explicitly unverified. Status values are source-based (`integrated`, `partial`, `not_verified`), not live health. Evaluation scores are `null` until measured. The endpoint does not instantiate external agents or execute tools. Manifests identify categories, implementation pointers, permission concepts, an execution contract, approval requirement and evidence caveat.

This is a safe first registry slice, not yet a durable per-agent registry: it does not persist versions, run health probes, dynamically discover agent records or write audit events. Those require a schema/migration plan and tenant-authorized lifecycle endpoint. Existing `Agent`, `AgentInstance`, `AgentCatalogItem`, `AgentHealthCheck`, `AgentEvaluation`, `AgentGovernanceEvent` and execution models should be reused after their relationships and operational semantics are validated; avoid duplicate agent tables.

## Follow-up hardening in this branch

The historical ZAI adapter was automatically registered unless `ZAI_SDK_ENABLED=false`, despite its implicit credential/billing behavior. Registration now requires the explicit `ZAI_SDK_ENABLED=true` opt-in, and `.env.example` defaults it to false with a billing/privacy warning. Provider-default unit tests assert that neither hosted ZAI nor a local gateway is invented when the environment configures neither. This only removes that implicit hosted dependency; it does not certify every database provider configuration, every direct router caller, or actual local inference. Paid usage remains guarded by the existing `approved_paid` profile, Super Admin policy endpoint, company/provider permissions, positive budget, and auto-billing-disabled controls.


- No production process restart, file replacement, database connection, migration, or deployment was performed.
- No production backup was possible or attempted; no rollback artifact was generated. A production-safe follow-up must first capture an owner-approved, checksummed backup of database, storage, configuration and current release, restore it to an isolated environment, and test rollback there. Never treat a source-code snapshot as a data backup.
- Follow-up isolated environment inventory: 2 vCPU, 3.8 GiB RAM, 21 GiB disk (about 20 GiB free), no `nvidia-smi`, and no `ollama` binary. These are sandbox resources, not a measurement of the production server. No local inference endpoint/model was verified, so real model execution and latency/quality/resource benchmarks remain blocked.
- `npm ci --ignore-scripts --no-audit --no-fund` installed packages. Vitest passed: the capability registry tests (3), provider environment defaults (2), existing multi-tenant policy/model-tier/router/runtime/employee-policy tests (48), and compatible-provider/catalog tests (16). These are unit or mocked provider tests, not live inference.
- Prisma client generation and full TypeScript typecheck could not complete because Prisma's engine checksum fetch from `binaries.prisma.sh` failed due network access restrictions. The resulting typecheck had widespread missing generated Prisma types; it does not establish a code regression and is not a successful typecheck.
- No full integration/security/performance/browser E2E tests were run, and no staging provider credentials or safe business-system test tenants were available. No benchmark results and no production status change are claimed.

## Next gated work

1. Install dependencies reproducibly from the repository's authoritative lockfile and run baseline tests/typecheck without touching production.
2. Add unit and API auth/filter tests for capability discovery.
3. Choose one integration (e.g. an isolated browser adapter or research capability) and complete source/license/security/hardware review before adding it.
4. Exercise an authenticated tenant-scoped safe task against staging with a configured provider; collect execution id, tool audit, structured output, retries, failure injection and latency/token metrics.
5. Build evals for education/CRM/marketing actions, with explicit approval gates and no private-student-data training.
6. Obtain production backup/restore and rollback evidence in isolation before any deployment proposal. Production remains untouched and uncertified.
