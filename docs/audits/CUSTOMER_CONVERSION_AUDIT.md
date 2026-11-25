# ALO Labs — Customer Conversion Audit

> Generated: 2026-11-25 · Baseline: `main @ 689739e` (verified local clone). Evidence = source paths on this commit + merged PR commit records.

## 1. The designed journey

`Visitor → Service discovery → AgentOS platform demo → Proof (projects) → Webchat (planned) → Project enquiry → Human follow-up`

Verified building blocks on this commit:

| Stage | Verified surface | Evidence |
|---|---|---|
| Discovery | `/site/services` + `/site/solutions` (12 solutions as data in `src/lib/brand/solutions.ts`) + detail `/site/solutions/[slug]` | PR #55 commit `4fd546c` |
| AgentOS demo | `/site/platform`, `/site/platform-overview`, 3D landing (WebGL orb + CSS fallback) | PR #53/#54 commits |
| Proof | `/site/projects` — three verified case studies; unpublishable projects shown as explicit "not published, and why" rows | PR #55 |
| Enquiry | `/site/start-a-project`, `/site/request-a-solution`, `/site/book-a-consultation` → all POST `/api/public/contact` | PR #55 |
| Human follow-up | lead persisted with `source: website-contact`; honest `delivered:false` handling (no fake success) | PR #55/#57 browser-verified |

## 2. Enquiry backend (verified)

- `src/app/api/public/contact/route.ts` is the single public enquiry endpoint; form submissions are validated, persisted to the CRM table, and confirmation is server-truthed (a browser-submitted form was verified returning 200 with the lead persisted — PR #57 commit evidence `e066977`).
- `/site/contact` remains as its own route with its own entry point (labeled *Contact*), intentionally distinct from the purpose-built conversion flow (PR #55 follow-up commit `8e0d7c7` corrected header/mobile/footer links to point at `start-a-project`).

## 3. Conversion blockers found

| # | Blocker | Severity | Remediation owner |
|---|---|---|---|
| 1 | **No public webchat** — the "Webchat" stage of the journey does not exist (no widget under `src/app/site`, no `/api/public/chat`) | major | PR B scope; see `PUBLIC_WEBCHAT_AUDIT.md` |
| 2 | Dark-shell/light-mandate conflict may depress perceived premium-ness on repeated visits | major (design) | PR A scope; see `PUBLIC_WEBSITE_FULL_AUDIT.md` §3 |
| 3 | Spam protection / consent mechanics on the public contact endpoint are present but their abuse-monitoring analytics are not surfaced to an admin view | moderate | fold into PR B webchat admin config (rate limits + abuse monitoring share the same controls) |
| 4 | Webchat human-handoff path (Fin-style "Talk to a human") does not exist | major | PR B scope; consent + safe contact collection specified in webchat audit |

## 4. What is honest and must stay honest

- No fabricated success messages: `delivered:false` is surfaced truthfully (PR #55 tests).
- No invented metrics/testimonials/client counts (PR #55 honesty tests: `solutions.test.ts`, `projects.test.ts`).
- Case studies state what is not finished. Unpublished projects are rows with reasons, not silent omissions.
- The webchat, when built, must inherit this posture: answers only from approved ALO Labs public information; no invented prices, guarantees, availability, or capabilities; human handoff collects consent and a safe contact method only.

## 5. Verdict

Conversion infrastructure is real and browser-verified end-to-end for the enquiry path; the journey is missing exactly one stage (webchat) and one design decision (light/white shell). Both are scoped in the roadmap as PR A and PR B with genuine diffs required before any PR is opened.
