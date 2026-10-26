# Link coverage in the super admin dashboard

**Date:** 2026-10-26 · **Scope:** every link in the 45-item reference list sent this round (17 sites, 28 repositories — duplicates collapsed).
**Machine-verified snapshot:** [`docs/LINK_COVERAGE_VERIFIED.md`](./LINK_COVERAGE_VERIFIED.md)
**Live surface:** Super Admin → **Link Coverage** tab, and **Admin → Link Coverage** in the sidebar.

---

## 1. What was added

The request was to "check all with every file, all at the super admin dashboard". That is now a
feature, not a one-off report:

| Piece | File | Role |
|---|---|---|
| Registry | `src/lib/link-coverage/registry.ts` | One row per link: what the upstream is, the verdict, the claim, and the **repository files** that back the claim. |
| Types | `src/lib/link-coverage/types.ts` | Shared shapes; no Node imports, so it is safe in the client bundle. |
| Verifier (pure) | `src/lib/link-coverage/verify.ts` | Takes a `FileProbe`, returns a report. No `fs` import — the same code runs in the route, the CLI and the tests. |
| Filesystem probe | `src/lib/link-coverage/probe.node.ts` | Server-only `fs` implementation: existence, size, line count, SHA-256 prefix, directory walk. Rejects absolute paths and `..`. |
| API | `src/app/api/super-admin/link-coverage/route.ts` | `GET`, super-admin only, 30 s cache, `?refresh=1` to force, server-side filters. |
| Panel | `src/components/panels/link-coverage-panel.tsx` | Summary cards, per-link rows, expandable evidence with status/lines/hash, search + verdict/category filters, "Missing only", JSON export, re-check button. |
| CLI | `scripts/verify-link-coverage.ts` | `npm run verify:links` — prints the summary, exits 1 on drift, can write the markdown snapshot. |
| Wiring | `src/components/panels/super-admin-panel.tsx`, `src/components/agent-hub-shell.tsx`, `src/store/app.ts` | New tab, sidebar entry and `ViewType`. |
| Tests | `__tests__/lib/link-coverage.test.ts`, `__tests__/api/super-admin-link-coverage.test.ts`, `__tests__/components/panels/link-coverage-panel.test.tsx` | 31 tests. |

**Checked on this branch:** 45 links · 162 evidence paths · **162/162 found on disk** · 0 missing ·
929 files under `src/` and 50 under `docs/` exposed by the working-tree probe.

---

## 2. Verdict semantics

| Verdict | Meaning | Count |
|---|---|---|
| **Implemented** | Exists here and is exercised by code or tests. | 1 |
| **In-kind** | An equivalent subsystem exists here; upstream code was not copied. | 20 |
| **Reference** | Design/feature reference only. | 3 |
| **Gap** | Concrete, implementable, not implemented — the next step is named in the row. | 11 |
| **N/A** | Native app, model weights, hardware or content-only. | 10 |

A verdict is a claim that can be disproved by opening a file. The registry test fails the suite if a
claimed file disappears, and the dashboard shows a red **missing** badge instead of quietly dropping
the row.

---

## 3. Results by group

