# Model Router guide

The pre-existing provider-agnostic router in `src/lib/ai-router/` integrates OpenRouter, Groq, DeepSeek, Mistral, Ollama, Qwen, Llama, Phi, Gemma and Z-AI adapters (availability depends on configuration). The AgentExecutionEngine selects models and can fall back along its model chain; the new planner requests structured JSON via the router, otherwise records a labelled heuristic plan. `GET /api/v1/models` returns registry metadata and live provider health; it does **not** expose credentials.

Configure provider keys/endpoints as environment variables, never browser code or logs. No keys/Ollama are available in the sandbox. `/api/v1/health` returns `503 degraded` and **Configuration required** for the model router while database/queue checks remain live.

**Unverified:** a live provider round trip, cross-provider failover under rate-limit/timeout and accurate pricing/cost-control enforcement. Do not interpret metadata catalog entries as proof a provider is connected.
