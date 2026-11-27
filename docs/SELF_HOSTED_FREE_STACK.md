# Self-Hosted Free Stack — audited integrations

> Added: 2026-11-27 · Source audits: GitHub topic `jarvis-ai` (240 repositories,
> live REST-API fetch, licence-first verdicts — see
> `JARVIS_AI_TOPIC_SCAN_2026-11-27.md` in the audit workspace) and the standing
> zero-paid-services policy: **no card, no metered API, no vendor SDK**.
> Everything below is either free/open-source software (server licence listed)
> or a free local application, and every integration point is the audited
> OpenAI-compatible adapter or an existing engine-agnostic env contract.

## 1. What this changes

The router already had two local paths: Ollama (`OLLAMA_BASE_URL`) and the
local inference gateway (`LOCAL_INFERENCE_URL`). This change adds **seven
more self-hosted OpenAI-compatible servers** as first-class provider kinds,
with three integration surfaces each:

1. **Super Admin AI Control Plane → AI Providers** — selectable preset with a
   correct default base URL, official docs URL, no API key required
   (`src/lib/ai-provider-catalog.ts`).
2. **Environment auto-registration** — set one `*_BASE_URL` + one `*_MODELS`
   variable and the router registers the server automatically
   (`src/lib/ai-router/provider-registry.ts`,
   `SELF_HOSTED_OPENAI_COMPATIBLE_SERVERS`).
3. **Policy coherence** — the kinds are local-inference kinds, so the
   local-endpoint trust boundary (`isTrustedLocalInferenceEndpoint`), the
   FREE_ONLY_MODE paid-kind list and the API-key validation all treat them
   exactly like Ollama/llama.cpp today.

Fail-closed guarantees inherited from the existing code:

- A `*_BASE_URL` pointing at a public host is **skipped**, never registered.
- A server with no declared models is skipped (an empty catalogue routes
  nothing).
- `local: true` in a config row still requires a loopback/RFC1918/ULA endpoint.

## 2. LLM inference servers (new kinds)

| Kind | Env vars | Default endpoint | Licence (server) | Notes |
|---|---|---|---|---|
| `vllm` | `VLLM_BASE_URL`, `VLLM_MODELS` | `http://localhost:8000/v1` | Apache-2.0 | High-throughput serving; OpenAI-compatible server is documented upstream |
| `localai` | `LOCALAI_BASE_URL`, `LOCALAI_MODELS` | `http://localhost:8080/v1` | MIT | Drop-in OpenAI replacement, CPU-friendly |
| `litellm-proxy` | `LITELLM_BASE_URL`, `LITELLM_MODELS` | `http://localhost:4000/v1` | MIT | Uniform gateway over many local backends |
| `tgi` | `TGI_BASE_URL`, `TGI_MODELS` | `http://localhost:80/v1` | Apache-2.0 | Hugging Face Text Generation Inference; default container port 80 |
| `lm-studio` | `LM_STUDIO_BASE_URL`, `LM_STUDIO_MODELS` | `http://localhost:1234/v1` | Free app (proprietary) | Desktop local server; OpenAI-compatible endpoint |
| `jan` | `JAN_BASE_URL`, `JAN_MODELS` | `http://localhost:1337/v1` | AGPL-3.0 | Local server; used as a **separate service**, no code copied |
| `text-generation-webui` | `TEXT_GENERATION_WEBUI_BASE_URL`, `TEXT_GENERATION_WEBUI_MODELS` | `http://localhost:5000/v1` | Apache-2.0 | oobabooga OpenAI API extension |

Licence verdicts follow the reuse policy: AGPL-3.0 (Jan) is
**integrate, don't fork** — run it as a self-hosted service behind the API
gateway; nothing from its repository is embedded in this codebase. LM Studio is
not open source but is a free local application, so it is integrated the same
service-level way.

## 3. Already integrated (no change needed — recorded for completeness)

| Capability | Technology | Licence | Integration point |
|---|---|---|---|
| LLM (local) | Ollama | MIT | `OLLAMA_BASE_URL` → `OllamaProvider` |
| LLM (local) | llama.cpp server | MIT | `llama-cpp` kind |
| LLM (local) | Local inference gateway | — | `LOCAL_INFERENCE_URL` |
| Vector store | Qdrant | Apache-2.0 | `src/lib/qdrant.ts`, RAG engine |
| ASR (voice) | Any OpenAI-compatible speech engine (e.g. faster-whisper-server, whisper.cpp server) | MIT (whisper family) | `VOICE_ASR_PROVIDER` / `VOICE_ASR_BASE_URL` |
| TTS (voice) | Any OpenAI-compatible speech engine (e.g. Piper-compatible HTTP servers) | MIT (Piper) | `VOICE_TTS_PROVIDER` / `VOICE_TTS_BASE_URL` |
| Telephony | FreeSWITCH/Asterisk-class adapters | engine-agnostic | `src/lib/voice/telephony/` |

Voice engines were already engine-agnostic before this change; the
`jarvis-ai` audit confirmed the faster-whisper / Piper pattern used by the
top-scoring Tier-A repositories matches the existing `VOICE_*_BASE_URL`
contracts, so no code change was required there.

## 4. How to verify an integration locally

```bash
# 1. Start any server, e.g. vLLM
vllm serve Qwen/Qwen2.5-7B-Instruct          # serves :8000/v1

# 2. Point the app at it
VLLM_BASE_URL=http://localhost:8000/v1
VLLM_MODELS=Qwen/Qwen2.5-7B-Instruct

# 3. The provider registers on router sync; confirm via
#    GET /api/model-health (provider id: vllm, local: true)
```

Tests: `__tests__/unit/lib/provider-environment-defaults.test.ts`
(auto-registration incl. fail-closed cases) and
`__tests__/unit/lib/ai-provider-catalog.test.ts` (preset coherence).
