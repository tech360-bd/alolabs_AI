# Dynamic Specialist Agent Creation

Status: partial (temporary agents implemented, discovery flow planned) · 2026-11-25

## 1. What the specification asks for

A customer request such as *"build a university admission site with a student
portal, CV generator, marketing automation and social publishing"* must make the
orchestrator:

1. understand the outcome,
2. analyse the project,
3. identify required capabilities,
4. search the existing registry,
5. identify missing specialists,
6. search the skill/connector registry,
7. decide: reuse, configure, or create,
8. obtain approval where required,
9. execute, verify and record.

## 2. What exists today

| Step | Implementation | Status |
| --- | --- | --- |
| 1–3. Understand/analyse | `src/lib/command-agent/` (intent → tool loop), `src/lib/runs/planner.ts` (LLM/step plan). Project analysis requires repository access, which is missing. | Partial |
| 4–5. Registry search | `Agent` table queries, `src/lib/agent-capability-registry.ts`, `/api/agent-capabilities`, `/api/agents` | Implemented |
| 6. Skill/tool search | `Skill`/`SkillVersion`, `src/lib/agent-skills/`, `src/lib/tools/registry.ts` | Implemented (code-defined tools) |
| 7. Create a temporary specialist | `AgentFactory.createAgent()` via `POST /api/enterprise/agent-factory/create` | Implemented |
| 8. Approval | Governance catalogue + `Approval` model; the factory path is gated by governance (no approval required for a bounded temporary agent) | Partial |
| 9. Execute/verify/record | `AgentExecutionEngine`, `QualityAssessment`, `AgentGovernanceEvent`; creation audited | Partial |

### The factory as it now behaves

`src/lib/multi-agent-orchestrator/agent-factory.ts`:

- creates a persisted `Agent` row with `type: 'temporary'`;
- requires a `scope.companyId` (a second, required parameter) and stamps it on the
  row — previously the row belonged to no tenant;
- refuses a department owned by a different tenant;
- enforces a per-tenant cap (`MAX_TEMPORARY_AGENTS_PER_COMPANY = 25`);
- honours `expirationMinutes` (default 8 h, guarded maximum 24 h in the route);
- writes the agent id, tool grants and expiry to the audit trail;
- only lets the caller grant **registered tool names** as permissions.

`POST /api/enterprise/agent-factory/create` (hardened in this phase):

| Before | After |
| --- | --- |
| `requireAuth()` — any authenticated user | `requireCompanyAuth()` + owner/admin/manager via `validateAgentFactoryScope()` |
| Arbitrary `tools`, `skills`, `permissions` accepted | Tools and permission resources must exist in the tool registry |
| `companyId: null` on the created agent | Tenant-stamped; department ownership checked |
| No audit | `agent.temporary.create` audit event, failure to audit reported as an error |
| No emergency gate | Governance gate (`write.project`) — a global stop blocks creation |

Tests: `__tests__/unit/agent-factory-guard.test.ts` (9 cases).

## 3. What is still missing

1. **Gap analysis.** The orchestrator cannot yet say "no existing specialist covers
   X" with evidence. There is no capability-matching algorithm or embedding search
   over agent capabilities.
2. **Approval for persistent agents.** Only temporary agents can be created
   through the factory. Persistent/global agent creation must go through
   `AgentBuildRequest` + Super Admin approval; that path is not wired to the
   factory.
3. **Expiry enforcement.** `expiresAt` is recorded inside `runtimeProfile` JSON;
   nothing archives expired agents automatically.
4. **Project-level agents.** `Agent` has no `projectId`.
5. **Cleanup + retention policy** (`AgentProtectiveMode` exists but is unrelated).

## 4. Target flow (Phase B3 → C)

```
request → capability inventory diff (registry vs required)
        → reuse existing agent?  ── yes → assign
        → configure a temporary specialist (existing tools only) ── allowed
        → needs a new tool / connector / paid provider?
                → create Approval (bound: actionClass agent.registry.change)
                → Super Admin review
        → execute with governance + audit
        → on success, propose promotion to a reusable template (never automatic)
```

Design rules:

- A temporary agent inherits **tenant** permissions, never platform ones.
- A temporary agent can never be granted a tool the creating user cannot use.
  (Current implementation validates the tool *exists*; intersecting with the
  user's own grants is the next step and is tracked as GAP-013.)
- Promotion of a temporary agent into a reusable organisation agent requires
  explicit approval and versioning (`AgentVersion`).
- Global registry changes are `SEC-POLICY-001` / `agent.registry.change`:
  Super Admin approval, always audited.

## 5. Verification

| Test | Proves |
| --- | --- |
| `__tests__/unit/agent-factory-guard.test.ts` | Role gating, tenant boundary, tool/permission allowlist, lifetime and budget bounds |
| `__tests__/unit/governance-policy-engine.test.ts` → `policy-change-requires-super-admin` | Registry change requires Super Admin approval |
| `__tests__/unit/governance-runtime.test.ts` | Approval binding (tenant, payload, reviewer role) |

Not tested here: an end-to-end creation against a live database (needs Prisma
client generation, unavailable in this sandbox).
