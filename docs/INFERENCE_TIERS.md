# Local inference: model tiers, gateway, and local-only routing

This document covers the piece of the stack that turns a *policy decision*
("this task needs executive reasoning") into a *specific model on your own
hardware*, without a commercial API in the path.

## The gap this closes

`classifyTask()` already labels every task with a tier — `reasoning`,
`balanced`, `fast`, `coding`, `vision`, `embedding`. `selectModelForTask()`
returned that tier string, and it was passed to the router as `model`. No
provider advertises a model called `reasoning`, so the exact-match branch in
`AIRouter.route()` never fired; routing fell through to "best model of whichever
provider won the load-balance draw". In practice the tier was decorative, and a
paid provider could serve a task classified as Tier 3.

Now:

1. `src/lib/ai-router/model-tiers.ts` maps every tier to a concrete model id
   (overridable per tier).
2. `providersFromEnvironment()` registers an OpenAI-compatible
   `local-gateway` provider (Ollama `/v1`, vLLM, LiteLLM, any proxy) whose
   catalogue is exactly those six ids.
3. `execution.ts` resolves the tier to a model id before calling the router, and
   the self-healing fallback walks tiers (`reasoning → balanced → fast → coding`)
   and resolves each one.
4. When a local endpoint is configured, `LOCAL_ONLY` defaults to **on** and the
   router removes non-local providers from the candidate set. If nothing local
   is available the request fails; it does not quietly bill a commercial API.

## Tier map

| Tier | Specification role | Default model | Approx. weights (Q4) | Env override |
|---|---|---|---|---|
| `reasoning` | Tier 1 — executive, counselling | `qwen2.5:72b-instruct` | ~47 GB | `LOCAL_MODEL_REASONING` |
| `balanced` | Tier 2 — departmental, CRM | `qwen2.5:32b-instruct` | ~20 GB | `LOCAL_MODEL_BALANCED` |
| `coding` | Tier 2 — software department | `qwen2.5-coder:32b-instruct` | ~20 GB | `LOCAL_MODEL_CODING` |
| `vision` | Tier 2 — documents, screenshots | `qwen2.5vl:7b` | ~6 GB | `LOCAL_MODEL_VISION` |
| `fast` | Tier 3 — classification, tagging | `qwen2.5:1.5b-instruct` | ~1.5 GB | `LOCAL_MODEL_FAST` |
| `embedding` | Tier 3 — RAG embeddings | `embeddinggemma:300m` | ~0.3 GB | `LOCAL_MODEL_EMBEDDING` |

Model ids are what the *runtime* expects. For Ollama that is `model:tag`; for
vLLM it is the `--served-model-name`. Point the env vars at whatever you
actually serve — nothing else needs to change.

### Hardware reality

- A 72B model at Q4 needs roughly 47 GB just for weights. On a 24 GB GPU it
  offloads to CPU and becomes unusable for interactive work. Use it only with
  ≥48 GB VRAM (or ≥64 GB unified memory), and only for the `reasoning` tier.
- 32B at Q4 fits a 24 GB card. 7B/1.5B run on anything.
- **Do not start 2,000 concurrent inference tasks.** Ollama serialises per
  model; concurrency beyond the number of GPU slots only grows the queue. Start
  with a handful of worker slots, measure p95 latency, then scale. The router
  has a circuit breaker but no per-model admission control yet (see gaps).

## Running it

```bash
# 1. Bring up the local stack (MySQL, Qdrant, Ollama, n8n, app)
docker compose -f docker-compose.inference.yml up -d

# 2. Pull the tier models once (large download — check free disk first)
docker compose -f docker-compose.inference.yml --profile models up model-pull

# 3. Prove the gateway actually serves every tier
docker compose -f docker-compose.inference.yml exec app npx tsx scripts/verify-inference.ts
```

`verify:inference` sends a real completion per tier and reports model id,
latency and the reply. It exits non-zero if any tier fails; it never falls back
to a paid provider.

```
OK   reasoning qwen2.5:72b-instruct         1842ms — I am qwen2.5:72b-instruct.
OK   fast      qwen2.5:1.5b-instruct          61ms — I am qwen2.5:1.5b-instruct.
6/6 tiers responding
```

Useful flags: `--tiers reasoning,fast`, `--base-url`, `--json`,
`--max-tokens`, `--timeout`.

## What the workforce actually demands

`npx tsx scripts/tier-capacity.ts` reads `docs/workforce/agents.csv` and maps
each agent's `model_policy` through the same resolver the runtime uses:

```
Agents in inventory: 2000

Tier       Model                          Agents   Weights(Gb)
reasoning  qwen2.5:72b-instruct              600       47
balanced   qwen2.5:32b-instruct              600       20
fast       qwen2.5:1.5b-instruct             500      1.5
coding     qwen2.5-coder:32b-instruct        300       20
vision     qwen2.5vl:7b                        0        6
embedding  embeddinggemma:300m                 0      0.3
```

Two things follow. The weights column is *per resident model*, not per agent —
1.5B serving 500 agents is fine; 72B serving 600 is not, if they are dispatched
at once. And with no admission control, every `reasoning` task queues behind the
same model: start with a small worker pool, measure p95 latency, and only then
raise concurrency.

## Configuration

```dotenv
LOCAL_INFERENCE_URL=http://ollama:11434/v1   # or http://vllm:8000/v1, a LiteLLM proxy, etc.
LOCAL_INFERENCE_API_KEY=                     # only if the proxy requires one
LOCAL_ONLY=true                              # refuse paid providers entirely
LOCAL_PROVIDER_NAMES=litellm,my-vllm         # extra names treated as local
LOCAL_MODEL_REASONING=qwen2.5:72b-instruct
```

`LOCAL_ONLY` resolution order:

1. `LOCAL_ONLY=true|false` — explicit wins.
2. Otherwise `true` when `LOCAL_INFERENCE_URL` or `LOCAL_INFERENCE_ENABLED` is set.
3. Otherwise `false` (existing deployments keep their providers).

Local providers are `ollama`, `openai-compatible:local-gateway`, and anything
listed in `LOCAL_PROVIDER_NAMES`.

## What is not done yet

- **vLLM is not configured as a separate provider.** It already speaks the
  OpenAI protocol, so `LOCAL_INFERENCE_URL=http://vllm:8000/v1` works unchanged.
  There is no tuned vLLM deployment (tensor parallelism, continuous batching) in
  this repository — that needs the GPU host to be measured first.
- **No per-model admission control.** Nothing prevents N workers all choosing
  `reasoning` at once. Add a semaphore per tier before scaling past a handful of
  workers.
- **No GPU scheduling or autoscaling.** One Ollama container, one device.
- **n8n workflows are not authored.** The container and `N8N_BASE_URL` exist;
  the marketing/lead-enrichment pipelines referenced in the specification are
  not built or imported.
- **Postgres migrations do not exist.** `prisma/migrations` only contains the
  MySQL set; `schema.prisma` targets SQLite. Running against Postgres needs a
  reviewed migration set first.
- **External platforms are not vendored.** Twenty, ToolJet, Firecrawl, SiYuan,
  MetaGPT, MiroFish and MoneyPrinterTurbo are referenced as integrations; none
  of their code is in this repository.
