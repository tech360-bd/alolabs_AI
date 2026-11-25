# ALO Labs — Super Admin AI Command Center (Architecture)

> Generated: 2026-11-25 · Baseline: `main @ 689739e`. Principle: **extend the existing verified architecture; no second AI system.**

## 1. What already exists (verified)

| Capability | Verified component |
|---|---|
| ChatGPT-style conversational backend | `src/app/api/chat/route.ts` — GET/POST/DELETE conversations via `executeCompanyAIChat`, tenant-scoped, honest failure recording |
| Super Admin conversational panel | `src/components/panels/super-commanding-chat.tsx` |
| Unified chat UI | `src/components/chat/unified-chat.tsx` |
| Natural-language command agent | `src/app/api/command-agent/` (`catalog/`, `chat/`) |
| Orchestration | `src/lib/multi-agent-orchestrator/`, `src/lib/orchestrator.ts` |
| Approval engine | `src/lib/approval-engine/`, `src/app/api/approvals/` |
| Provider/model control | `src/lib/ai-router/` (15+ providers, free-only admin, quota tracker) |
| Run records + audit | `agent-runs`, `agent-status-history`, `audit-logs` APIs, `src/lib/audit-events.ts` |
| Projects / tasks / workflow | `src/lib/workflow-engine/`, queue mini-service, 250-model schema |

## 2. Design decision

The Command Center is the **Super Admin view over these existing services**, not a parallel stack. The single conversational orchestration layer = `super-commanding-chat.tsx` (UI) + `/api/chat` + `command-agent` (routing intents) + orchestrator/workflow-engine (execution) + approval-engine (gates) + audit-events (evidence).

## 3. Target interface (light/white premium)

- **Left sidebar** (light `#F7F9FC`): New Chat · Search Conversations · Projects · Agent Teams · AI Providers · Models · Tools · Workflows · Coding Workspace · GitHub · Tasks · Approvals · Memory · Usage & Costs · Audit Logs · Settings.
- **Main chat** (`#FFFFFF` cards, navy `#00186C` headings, orange `#FC5400` accents): streaming assistant messages, markdown, code blocks, **diff previews**, file references, execution events inline, agent status chips, approval request cards, error/retry states. Dark components allowed only as small accents — never full-page dark.
- **Composer**: multiline input, attach files, project selector, agent/team selector, model/provider selector, context chips, Send, Stop.
- **Right context panel**: current project, active branch, repository, agent assignments, current task, **execution timeline (real events only)**, changed files, test status, approval state.

## 4. Intent routing (natural language → real work)

The command-agent chat maps intents to the verified subsystems:

| Example request | Route |
|---|---|
| "Inspect this repository and identify production blockers" | repo/audit tooling via command-agent → returns real findings from runs/audit-logs |
| "Build a new feature for our CRM" | coding workspace loop (§5) |
| "Fix the broken customer enquiry flow" | same loop, scoped to `/site` + `/api/public/contact` |
| "Review the latest pull request" | GitHub integration + command-agent review intent |
| "Run the complete test suite" | sandboxed test runner; results streamed as execution events |
| "Compare our system with the 20 benchmark companies" | strategy docs (`docs/strategy/*`) + gap matrix query |
| "Generate a deployment readiness report" | audit-logs + verification evidence aggregation |
| "Investigate a provider failure and recommend a safe fallback" | ai-router provider health + free-only fallback order |

**Non-negotiable:** the interface renders *actual backend execution events*. No simulated progress animations; if nothing ran, the chat says so (the honest-failure contract already in `/api/chat/route.ts`).

## 5. The coding loop (16 steps, wired to existing services)

Understand project → read authorized files → analyze architecture → plan change → create feature branch → modify in controlled workspace → lint/typecheck → tests → build → inspect errors → correct → generate diff → summarize changed files → **request approval** → create GitHub PR → monitor CI → report.

Execution rules:
- Sandbox workspace; no direct `main` push; PR-only changes.
- Every command and its exit code is an execution event (audit-events).
- Approval engine gates step 14; paid inference gates ride the same engine.
- If any step fails, the failure is surfaced truthfully with the error output; no partial-success claims.
- GitHub token lives in server env only; the chat never displays it.

## 6. Gaps to close (each is one PR-sized diff)

1. Right-rail execution timeline bound to real `agent-runs`/audit events (P1).
2. Diff preview component rendering real workspace diffs (P1).
3. Agent assignment panel wired to multi-agent-orchestrator (P1).
4. Provider/model health + usage/cost view bound to quota tracker (P2).
5. Sandboxed code workspace service (branch/commit/PR via GitHub API with approval gate) (P1).
6. Approval cards in chat surfacing `approval-engine` states (P1).

All gaps are additive components over verified subsystems — no rebuild, no data-model fork required (uses existing run/audit/approval tables).

## 7. Separation & safety

Public chat ≠ Command Center (see `docs/security/PUBLIC_ADMIN_SECURITY_BOUNDARIES.md`). The Command Center requires strong auth + admin roles server-side; approval engine cannot be bypassed by prompt; destructive ops (migrations, DNS, deletes, production deploys, paid spend) always route through approvals.
