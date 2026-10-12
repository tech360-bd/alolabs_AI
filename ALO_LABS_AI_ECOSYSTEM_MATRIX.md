# AgentOS AI ecosystem evidence matrix — 2026-10-09

**Overall: CONFIGURATION REQUIRED / NOT VERIFIED for live execution.** The ten provider adapter source files below are present and exported. Their presence is **not** a tested model contract. The current `getRouter()` lazily registers ZAI by default; other adapters need explicit registration/configuration and end-to-end testing. The local environment has no usable model credential/endpoint; no provider-backed success was produced. Never treat a stub model result as live evidence.

| Provider adapter | Model/capability evidence | Router/fallback | Structured output/tool calling | Embedding/rerank/vision/audio/image/video | Agent/skill/tool/workflow → memory/RAG/QC/repair/approval/artifact | Status |
|---|---|---|---|---|---|---|
| Ollama | `src/lib/ai-router/ollama-provider.ts`, no local endpoint | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |
| OpenRouter | `src/lib/ai-router/openrouter-provider.ts`, no key | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |
| ZAI | `src/lib/ai-router/zai-provider.ts`, lazy default, no valid config | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |
| Groq | `src/lib/ai-router/groq-provider.ts`, no key | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |
| DeepSeek | `src/lib/ai-router/deepseek-provider.ts`, no key | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |
| Mistral | `src/lib/ai-router/mistral-provider.ts`, no key | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |
| Qwen | `src/lib/ai-router/qwen-provider.ts`, no key | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |
| Llama | `src/lib/ai-router/llama-provider.ts`, no endpoint/key verified | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |
| Phi | `src/lib/ai-router/phi-provider.ts`, no endpoint/key verified | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |
| Gemma | `src/lib/ai-router/gemma-provider.ts`, no endpoint/key verified | Code only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | CONFIGURATION REQUIRED |

No documented model context window, cost, version, streaming/tool capability or fallback is promoted to VERIFIED without real provider execution. Image/video/speech/embedding and reranking integrations require separate provider contracts and tests. See [model router gate](ALO_LABS_MODEL_ROUTER_TEST.md), [unverified capabilities](ALO_LABS_UNVERIFIED_CAPABILITIES.md), and [production evidence matrix](ALO_LABS_PRODUCTION_EVIDENCE_MATRIX.md).
