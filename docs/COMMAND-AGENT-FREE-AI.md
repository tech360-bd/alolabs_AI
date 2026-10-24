# Commanding Center — Your Own AI Agent on 100% Free AI

The **Commanding Center** (sidebar → *Command Center → Commanding Center (Free AI Agent)*)
gives the **Super Admin** (all companies) and each company **Admin/Owner** (own company)
a personal, tool-calling AI agent — running only on free/local models, with every call
policy-checked, budget-checked and audited by the existing AgentOS gateway.

> Honesty contract (unchanged from the rest of AgentOS): if no free/local provider is
> configured and authorised, the agent returns **Configuration required** — it never
> fakes an answer and never silently falls back to a paid route.

## What you get

| Piece | Where |
|---|---|
| Command Agent chat (tool traces, images, model/profile picker) | Commanding Center → *Command Agent* tab |
| Full free-model catalogue with get-key links + exact model ids | Commanding Center → *Free Models* tab · `src/lib/command-agent/free-catalog.ts` |
| Free services directory (embeddings, image, STT, TTS, search, data, infra) | Commanding Center → *Free Services & Tools* tab |
| Step-by-step $0 setup + fallback order | Commanding Center → *$0 Setup* tab |
| Agent API | `POST /api/command-agent/chat`, `DELETE /api/command-agent/chat?sessionId=` |
| Catalogue API (incl. **live** OpenRouter $0 count) | `GET /api/command-agent/catalog` |
| Agent loop | `src/lib/command-agent/agent.ts` (max 6 tool steps, session memory) |
| Free external tools | `src/lib/command-agent/tools.ts` |

## Tools the agent can call (11, all read-only / $0)

**Internal, tenant-scoped** (existing registry, recorded in `ToolRun`):
`search_knowledge`, `crm_lookup_contact`, `crm_pipeline_summary`, `department_directory`, `calculate`.

**External free services** (fixed allow-listed hosts, no key, model supplies only query text — no SSRF surface):
`get_weather` (Open-Meteo), `wikipedia_summary`, `web_search` (DuckDuckGo Instant Answers;
auto-upgrades to Tavily's 1,000/mo free tier when `TAVILY_API_KEY` is set),
`hackernews_top`, `generate_image` (Pollinations/FLUX), `current_time`.

Try: *"What's the weather in Tokyo, tell me about Mount Fuji, and generate a poster image of it."*

## Free providers & models (shortlist — full list in the Free Models tab)

| Provider | Free key | Best free models |
|---|---|---|
| Groq | console.groq.com/keys | `qwen/qwen3-32b`, `llama-3.3-70b-versatile`, `openai/gpt-oss-120b`, `whisper-large-v3-turbo` (STT) |
| OpenRouter `:free` | openrouter.ai/keys | `deepseek/deepseek-chat-v3-0324:free`, `qwen/qwen3-32b:free`, `deepseek/deepseek-r1:free`, `openai/gpt-oss-120b:free` |
| Google AI Studio | aistudio.google.com/apikey | `gemini-2.0-flash`, `gemini-2.5-flash` (1M ctx), `gemini-embedding-001` |
| Cerebras | cloud.cerebras.ai | `llama-3.3-70b`, `qwen-3-235b-a22b-instruct-2507` |
| GitHub Models | github.com/settings/tokens | `openai/gpt-4o-mini`, `microsoft/phi-4` |
| Cloudflare Workers AI | dash.cloudflare.com | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/baai/bge-m3` (10k neurons/day free) |
| Hugging Face | huggingface.co/settings/tokens | `Qwen/Qwen3-32B`, `BAAI/bge-m3` |
| Mistral | console.mistral.ai | `mistral-small-latest`, `codestral-latest`, `mistral-embed` |
| SambaNova · NVIDIA NIM · Zhipu GLM | sambanova.ai · build.nvidia.com · open.bigmodel.cn | Llama/Qwen/DeepSeek/GLM-Flash free lanes |
| UnoRouter `:free` | unorouter.com | any `:free`-suffixed model (AgentOS enforces $0) |
| **Ollama (local)** | ollama.com — no key | `qwen3:30b-a3b`, `qwen2.5-coder:32b`, `deepseek-r1:14b`, `nomic-embed-text` — offline & unlimited |

Recommended fallback order: **Groq → OpenRouter `:free` → Gemini (long docs) → Cerebras → Ollama local**.

## $0 setup (5 minutes)

1. Get free keys: Groq + OpenRouter (no card). Optionally Gemini + Cerebras.
2. **Super Admin AI Control Plane → AI Providers**: add each provider (kind + base URL are
   shown next to every model in the *Free Models* tab), paste the key, add the model ids
   with cost `0` and capabilities `chat` + `function-calling`.
3. Record the free-tier **verification** (official docs URL, *no automatic billing*) —
   `free_*` routing profiles only use verified-free routes.
4. Allow the provider in the company **routing policy** for `free_general` /
   `free_coding` / `free_reasoning`.
5. (Recommended) Local fallback: `ollama pull qwen3:30b-a3b && ollama pull nomic-embed-text`,
   then add kind `ollama`, base URL `http://localhost:11434/v1`.
6. Open the Commanding Center and command your agent.

Environment alternative: keys such as `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`,
`CEREBRAS_API_KEY` are detected and shown as **KEY IN ENV** (see `.env.example`), but the
Control Plane is preferred — keys are encrypted at rest and gated per company/policy.

## Access & safety

- **Who:** `super_admin` (any active company) or company `owner`/`admin` (own company only — a
  foreign `targetCompany` is refused). Others get `403`. Rate-limited per user; requests are
  audit-logged (`command_agent.chat.request` / `.clear`).
- **Data:** chat runs as *confidential* through `executeCompanyAIChat`; external tools receive
  only the arguments the model chooses (city, topic, query, image prompt).
- **No mutations:** there is deliberately no shell, SQL, write, payment or send tool. For
  multi-step objectives that produce artifacts, use **ONE COMMAND** (`/api/runs`); for
  advice-only super-admin chat, `/api/super-chat` remains available.
- **Costs:** free tiers are rate-limited and terms change — re-verify on the provider's
  official page (the Control Plane records verifications and quota snapshots). When free
  lanes are exhausted the gateway *defers* the request instead of billing.

## API example

```bash
curl -X POST "$APP_URL/api/command-agent/chat" \
  -H "Authorization: Bearer $TOKEN" -H "x-company-slug: alo-labs" \
  -H "Content-Type: application/json" \
  -d '{"message":"Weather in Dhaka + top tech news","profile":"free_general"}'
# → { success, response, provider, model, trace: [{tool,args,ok,durationMs,output}], images: [] }
```

Python equivalent of the raw pattern (outside AgentOS) is the OpenRouter snippet:
`base_url="https://openrouter.ai/api/v1"`, `model="qwen/qwen3-32b:free"`, standard
OpenAI tool-calling loop — the Command Agent implements exactly this server-side, with
AgentOS policy, tenancy and audit wrapped around it.
