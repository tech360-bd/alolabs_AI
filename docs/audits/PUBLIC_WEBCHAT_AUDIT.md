# ALO Labs — Public Webchat Audit

> Generated: 2026-11-25 · Baseline: `main @ 689739e`. This audit establishes the verified current state and the complete security/UX requirements for the public webchat, so that its implementation (PR B) is a single well-defined diff.

## 1. Verified current state: NOT PRESENT

Evidence of absence on this commit:
- `src/app/api/public/` contains **only `contact/`** — there is no public chat route.
- `grep -rl chat src/app/site` returns no chat widget/component.
- No public-facing chat UI component exists outside authenticated dashboard/portal surfaces.

Conclusion: the public webchat is a **new build**, to be added on top of existing verified infrastructure — not a modification of it.

## 2. Infrastructure it must reuse (verified to exist)

| Requirement | Reuse (verified path) |
|---|---|
| Inference gateway (no new router) | `src/lib/multi-tenant-ai/service.ts` (`executeCompanyAIChat`) or a company-scoped public variant |
| Model routing / free-first | `src/lib/ai-router/` (free-only-mode, provider-registry, model-tiers) |
| Rate limiting | `src/lib/security/rate-limiter.ts` (`checkEndpointLimit` — already used by `/api/chat`) |
| Conversation persistence | `Conversation` / `ConversationMessage` models (tenant-scoped in-query, proven pattern in `/api/chat/route.ts`) |
| Audit | `src/lib/audit-events.ts` |
| Honest failure | failed-turn recording pattern from `/api/chat/route.ts` header contract |

## 3. Architecture decision (recommended for PR B)

**New route family:** `src/app/api/public/chat/` (POST turn, GET history by opaque public session id, DELETE forget-me). **No Super Admin or dashboard API is exposed to it.** A dedicated public chat service module (e.g. `src/lib/public-chat/service.ts`) wraps the AI gateway with:
- customer-safe system prompt (from approved ALO Labs public information + verified service documentation only);
- tool access: **none** by default (no file tools, no repo tools, no memory-write);
- tenant/`companyId` fixed to the ALO Labs marketing company internally; visitors can never pass a company id;
- strict response schema; streaming as in the authenticated chat.

**UI:** floating launcher on `/site/*` pages — white panel, ALO branding, orange `#FC5400` / blue `#00309C` accents, welcome message, typing indicator, message bubbles, suggested questions (Explore AgentOS · AI Agent Development · Custom Software · Business Automation · Request a Consultation · Talk to a Human), conversation history, mobile full-screen mode, keyboard accessible, `prefers-reduced-motion` respected. No dark panel.

## 4. Security and privacy requirements (non-negotiable)

1. Public route family only: rate-limited (per-IP and per-session), abuse protection, schema-validated input.
2. System prompt + server-side allowlist: the chat answers from approved public knowledge; it must not reveal internal project memory, other customers' data, provider API keys, or Super Admin capabilities. Verified pattern to copy: tenant-scoped in-query conversation access (never trust a passed id).
3. No internal memory writes from public sessions; public sessions use a separate conversation namespace flagged `origin: public-webchat`.
4. Errors returned honestly; retry guidance; no fabricated answers — if grounding is insufficient, offer human handoff.
5. Human handoff: collect explicit consent + a safe contact method, create a lead via the existing `/api/public/contact` pipeline (`source: public-webchat`), never expose internal operator identities.
6. Secrets: providers stay server-side; visitor responses never include provider names beyond "ALO Labs AI"; no API keys in any client payload.
7. Logging: only permitted operational metadata (timestamps, token counts, status); message content retention configurable and documented.
8. Consent notice + privacy policy link inside the chat panel; delete-my-conversation control.

## 5. Admin configuration area (authorized only)

Server-side authorized admin settings (dashboard, NOT public): enable/disable webchat; welcome message; approved knowledge sources; approved model/provider (free-first; paid requires explicit approval per the free-only posture); usage + rate limits; conversation retention; human-handoff target; analytics/feedback; abuse monitoring. A hidden URL or button is **not** authorization — reuse `requireCompanyAuth` + admin role checks (verified in `src/lib/api-auth.ts`).

## 6. Acceptance tests for PR B (must be real)

1. Visitor opens chat → welcome + suggested questions render; keyboard navigable.
2. Approved question answered from grounded content; **no** tool calls recorded.
3. Attempted prompt to expose internal project memory returns refusal + handoff path (verified by test).
4. Unauthenticated POST cannot access or create conversations outside the public namespace (cross-tenant probe returns error; verified by test).
5. Rate limit trips with honest 429 messaging; retry guidance shown.
6. Human handoff creates a lead (`source: public-webchat`) and displays consent-based confirmation.
7. Failed inference turn is recorded `failed` and surfaced with retry — no fabricated answer.
8. Admin toggle off → launcher hidden server-side (not just client-hidden).
9. Full suite + typecheck + lint + build exit 0; new routes covered by unit tests.
