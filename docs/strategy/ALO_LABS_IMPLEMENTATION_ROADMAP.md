# ALO Labs — Implementation Roadmap (20-Company Benchmark Integration)

> Generated: 2026-11-25 · Baseline: `main @ 689739e` (merge of PR #57). All prior work (PRs #42–#57) is preserved; every phase below is additive. No direct `main` pushes; PRs only, with genuine diffs.

## Guiding rules

1. Audit first, build second. Every PR names the verified gap it closes (see `ALO_LABS_FEATURE_GAP_MATRIX.md`).
2. Existing working code is preserved: AI router, multi-tenant gateway, approval engine, audit events, workflow engine, 250-model schema, conversion routes, SEO chrome.
3. Light/white premium design system on public + command-center surfaces (tokens: `#FFFFFF`/`#F7F9FC` backgrounds, `#FC5400` orange, `#00309C` blue, `#00186C` navy, `#172033`/`#667085` text). This supersedes the dark-shell regression test, which is updated in the same PR.
4. Real evidence only: typecheck/lint/test/build exit 0 in every PR; no fabricated execution, screenshots, metrics or testimonials.
5. FREE-first: paid inference requires explicit approval (verified free-only-mode enforcement stays in force).

## Phase plan (logical PRs)

### PR A — Public website: light/white premium conversion (P1)
- Convert `/site/*` shell from `.ag-*` dark system to the light system (header, footer, shells, hero, cards) keeping logo, 3D Orb (WebGL + CSS fallback), copy, nav, SEO, JSON-LD.
- Update `public-design-consistency` regression test to pin the light system.
- Responsive/keyboard/reduced-motion verification at 390/768/1024/1440/1920 in a real browser.
- Closes gap-matrix design finding; affects zero backend routes.

### PR B — Public customer webchat (P1, highest revenue impact)
- `src/lib/public-chat/service.ts` + `src/app/api/public/chat/` (GET/POST/DELETE) wrapping the existing gateway; approved-knowledge system prompt; no tools; per-IP/per-session rate limits; public conversation namespace (`origin: public-webchat`).
- Floating launcher + white panel on `/site/*` (welcome message, typing indicator, history, suggested questions, mobile full-screen, keyboard accessible).
- Admin config (dashboard, auth'd): enable/disable, welcome message, knowledge sources, model (free-first), limits, retention, handoff target, analytics, abuse monitoring.
- Human handoff → consent + safe contact → `/api/public/contact` lead (`source: public-webchat`).
- The 9 acceptance tests in `docs/audits/PUBLIC_WEBCHAT_AUDIT.md` §6, all real.

### PR C — Super Admin Command Center completion (P1)
- Right-rail execution timeline bound to real `agent-runs`/audit events; diff preview; agent assignment panel (orchestrator); approval cards (`approval-engine`); provider/model health + usage (quota tracker).
- Light-mode layout per `docs/architecture/SUPER_ADMIN_AI_COMMAND_CENTER.md`.
- No simulated progress: events-only rendering.

### PR D — Coding execution end-to-end (P1)
- Sandboxed workspace service: branch → edit → lint → typecheck → tests → build → diff → approval → GitHub PR → CI monitor → report (16 steps).
- Checkpoint/rollback before file modifications; approval gate before PR; every command an execution event with exit code.
- GitHub token server-side only; CI status rendered honestly.

### PR E — Benchmark integrations, only where justified (P2/P3)
- Handoff-as-tool primitive (orchestrator) + guardrail pipeline with pre-inference tripwires (OpenAI/Anthropic-adopted).
- MCP server exposing ALO Labs tools (after a dedicated security spec) — Zapier/Glean-adopted concept.
- Permission-aware retrieval hardening within company knowledge (Glean-adopted) — P2.
- Evaluation harness + quality scoring loop (LangSmith/AWS-adopted) — P3.
- Visual workflow canvas (n8n-adopted concept; **no n8n `.ee` code**) — P3.

## Sequencing & deps

`A` and `B` are independent → parallelizable. `C` depends on nothing external; `D` builds on `C`'s timeline/panel components. `E` follows the P1s. Each PR: branch → implement → typecheck/lint/test/build exit 0 → PR (no empty PRs) → review → merge by owner.

## Definition of success (traceable)

1. Premium white public site (PR A) · 2. Orange/blue brand consistency (PR A) · 3. Consistent public pages (PR A, regression-pinned) · 4. Real conversion (verified today + PR B) · 5. Working public webchat (PR B) · 6. Separate authenticated Super Admin dashboard (verified today) · 7. ChatGPT-style command center (PR C) · 8. Connected to real infrastructure (no second system — verified) · 9. Multi-agent planning/execution (orchestrator verified; UI in PR C) · 10. Real coding/test/PR workflows (PR D) · 11. Approvals + security controls (approval engine verified; gates in PR C/D) · 12. Honest claims/screenshots (regression-tested) · 13. Verified tests and behavior (exit-0 evidence in every PR).

## Open items requiring owner action

- Design decision sign-off for PR A (light conversion of the dark pages).
- Live TLS/CDN/DNS verification session (no infra changes without authorization).
- GitHub App write authorization for this repository (this audit ran read-only; the deliverables branch + patch are ready locally).
- Production deployment remains owner-approved only (per standing non-negotiables).
