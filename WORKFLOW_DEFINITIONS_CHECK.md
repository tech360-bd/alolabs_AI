# Workflow definitions — audit, canonicalisation and import

**Date:** 2026-10-17 · **Scope:** 18 uploaded JSON files (17 workflow definitions + `workflows_registry.json`)

**Verdict: all 17 definitions are now canonical and importable.** Every department exists in the
100-department registry, every step agent exists in the 2,000-agent workforce, every step carries an
instruction, and an idempotent importer is committed. Before this pass, 0 of 101 agents and 12 of 14
departments resolved and 0 of 109 steps had instructions.

---

## 1. Current check result

```
$ npm run check:workflows
Definitions checked: 17
Steps: 109
Unique agents referenced: 40 (resolved to canonical workforce: 40)
Departments: 11 referenced, 17/17 exact matches
Seeded workflow collisions: 111 seed definitions compared
Summary: 17 definitions, 0 error(s), 27 warning(s)
```

| Check | Before | Now |
|---|---|---|
| JSON parses | 18/18 | 18/18 |
| Required fields / ID and slug formats / contiguous steps | pass | pass |
| Registry ↔ definitions (id, name, slug, count) | pass | pass |
| Name/slug collision with the 111 shipped seed workflows | 0 | 0 |
| Departments resolving to the canonical registry | 2 / 14 names | **11 / 11 names, 17 / 17 definitions** |
| Step agents resolving to the 2,000-agent workforce | 0 / 101 | **40 / 40 unique, 109 / 109 occurrences** |
| Steps with `config.instruction` | 0 / 109 | **109 / 109** |
| Shared triggers between two workflows | 2 | **0** |
| Over-broad single-word triggers | 27 | 27 (kept deliberately) |
| Checker errors | 2 | **0** |

The 27 remaining warnings are single-word triggers such as `deploy`, `video`, `seo` and `audit`.
They are meaningful keywords for the businesses the workflows serve; removing them would make the
workflows harder to invoke. The routing risk they carry is handled in code (see §4).

---

## 2. What changed in the definitions

`scripts/canonicalize-workflow-definitions.mjs` rewrites each definition deterministically:

| Original department | Canonical department |
|---|---|
| Study & Academic AI | Learning & Development |
| Server Automation | DevOps |
| Executive CEO Control | Executive Office |
| Digital Marketing Strategy | Digital Marketing |
| Educational Agency Operations | Student Counseling |
| Image AI Studio / Song & Music AI / Video Production AI | Content Marketing |
| Project Management | Operations |
| Proposal & Contract Factory | Sales |
| AI Website Builder, Web Clone & Scraper | Software Development |
| WhatsApp Business | WhatsApp Operations |
| Software Development, SEO | unchanged (already canonical) |

Agents are rewritten to the workforce naming contract `<Department> <Role> Agent`, choosing the role
from the step action (research → Research, plan/design → Strategic Planning, build/write → Execution,
QA/verify/copyright → Quality Assurance, deploy/setup → Process Automation, collect → Data Analyst,
report/KPI → Reporting, track/assign → Task Coordinator, and so on).

Each step now looks like:

```json
{
  "step": 1,
  "agent": "Learning & Development Strategic Planning Agent",
  "action": "design_course",
  "config": {
    "instruction": "Design the course: modules, learning outcomes, prerequisites and assessment plan.",
    "agentHint": "Course Designer Agent",
    "original": { "department": "Study & Academic AI", "agent": "Course Designer Agent" }
  }
}
```

`config.instruction` is the text the workflow engine actually executes; `agentHint` and `original`
preserve the uploaded intent for traceability. The pass is idempotent — re-running it changes nothing.

Trigger repair from the earlier pass is retained: `build crm` lives only on CRM SaaS Builder and
`build app` only on AI Website/App Builder.

---

## 3. Importing

```bash
npm run import:workflows                    # dry-run (default) — prints create/update/unchanged per slug
npm run import:workflows -- --apply         # write
npm run import:workflows -- --apply --company alo-labs
```

`scripts/import-workflow-definitions.ts`:

- refuses to run if any step references an unknown department/agent or lacks an instruction;
- upserts by `Workflow.slug` — existing workflows are updated, steps replaced only when the
  definition differs;
- writes `stepNumber`, `action`, `agentId` (the canonical agent name) and `config` (JSON string);
- grants `WorkflowPermission` (`accessLevel: execute`) to the target company;
- never deletes a workflow that is absent from the definitions directory.

The importer was syntax-checked and its validation logic mirrors the checker, but it was **not**
executed: this checkout has no `node_modules`/generated Prisma Client and no database. That limit is
stated rather than papered over.

---

## 4. Routing fix that makes these triggers safe

`src/app/api/commands/route.ts` used to take the first workflow returned by an unordered query and
the first trigger that appeared as a substring. "study abroad" could therefore run Academic AI
instead of Education Agency depending on row order.

Routing now goes through `src/lib/command-routing.ts`:

- case-insensitive substring match, empty triggers ignored;
- **longest matching trigger wins** (`study abroad` beats `study`, `build crm` beats nothing else
  because the duplicate was removed);
- ties break on workflow name, so results are stable;
- malformed `triggers` JSON is treated as an empty list.

8 unit tests cover ordering independence, tie-breaking, case handling, empty/malformed triggers and
the CRM/SaaS pair.

---

## 5. Verification performed

| Check | How | Result |
|---|---|---|
| Definition structure, keys, step order | `npm run check:workflows` | 0 errors |
| Department and agent resolution | same checker against `registry.ts` + `docs/workforce/agents.csv` | 40/40 agents, 17/17 departments |
| Registry consistency | checker | 17/17 ids, names, slugs, count |
| Routing behaviour | `__tests__/unit/lib/command-routing.test.ts` via vitest 4.1.10 | 8/8 pass |
| Dump/backup tests added in the same session | `__tests__/unit/lib/backup-dump.test.ts` | 13/13 pass |
| TypeScript syntax of every new/changed file | esbuild 0.28.2 transform | pass |
| Importer | esbuild transform only | not executed (no DB) |

---

## 6. Remaining work

1. **Run the importer against a real database** (`npm run import:workflows -- --apply`) and then
   `POST /api/workflows/:id/run` for at least one definition to produce execution evidence.
2. **Provider credentials** are still required for execution; the workflow engine fails honestly when
   no model provider is configured.
3. **Parallelism/conditional branching** remain unimplemented in the workflow engine (documented in
   `docs/WORKFLOW_GUIDE.md`); these definitions are strictly sequential.
