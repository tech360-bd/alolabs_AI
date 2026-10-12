# ALO Labs AIOS — AI System Guide

> **Version:** 0.2.0  
> **Last Updated:** 2025  
> **Audience:** Developers and AI/ML engineers

---

## Table of Contents

1. [Supported AI Providers](#1-supported-ai-providers)
2. [Supported Model Families](#2-supported-model-families)
3. [AI Routing System](#3-ai-routing-system)
4. [Load Balancing Strategies](#4-load-balancing-strategies)
5. [Failover Configuration](#5-failover-configuration)
6. [Token Budget Management](#6-token-budget-management)
7. [Usage Analytics](#7-usage-analytics)
8. [Local LLM Setup (Ollama)](#8-local-llm-setup-ollama)
9. [Multi-Provider Configuration](#9-multi-provider-configuration)
10. [Model Selection Guide](#10-model-selection-guide)
11. [RAG System Overview](#11-rag-system-overview)

---

## 1. Supported AI Providers

The AI system supports four provider types, defined in `src/lib/ai-router/types.ts`:

| Provider | Type | Cost Model | Use Case |
|---|---|---|---|
| **zai-sdk** | Cloud (Z-AI SDK) | Varies | Primary AI provider via `z-ai-web-dev-sdk` |
| **ollama** | Self-hosted | Free (compute) | Local LLM inference |
| **openrouter** | Cloud (multi-model) | Pay-per-token | Access to 100+ models |
| **openai-compatible** | Any | Varies | Any OpenAI-compatible API |

### Provider Type Definition

```typescript
type AIProvider = 'ollama' | 'openrouter' | 'zai-sdk' | 'openai-compatible';
```

### Provider Configuration

| Provider | Env Variable | Description |
|---|---|---|
| **Ollama** | `OLLAMA_BASE_URL` | Base URL (default: `http://localhost:11434`) |
| **OpenRouter** | `OPENROUTER_API_KEY` | API key from openrouter.ai |
| **Z-AI SDK** | Built into `z-ai-web-dev-sdk` package | Configured via SDK |
| **OpenAI-compatible** | Custom endpoint per model | Any compatible API |

---

## 2. Supported Model Families

### Model Family Types

```typescript
type AIModelFamily = 'glm' | 'qwen' | 'deepseek' | 'llama' | 'gemma' | 'phi' | 'mistral' | 'custom';
```

### Model Family Reference

| Family | Provider | Models | Best For | Context Length |
|---|---|---|---|---|
| **DeepSeek** | Ollama, OpenRouter | deepseek-v3, deepseek-r1, deepseek-coder | Code, reasoning, analysis | 32K–64K |
| **GLM** | Z-AI SDK | glm-4, glm-4v | Chinese NLP, multimodal | 128K |
| **Qwen** | Ollama, OpenRouter | qwen2.5, qwen2.5-coder | Code, multilingual | 32K–128K |
| **Llama** | Ollama, OpenRouter | llama3.1, llama3.2, llama3.3 | General purpose | 8K–128K |
| **Gemma** | Ollama, OpenRouter | gemma2, gemma2-2b | Lightweight, efficient | 4K–8K |
| **Phi** | Ollama, OpenRouter | phi-3, phi-3.5-mini | Small, fast, edge deployment | 4K–16K |
| **Mistral** | Ollama, OpenRouter | mistral, mixtral, codestral | European languages, code | 8K–32K |

### Default Models (Built-In)

The system includes three pre-configured default models (from `src/app/api/llm/route/route.ts`):

| Model ID | Name | Provider | Cost/1K Tokens | Max Context | Streaming |
|---|---|---|---|---|---|
| `deepseek-v3` | DeepSeek V3 | local | 0 | 64,000 | Yes |
| `deepseek-r1` | DeepSeek R1 | local | 0 | 64,000 | No |
| `deepseek-coder` | DeepSeek Coder | local | 0 | 32,000 | Yes |

### Model Capabilities

```typescript
type AICapability =
  | 'chat' | 'streaming' | 'function-calling' | 'vision'
  | 'json-mode' | 'embedding' | 'code-generation';
```

| Capability | Description | Example Models |
|---|---|---|
| `chat` | Text conversation | All models |
| `streaming` | Server-sent events streaming | DeepSeek V3, Llama 3.1 |
| `function-calling` | Tool use and function calling | GLM-4, Qwen 2.5 |
| `vision` | Image understanding | GLM-4V, Llama 3.2 Vision |
| `json-mode` | Structured JSON output | GLM-4, Mistral |
| `embedding` | Vector embeddings | text-embedding-3-small |
| `code-generation` | Code synthesis | DeepSeek Coder, Codestral |

---

## 3. AI Routing System

### Route Request

```typescript
interface RouteRequest {
  task: string;           // Task description
  input?: string;         // Input content
  contextSize?: number;   // Estimated context size
  preferCost?: boolean;   // Prefer cheaper models
  quality?: 'low' | 'medium' | 'high';  // Quality preference
}
```

### Routing Decision

```typescript
interface AIRouteDecision {
  provider: AIProvider;
  model: string;
  reason: AIRouteReason;  // 'cost' | 'speed' | 'quality' | 'fallback'
}
```

### Routing Reasons

| Reason | Description | When Used |
|---|---|---|
| `cost` | Selected for lowest cost | `preferCost: true` in request |
| `speed` | Selected for fastest response | Low-quality requests, simple tasks |
| `quality` | Selected for best quality | `quality: 'high'` in request |
| `fallback` | Fallback after primary failure | Circuit breaker open, provider down |

### Task Type Detection

The router automatically detects task types using regex patterns:

| Task Type | Pattern Examples | Default Model Preference |
|---|---|---|
| `code_generation` | "write a function", "debug", "implement" | DeepSeek Coder |
| `analysis` | "analyze", "review", "evaluate" | DeepSeek R1 |
| `creative` | "write a story", "brainstorm" | DeepSeek V3 |
| `conversation` | "hello", "chat", "help me" | DeepSeek V3 |
| `data_processing` | "parse", "transform", "convert" | DeepSeek V3 |

### Quality Scoring

```typescript
const QUALITY_MODEL_SCORES: Record<string, Record<string, number>> = {
  high: { 'deepseek-r1': 3, 'deepseek-v3': 2, 'deepseek-coder': 1 },
  medium: { 'deepseek-v3': 3, 'deepseek-r1': 2, 'deepseek-coder': 2 },
  low: { 'deepseek-coder': 3, 'deepseek-v3': 2, 'deepseek-r1': 1 },
}
```

### Routing API

```bash
POST /api/llm/route
Authorization: Bearer <token>
Content-Type: application/json

{
  "task": "Write a TypeScript function to parse CSV files",
  "quality": "high",
  "contextSize": 5000
}
```

Response:

```json
{
  "model": "deepseek-coder",
  "provider": "local",
  "reason": "quality",
  "estimatedCost": 0,
  "estimatedLatency": 1500
}
```

---

## 4. Load Balancing Strategies

### Strategy Types

```typescript
type AILoadBalanceStrategy = 'round-robin' | 'least-connections' | 'random' | 'weighted';
```

### Strategy Descriptions

| Strategy | Description | Best For |
|---|---|---|
| `round-robin` | Sequential rotation through providers | Equal-cost providers |
| `least-connections` | Route to provider with fewest active requests | High-traffic scenarios |
| `random` | Random provider selection | Simple load distribution |
| `weighted` | Weighted random based on configured weights | Mixed-cost/faster providers |

### Configuration

```typescript
interface AILoadBalanceConfig {
  strategy: AILoadBalanceStrategy;
  weights?: Map<AIProvider, number>;
}
```

Example weighted configuration:

```typescript
const config: AILoadBalanceConfig = {
  strategy: 'weighted',
  weights: new Map([
    ['ollama', 60],      // 60% traffic to local
    ['openrouter', 30],  // 30% to OpenRouter
    ['zai-sdk', 10],     // 10% to Z-AI SDK
  ]),
}
```

---

## 5. Failover Configuration

### Circuit Breaker Pattern

The AI router implements a circuit breaker for each provider:

```typescript
interface AIProviderHealth {
  provider: AIProvider;
  isHealthy: boolean;
  latencyMs: number;
  errorRate: number;
  lastCheck: Date;
  consecutiveFailures: number;
  circuitOpen: boolean;
  circuitOpenUntil?: Date;  // When the circuit will half-open
}
```

### Circuit Breaker States

```
CLOSED ──(consecutive failures > threshold)──→ OPEN
   ↑                                          │
   │                                   (timeout expires)
   └──────────────────────────────────────────┘
                                           │
                                      HALF-OPEN
                                      (test request)
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                           CLOSED              OPEN
                        (request succeeds)   (request fails)
```

### Provider Health Monitoring

Monitor provider health via:

```bash
GET /api/llm/models
Authorization: Bearer <token>
```

Each model includes health status information. When a provider's circuit is open, the router automatically falls back to the next best provider.

### Error Handling

| Error Type | Class | Retryable | HTTP Status |
|---|---|---|---|
| Provider unavailable | `AIProviderUnavailableError` | Yes | 503 |
| Model not found | `AIModelNotFoundError` | No | 404 |
| Circuit breaker open | `AICircuitOpenError` | Yes | 503 |
| General AI error | `AIRouterError` | Configurable | Varies |

---

## 6. Token Budget Management

### Budget System

Implemented in `src/lib/token-guard.ts`:

```typescript
interface TokenBudgetCheck {
  allowed: boolean;
  reason?: string;
  monthlyUsed: number;
  monthlyBudget: number;
  dailyUsed: number;
  dailyBudget: number;
}
```

### How Budgets Work

1. Each company can have a `TokenBudget` record with daily and monthly limits
2. Before each AI request, `checkTokenBudget()` is called
3. If the budget would be exceeded, the request is blocked
4. When usage exceeds the warning threshold, an `Alert` is created

### Budget Check API

```bash
POST /api/token-budget
Authorization: Bearer <token>
Content-Type: application/json

{
  "companyId": "company_id",
  "estimatedTokens": 5000
}
```

Response:

```json
{
  "allowed": true,
  "monthlyUsed": 450000,
  "monthlyBudget": 5000000,
  "dailyUsed": 12000,
  "dailyBudget": 100000
}
```

### Token Usage Recording

After each AI request, usage is recorded:

```typescript
await recordTokenUsage(companyId, tokens, {
  agentId: 'agent_id',
  taskId: 'task_id',
  model: 'deepseek-v3',
  promptTokens: 1200,
  completionTokens: 800,
  costEstimate: 0,
});
```

---

## 7. Usage Analytics

### Metrics Collected

The `metrics-collector.ts` module tracks:

| Metric | Type | Description |
|---|---|---|
| `agent_hub_agents_total` | Gauge | Number of active agents |
| `agent_hub_companies_total` | Gauge | Number of companies |
| `agent_hub_token_usage_daily` | Counter | Tokens used today |
| `agent_hub_tasks_total` | Gauge | Tasks by status |

### Token Usage Tracking

Token usage is recorded per-request in the `TokenUsage` table:

| Field | Description |
|---|---|
| `companyId` | Company that consumed tokens |
| `agentId` | Agent that made the request |
| `taskId` | Associated task |
| `model` | Model used |
| `promptTokens` | Input tokens |
| `completionTokens` | Output tokens |
| `totalTokens` | Sum of prompt + completion |
| `costEstimate` | Estimated cost in USD |

### Usage API

```bash
GET /api/usage
Authorization: Bearer <token>
```

---

## 8. Local LLM Setup (Ollama)

### Install Ollama

```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS
brew install ollama

# Start the Ollama service
ollama serve
```

### Pull Models

```bash
# DeepSeek models (recommended defaults)
ollama pull deepseek-r1:latest
ollama pull deepseek-coder-v2:latest

# Other popular models
ollama pull llama3.1:8b
ollama pull qwen2.5-coder:7b
ollama pull phi3.5:3.8b
ollama pull gemma2:9b
ollama pull mistral:7b
```

### Configure Ollama in ALO Labs AIOS

```env
# In .env
OLLAMA_BASE_URL="http://localhost:11434"
```

### Verify Ollama Connection

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# List available models
ollama list
```

### Resource Requirements

| Model | RAM Required | Disk | Recommended |
|---|---|---|---|
| `deepseek-r1:latest` (14B) | ~10 GB | ~9 GB | 16 GB RAM |
| `deepseek-coder-v2:latest` (7B) | ~5 GB | ~4.5 GB | 8 GB RAM |
| `llama3.1:8b` | ~5 GB | ~4.7 GB | 8 GB RAM |
| `qwen2.5-coder:7b` | ~5 GB | ~4.4 GB | 8 GB RAM |
| `phi3.5:3.8b` | ~3 GB | ~2.3 GB | 4 GB RAM |
| `gemma2:9b` | ~6 GB | ~5.5 GB | 8 GB RAM |

### Performance Tips

```bash
# Run Ollama with GPU acceleration
OLLAMA_ORIGINS="*" ollama serve

# Set number of parallel requests
OLLAMA_NUM_PARALLEL=4 ollama serve

# Set keep-alive time for loaded models (5 minutes)
OLLAMA_KEEP_ALIVE=5m ollama serve
```

---

## 9. Multi-Provider Configuration

### Adding a Custom Model

Models can be added dynamically via the Settings table. The key format is `model:{model_id}`:

```bash
POST /api/models
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": "gpt-4o",
  "name": "GPT-4o",
  "provider": "openai-compatible",
  "costPer1kTokens": 0.005,
  "maxContext": 128000,
  "supportsStreaming": true,
  "capabilities": ["chat", "streaming", "function-calling", "vision", "json-mode"],
  "status": "active",
  "endpoint": "https://api.openai.com/v1"
}
```

### Multi-Provider Example

Configure three providers for resilience:

```env
# Local (free, fast)
OLLAMA_BASE_URL="http://localhost:11434"

# OpenRouter (wide model selection)
OPENROUTER_API_KEY="sk-or-v1-xxxxx"

# Z-AI SDK (integrated)
# Uses z-ai-web-dev-sdk package (already installed)
```

With this setup, the router can:
1. Use **Ollama** for routine tasks (free, fast)
2. Use **OpenRouter** for specialized models (GPT-4, Claude, etc.)
3. Use **Z-AI SDK** as the primary cloud provider
4. **Fall back** automatically if any provider fails

### Streaming Configuration

All streaming goes through the SSE endpoint:

```bash
POST /api/llm/stream
Authorization: Bearer <token>
Content-Type: application/json

{
  "model": "deepseek-v3",
  "messages": [
    { "role": "user", "content": "Explain quantum computing" }
  ],
  "stream": true
}
```

---

## 10. Model Selection Guide

### Decision Matrix

| Scenario | Recommended Model | Reason |
|---|---|---|
| **Code generation** | DeepSeek Coder | Optimized for code |
| **Complex reasoning** | DeepSeek R1 | Chain-of-thought reasoning |
| **General conversation** | DeepSeek V3 | Best balance of speed/quality |
| **Multilingual** | Qwen 2.5 | Strong multilingual support |
| **Edge/low-resource** | Phi 3.5 | Runs on 4 GB RAM |
| **European languages** | Mistral | Optimized for EU languages |
| **Low-cost batch** | Gemma 2 | Efficient, small footprint |
| **Creative writing** | DeepSeek V3 | Good at creative tasks |
| **Vision/multimodal** | GLM-4V (via Z-AI SDK) | Native vision support |
| **Structured output** | GLM-4 (via Z-AI SDK) | Strong JSON mode |

### Cost Optimization

| Priority | Strategy |
|---|---|
| **Minimize cost** | Use Ollama (free) for all tasks |
| **Balance cost/quality** | Use Ollama for routine, OpenRouter for complex |
| **Maximum quality** | Use GLM-4 or GPT-4 via OpenRouter/Z-AI SDK |

---

## 11. RAG System Overview

### Architecture

```
┌──────────┐     ┌──────────────┐     ┌───────────┐
│ Document  │────>│ RAG Engine   │────>│  Qdrant   │
│ Ingest    │     │ (chunking,   │     │ (vectors) │
│           │     │  embedding)  │     │           │
└──────────┘     └──────┬───────┘     └─────┬─────┘
                        │                     │
                        ▼                     ▼
                 ┌──────────────────────────────┐
                 │       Hybrid Search          │
                 │  (vector + keyword fusion)    │
                 └──────────────┬───────────────┘
                                │
                                ▼
                        ┌──────────────┐
                        │  Answer Gen  │
                        │  (LLM + RAG) │
                        └──────────────┘
```

### RAG Pipeline (src/lib/rag-engine.ts)

1. **Document Ingestion**: `ingestDocument()` — chunks text, generates embeddings
2. **Chunking**: 512-token chunks with 50-token overlap
3. **Embedding**: External API (OpenAI-compatible) or pseudo-embedding fallback
4. **Vector Storage**: Qdrant (or SQLite fallback)
5. **Hybrid Search**: `hybridSearch()` — 70% vector + 30% keyword scoring

### Embedding Configuration

```env
# External embedding API (recommended)
EMBEDDING_API_URL="https://api.openai.com/v1/embeddings"
EMBEDDING_API_KEY="sk-xxxxx"
EMBEDDING_MODEL="text-embedding-3-small"

# Vector dimensions: 1536 (OpenAI standard)
```

### RAG API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/rag/ingest` | POST | Ingest a document into the RAG system |
| `/api/rag/query` | POST | Query the knowledge base |
| `/api/rag/search` | POST | Vector/keyword search |
| `/api/rag/collections` | GET | List RAG collections |
| `/api/rag/documents` | GET/POST | List/create documents |
| `/api/rag/documents/[id]` | GET/DELETE | Get/delete a document |
| `/api/rag/engine-stats` | GET | RAG system statistics |

### RAG Fallback Behavior

| Component | Available | Fallback |
|---|---|---|
| **Qdrant** | No | SQLite-based vector search (degraded) |
| **Embedding API** | No | Hash-based pseudo-embeddings (not semantic) |
| **Both** | No | Keyword-only search via SQLite LIKE |