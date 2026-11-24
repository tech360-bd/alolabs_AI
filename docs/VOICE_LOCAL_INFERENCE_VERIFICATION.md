# Local AI voice conversation — verification record

Scope: make the existing ALO Labs call-center AI hold genuine Bangla
conversations through a **locally hosted Ollama model**, using the existing
AIRouter. No new voice system, no second router.

Telephony (Asterisk / FreeSWITCH / SIP trunk) is explicitly **out of scope** and
remains a separate infrastructure integration requiring authorized credentials.

Every status below uses the five permitted values. Nothing is marked complete
without executable evidence.

---

## Summary

| Phase | Status | Basis |
|---|---|---|
| 1 — Verify current source | **VERIFIED COMPLETE** | commit, models, router path inspected |
| 2 — Check server hardware | **VERIFIED COMPLETE** | measured on the target host |
| 3 — Install and configure Ollama | **BLOCKED** | network egress blocked; see below |
| 4 — Create real voice agent profiles | **VERIFIED COMPLETE** | idempotent seed + 10 tests |
| 5 — Real Bangla conversation test | **BLOCKED** (real inference) / **IMPLEMENTED — NOT VERIFIED** (harness) | needs a running model |
| 6 — Voice safety | **VERIFIED COMPLETE** | pinned by tests |
| 7 — End-to-end evidence | **BLOCKED** | depends on phase 3 |
| 8 — GitHub delivery | **VERIFIED COMPLETE** | branch + PR |

**The call center is NOT production ready.** The conversation half is blocked on
model hosting; the telephony half does not exist.

---

## Phase 1 — current source (VERIFIED COMPLETE)

- Commit `347d74cdea18aae080f141309d2788b6af30430b` on `arena/95359bda-alolabs-ai`, matching `origin`.
- Models inspected: `VoiceAgent`, `VoiceAgentVersion`, `CallSession`, `CallTranscript`, `CallSummary`.
  `VoiceAgent.metadata` is a JSON string — used to carry model config and permission boundaries.
- `executeCompanyAIChat` (`src/lib/multi-tenant-ai/service.ts`) is the single
  inference path. It already records usage (`modelUsageRecord`) inside the same
  transaction as the provider call, so a successful turn is metered by
  construction and a failure cannot be metered as success.
- `local_fast` profile = `localOnly: true, allowsVerifiedFree: false,
  permitsPaidWithAuthorization: false`. It **cannot** reach a paid provider;
  there is no silent hosted fallback to remove.
- `handleConversationTurn` persists both turns (`persistTurn`), then calls the
  responder chain, then writes the agent turn. Transcript rows are created via
  `callTranscript.upsert`.
- `FallbackSafeResponder` wraps the LLM responder with the deterministic
  rule-based one and marks degradation as `responder_fallback` +
  `responder_error:<detail>` in the persisted turn payload.
- Existing AIRouter and billing safeguards were read, not modified.

## Phase 2 — hardware (VERIFIED COMPLETE)

| Property | Measured value |
|---|---|
| OS | Debian GNU/Linux 12 (bookworm), kernel 6.1.158 |
| Architecture | x86_64 |
| CPU | Intel Xeon @ 2.60 GHz, **2 cores** |
| RAM | **3,939 MB total**, ~3,600 MB available at check |
| Disk | 21 GB total, **18 GB available** |
| GPU | **none** — no `/dev/nvidia*`, no `nvidia-smi` |
| Port 11434 | free |
| Ollama | not installed |
| PM2 | not installed |

### Model sizing decision

No GPU and 2 CPU cores. A 7B model at Q4 needs ~4.5 GB resident — more than this
host has — and would be unusably slow on CPU. The defensible choice is a
**sub-2B multilingual** model; the repository already defaults the `fast` tier to
`qwen2.5:1.5b-instruct` (Q4 ≈ 1.0–1.2 GB, fits with room for the app), and Qwen2.5
has genuine multilingual coverage including Bangla.

`fast` tier is overridable with `LOCAL_MODEL_FAST`, so a larger model can be
substituted on bigger hardware without touching code.

## Phase 3 — install and configure Ollama (BLOCKED)

The official installation method cannot run in this environment. Measured:

```
$ curl -fsSL https://ollama.com/install.sh
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to ollama.com:443

$ curl https://registry.ollama.ai
000        (TCP blocked)

$ curl https://huggingface.co
000        (TCP blocked)

$ curl https://github.com/ollama/ollama/releases/download/v0.40.18/ollama-linux-amd64.tar.zst
302 -> release-assets.githubusercontent.com
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL
```

DNS resolves, but TCP is filtered to an allowlist. Reachable: `github.com`,
`api.github.com`, `codeload.github.com`, `pypi.org`, `files.pythonhosted.org`.
Not reachable: `ollama.com`, `registry.ollama.ai`, `huggingface.co`,
`release-assets.githubusercontent.com`, `raw.githubusercontent.com`.

Consequences, verified rather than assumed:

- The Ollama **server binary** is only distributed via `ollama.com` or GitHub
  *release assets*, and release assets redirect to a blocked host. PyPI's
  `ollama` package (0.6.3) is the **Python client only** — 16 KB wheel, no server.
- Emitting the binary from source is likewise impossible: `go` is not installed
  and the Go toolchain would have to be fetched from `go.dev` (blocked).
