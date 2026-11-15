# Free AI Provider Comparison

**Date:** 2026-11-15

> **Read this first.** Every figure below is either (a) a *default assumption*
> hard-coded in this repository that a human operator must verify, or (b) an
> explicitly unknown value. **Nothing in this table is a live-verified quota.**
> The sandbox used for this audit had no outbound access to any AI provider, so
> no provider was queried. The platform's own policy engine reflects this: a
> provider is only treated as free after a human records an
> `AIProviderVerification` row with `freeTierEligibility = verified_free`, an
> official docs URL, `commercialUse = allowed`, `billingBehavior =
> no_automatic_billing`, and a verification date within 30 days
> (`src/lib/multi-tenant-ai/policy.ts` → `isFreeTierVerified`).

## 1. Registration status in this repository

| Provider | Router id | Registered by | Env var(s) | Adapter |
|---|---|---|---|---|
| Local gateway (Ollama / vLLM / llama.cpp) | `openai-compatible:local` | `providersFromEnvironment` | `LOCAL_INFERENCE_URL` | `OpenAICompatibleProvider` |
| Ollama native | `ollama` | `providersFromEnvironment` | `OLLAMA_BASE_URL` / `OLLAMA_HOST` | `OllamaProvider` |
| Groq | `groq` | `providersFromEnvironment` | `GROQ_API_KEY` | `GroqProvider` |
| OpenRouter free lanes | `openrouter-free` | `AIProviderConfig` row | `OPENROUTER_API_KEY` | `OpenRouterProvider` (strict $0 gate) |
| UnoRouter free lanes | `unorouter-free` | `AIProviderConfig` row | `UNOROUTER_API_KEY` | `UnoRouterProvider` (`:free` suffix required) |
| Gemini | `openai-compatible:gemini` | **`free-provider-specs.ts` (new)** | `GEMINI_API_KEY` | `OpenAICompatibleProvider` |
| Cerebras | `openai-compatible:cerebras` | **new** | `CEREBRAS_API_KEY` | `OpenAICompatibleProvider` |
| Cloudflare Workers AI | `openai-compatible:cloudflare-workers-ai` | **new** | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | `OpenAICompatibleProvider` |
| SambaNova | `openai-compatible:sambanova` | **new** | `SAMBANOVA_API_KEY` | `OpenAICompatibleProvider` |
| NVIDIA NIM | `openai-compatible:nvidia` | **new** | `NVIDIA_API_KEY` | `OpenAICompatibleProvider` |
| Hugging Face | `openai-compatible:huggingface` | **new** | `HF_TOKEN` | `OpenAICompatibleProvider` |
| GitHub Models | `openai-compatible:github-models` | **new** | `GITHUB_MODELS_TOKEN` | `OpenAICompatibleProvider` |
| DeepSeek | `deepseek` | `providersFromEnvironment` | `DEEPSEEK_API_KEY` | `DeepSeekProvider` |
| Mistral | `mistral` | `providersFromEnvironment` | `MISTRAL_API_KEY` | `MistralProvider` |
| Qwen / DashScope | `qwen` | `providersFromEnvironment` | `QWEN_API_KEY` | `QwenProvider` |

Before this branch, the seven bolded providers were documented in `.env.example`
and `src/lib/command-agent/free-catalog.ts` but **never registered** — filling in
the key produced no provider. That gap is now closed.

## 2. Free-tier assumptions (defaults in code, NOT verified)

Source of the defaults: `src/lib/ai-router/free-tier-quota-tracker.ts`
(`DEFAULT_QUOTAS`). These are conservative request caps used for local
bookkeeping, not authoritative provider limits.