| Group | Verdict summary |
|---|---|
| Social & publishing | `buffer.com` → **in-kind** (`src/lib/social/*`, `/api/social/publish`, accounts, analytics, OAuth; no best-time queue). |
| AI & models | `openrouter.ai` → **implemented**; `cline/cline`, `cline.bot` → **in-kind** (own tool loop + agent runtime); `coder.qwen.ai` → **reference** (Qwen adapter exists, hosted IDE does not). |
| Chat & messaging | 8 CometChat/chat rows: **in-kind** for org, skills, docs-mcp, React UI kit; **N/A** for Android, iOS, React Native and the Java sample (no mobile targets here). |
| Voice, calls & SMS | `sms.domovina.ai` → **in-kind** (`/api/sms`, SMS panel); `call.md` → **in-kind** (meetings + transcription); **gap** for the four telephony rows — there is no SIP stack and no WebRTC peer connection anywhere in `src/`. |
| Education | `hi-kid`, `ChatGPT-AI-English-Tutor`, `magic-english-buddy` → **in-kind** (education hub, speaking practice); `toeicbert` → **N/A** (model weights). |
| Media & creation | `mureka.ai`, `supercool.com`, `join.supercool.com` → **in-kind** (image/video/music studios, video hub). |
| Design systems | `astryx.atmeta.com` (Meta's open-source React 19 + StyleX system, 150+ components, 7 themes, CLI + MCP) → **in-kind**; this repo runs its own shadcn/editorial system and a `/design` living spec. |
| Business operations | `larksuite.com`, `hatchable.com`, `aipraktor.com` → **in-kind**; `enerpize.com` and `refine.ink` → **gap**. |
| Monitoring & ops | `hetrixtools.com` → **in-kind** (Prometheus/Grafana/Alertmanager configs, metrics, deep health, observability dashboard). |
| Research & science | `mat3ra.com` + `platform.mat3ra.com` → **N/A** (materials simulation runtime); `molx`, `MiroFish-Offline`, `gibberlink` → **gap**. |
| Developer tooling | `AITestCaseGenerator`, `Natural-Language-to-Robot-Framework` → **gap**; `dictionary-of-ai-coding` → **reference**. |
| Reference & content | `stackoverflow.com` → **reference** (nothing vendored, no API call, no RAG ingestion). |

---

## 4. The 11 gaps, with the next step

1. **`enerpize.com`** — no ledger/journal, inventory or payroll models. Only billing plans, subscriptions, invoices and payments exist. Do not claim ERP parity.
2. **`refine.ink`** — needs a fan-out manuscript review job (N parallel critics over one document) plus a consolidated feedback artefact.
3. **`molx`** — needs fetch → clean → markdown crawling (robots, rate limits, SSRF guard) in front of `/api/rag/ingest`.
4. **`MiroFish-Offline`** — needs a population simulation loop (N personas × T rounds), a graph store and a forecast report.
5. **`gibberlink`** — agent-to-agent discovery/negotiation exists only as prose in `src/lib/enterprise-roadmap.ts`.
6. **`ai-native-callcenter`** — needs FreeSWITCH/Asterisk + SIP trunk + realtime audio bridge.
7. **`microsoft/call-center-ai`** — needs an outbound telephony provider behind `POST /api/calls` with a call record model.
8. **`awesome-phone-call-agents`** — same telephony adapter and an outbound-call job type.
9. **`AI-Powered-Call-Center-Intelligence`** — needs call transcript persistence, sentiment/key-phrase scoring, call-analytics view.
10. **`AITestCaseGenerator`** — needs a requirement → test-file job with a sandboxed run.
11. **`Natural-Language-to-Robot-Framework`** — same job type; no Robot Framework support exists (`grep -ri "robot framework" src` → 0 hits).

Two smaller in-kind gaps worth naming because they are load-bearing: **no ffmpeg/scene assembly** for
the film-making rows (`join.supercool.com`), and **no machine-readable component manifest for agents**
(the one thing that makes Astryx agent-usable).

---

## 5. Using it

```bash
npm run verify:links                     # summary, exit 1 on drift
npm run verify:links -- --json           # machine-readable
npm run verify:links -- --write docs/LINK_COVERAGE_VERIFIED.md
```

```
GET /api/super-admin/link-coverage           # super_admin session required
  ?refresh=1                                 # bypass the 30s cache
  ?verdict=gap|in_kind|implemented|reference|not_applicable
  ?category=Voice%2C%20calls%20%26%20SMS
  ?q=openrouter&onlyMissing=1&onlyGaps=1
```

The response carries `summary`, `categories`, `inventory`, `warnings` and `entries[]`; every evidence
item has `status` (`verified` / `missing` / `unverifiable`), `lines`, `bytes` and `sha256Prefix`.

---

## 6. Limits (stated, not hidden)

- **Baseline mode.** In a standalone Next.js build the source tree is absent. The route then returns
  `mode: "baseline"`, marks every path `unverifiable`, shows a banner and 0 % — it never invents a
  "verified" result. Run the check where the source tree exists (dev, CI, or `npm run verify:links`).
- **Verdicts are about capability, not quality.** "In-kind" says an equivalent subsystem exists; it
  does not say it matches the upstream product feature-for-feature. The `gap` text names what is
  missing in the in-kind rows.
- **Upstream metrics** (stars, language, archive flag) were read from the GitHub API on 2026-10-26 and
  are not refreshed automatically.
- **This sandbox could not run the app.** `better-sqlite3` has no prebuilt binary for this runtime and
  the Prisma engine download is blocked, so there is no live preview of the tab here. The panel is
  covered by 8 render tests instead; the 8 pre-existing integration test failures in this environment
  are the same native-module problem, unrelated to this change.

## 7. Verification run on this branch

```
npx vitest run __tests__/lib/link-coverage.test.ts                       17 passed
npx vitest run __tests__/api/super-admin-link-coverage.test.ts            6 passed
npx vitest run __tests__/components/panels/link-coverage-panel.test.tsx   8 passed
npx tsx scripts/verify-link-coverage.ts                                  45 links, 162/162 files, exit 0
npx tsc --noEmit | grep link-coverage                                     no errors
npx eslint <new files>                                                    clean
```