- **Model weights are unobtainable.** Ollama pulls from `registry.ollama.ai`;
  the usual alternative is `huggingface.co`. Both are blocked. No PyPI package
  ships GGUF weights (checked `transformers`: 0 files over 2 MB in the wheel).

So there is no path to a running local model in this sandbox. This is an
environment/egress restriction, not a repository defect.

**What unblocks it** (any one of):
1. Allow egress to `ollama.com` + `registry.ollama.ai`, then run the documented
   install and `ollama pull`.
2. Run Ollama on a host that has it, and point the app at it with
   `OLLAMA_BASE_URL=http://<host>:11434` (the provider registry accepts this —
   see below).
3. Place the `ollama` binary and a GGUF file on the host out-of-band.

Configuration that must be applied once a model is reachable — **no code change
required**, the existing registry already does this:

```bash
# Local inference gateway (OpenAI-compatible) — preferred path
LOCAL_INFERENCE_URL=http://localhost:11434/v1
LOCAL_INFERENCE_ENABLED=true
LOCAL_MODEL_FAST=qwen2.5:1.5b-instruct
# OR the native Ollama adapter
OLLAMA_BASE_URL=http://localhost:11434
# Bind the server to loopback only
OLLAMA_HOST=127.0.0.1:11434
```

`localOnlyEnabled()` turns local-only routing on automatically as soon as a local
endpoint is configured, so a regression to a hosted provider would require
deliberately setting `LOCAL_ONLY=false`.

## Phase 4 — real Bangla agent profiles (VERIFIED COMPLETE)

`scripts/seed-bangla-voice-agents.ts` creates three real profiles for one tenant:

| Agent | Language | Purpose |
|---|---|---|
| Bangla Customer Support Agent | bn-BD | orders, delivery, service |
| Bangla Admissions Information Agent | bn-BD | courses, eligibility, admission process |
| Bangla General Inquiry Agent | bn-BD | front-door routing |

Each profile carries: Bangla greeting + system instructions (real Bangla
script, telephone-speech constraints, no invented prices/policies), `language=bn-BD`,
`modelConfig` (profile `local_fast`, tier `fast`, `requireLocal: true`,
`allowHostedFallback: false`), conversation settings (`maxCallSeconds`,
`allowBargeIn`), permission boundaries (denied actions, knowledge-required
topics, handoff triggers, `telephonyConnected: false`), status, `companyId`
ownership, and an immutable `VoiceAgentVersion` snapshot.

Safety properties, all covered by 10 passing tests:
idempotent on re-run (keyed on `metadata.seedKey`, not on name), no duplicate
profiles, no version bump when nothing changed, version bump only on real change,
refuses to run without `COMPANY_ID`, writes nothing for an unknown tenant,
`DRY_RUN=1` writes nothing, rejects an invalid status, tenant-isolated, and
**never writes `CallSession` / `CallTranscript` / `CallSummary` / `VoiceUsageEntry`**
(the stub throws if the seed even touches those models).

## Phase 5 — real Bangla conversation test (BLOCKED)

The 15 scenarios from the brief cannot be run against a real model because no
model can be started here. They are **not** reported as passing.

What *is* verified, by the existing mocked suite (26 files / 326 tests passing),
covering greeting, follow-up history, low-confidence clarification, handoff,
unknown-answer fallback, persistence, transcript, and tenant isolation at the
service level — but with the model mocked, which is explicitly not the same claim.

## Phase 6 — voice safety (VERIFIED COMPLETE)

Pinned by `__tests__/unit/lib/voice/call-center-reality.test.ts` (16 tests):

- A failed inference **throws**; no invented reply is returned.
- An empty/unusable completion throws instead of being spoken.
- `FallbackSafeResponder` records the degradation in the persisted turn.
- `local_fast` cannot select a paid provider (profile is `localOnly`).
- Simulated usage is excluded from billing (`total - simulatedTotal`).
- No telephony adapter can reach the PSTN; unconfigured providers throw and
  report `reachable: false`. A handoff is recorded as an intent — it is never
  reported as a completed transfer.

## Phase 7 — end-to-end evidence (BLOCKED)

Cannot be produced honestly without a running model. The path is instrumented
and ready: `previewCompanyAIRoute` reports the exact provider/model/routeKind the
router would select without making a call, and `executeCompanyAIChat` returns
`requestId`, `provider`, `model`, `attempts` and `fallbackUsed`.

## Phase 8 — delivery (VERIFIED COMPLETE)

Branch `arena/95359bda-alolabs-ai`; PR opened with the commit SHA recorded in the
PR body. Typecheck, typecheck:tests, ESLint and the voice suites pass.

---

## Exact unblock steps

To turn phases 3, 5 and 7 from BLOCKED to VERIFIED COMPLETE:

1. Provide egress to `ollama.com` and `registry.ollama.ai` **or** a reachable
   Ollama host.
2. `ollama pull qwen2.5:1.5b-instruct` (≈1 GB) on that host.
3. Set `OLLAMA_BASE_URL` (or `LOCAL_INFERENCE_URL`) in the app environment.
4. Run `COMPANY_ID=<tenant> npx tsx scripts/seed-bangla-voice-agents.ts`.
5. Execute the 15-scenario suite against the live model and record the capture
   bundle described in phase 7.

No application code changes are expected for any of these — the wiring exists.