| Provider | Default cap in code | Period | Pricing gate in code | Card required | Commercial use | Data retention |
|---|---|---|---|---|---|---|
| Ollama / local gateway | unlimited (`0`) | — | $0 (self-hosted) | no | n/a | stays on host |
| Groq | 10,000 requests | daily | none (quota-based) | **unknown** | **unknown** | **unknown** |
| OpenRouter :free | 200 | daily | **strict $0 both directions** | **unknown** | **unknown** | **unknown** |
| UnoRouter :free | 500 | daily | **strict $0 + `:free` id suffix** | **unknown** | **unknown** | **unknown** |
| Gemini | (300 in `command-agent`) | daily | none (quota-based) | **unknown** | **unknown** | **unknown** |
| Cerebras | 5,000 | daily | none | **unknown** | **unknown** | **unknown** |
| Cloudflare Workers AI | 10,000 neurons | daily | none | **unknown** | **unknown** | **unknown** |
| Hugging Face | 1,000 | daily | none | **unknown** | **unknown** | **unknown** |
| GitHub Models | 50 | daily | none | **unknown** | **unknown** | **unknown** |
| SambaNova | 500 (`default`) | daily | none | **unknown** | **unknown** | **unknown** |
| NVIDIA NIM | 500 (`default`) | daily | none | **unknown** | **unknown** | **unknown** |
| DeepSeek | 1,000 | monthly | none | **unknown** | **unknown** | **unknown** |
| Mistral | 1,000 | monthly | none | **unknown** | **unknown** | **unknown** |
| Qwen | 200 | monthly | none | **unknown** | **unknown** | **unknown** |

**"unknown" means the repository does not record it and the audit could not
reach the provider's documentation.** The master prompt forbids using expired
free-tier information or describing a paid trial as permanent free usage, so
these are left blank rather than filled in from memory.

## 3. Tool-calling support (declared in curated catalogues)

From `src/lib/command-agent/free-catalog.ts` and `free-provider-specs.ts`
capability lists. Declared ≠ verified against the live API.

| Provider | Declared function-calling models | Declared vision | Declared embeddings |
|---|---|---|---|
| Groq | `llama-3.3-70b-versatile`, `qwen/qwen3-32b`, `openai/gpt-oss-*`, `llama-4-scout` | `llama-4-scout` | no |
| OpenRouter :free | many (`qwen3-32b:free`, `gpt-oss-120b:free`, …) | `gemini-2.0-flash-exp:free`, `llama-4-scout:free` | no |
| Gemini | `gemini-2.5-flash*`, `gemini-2.0-flash` | yes | `gemini-embedding-001` |
| Cerebras | `llama-3.3-70b`, `qwen-3-32b` | no | no |
| Cloudflare | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/qwen/qwen3-30b-a3b-fp8` | no | `@cf/baai/bge-m3` |
| SambaNova | `Meta-Llama-3.3-70B-Instruct` | no | no |
| NVIDIA NIM | `meta/llama-3.3-70b-instruct`, `qwen/qwen3-235b-a22b` | no | no |
| Hugging Face | `Qwen/Qwen3-32B`, `Meta-Llama-3.3-70B-Instruct` | no | `BAAI/bge-m3` |
| GitHub Models | `openai/gpt-4o-mini` | `openai/gpt-4o-mini` | no |

## 4. How to make a provider actually eligible

A provider being *registered* is not the same as being *eligible*. To route
traffic to it under `free_general`, a Super Admin must:

1. Create (or confirm) the `AIProviderConfig` row and enable it.
2. Grant the company a `CompanyModelPermission` for the specific model.
3. Record `CompanySettings.externalDataProcessingApproved` (and
   `confidentialDataExternalAllowed` if confidential data may leave).
4. Record an `AIProviderVerification` row:
   `freeTierEligibility=verified_free`, `officialDocsUrl=<https official page>`,
   `commercialUse=allowed`, `billingBehavior=no_automatic_billing`,
   `verifiedModels=[...]`, `verifiedAt=now`.
5. Capture a `ProviderQuotaSnapshot` with
   `quotaKind=provider_reported_remaining` — it must be ≤60 minutes old.

Failing any step, the candidate is rejected with a specific reason
(`provider_free_status_unknown`, `provider_verification_stale_or_incomplete`,
`provider_quota_unknown`, `external_data_processing_not_authorized`, …) and the
request is deferred rather than sent to a paid provider.

## 5. Recommended verification order (for an operator with network access)

1. **Local first.** `ollama pull qwen2.5:1.5b-instruct`, then
   `npx tsx scripts/verify-inference.ts`. This is the only $0 option that needs
   no third-party terms.
2. **One keyed free provider.** Add `GROQ_API_KEY` or `GEMINI_API_KEY` and record
   the verification row. Both are quota-based, not price-based — never label them
   "unlimited".
3. **Aggregator free lanes.** OpenRouter `:free` / UnoRouter `:free` enforce $0 by
   construction in this codebase, so they are the safest external additions.
4. Re-run the weekly discovery job (`npm run verify:model-discovery`) weekly and
   review `docs/discovery/*.json` for model retirement and licence changes.
