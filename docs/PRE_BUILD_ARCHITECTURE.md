# PRE-BUILD ARCHITECTURE

## System Overview
ALO LABS AIOS — AI Operating System
- Framework: Next.js 16 (App Router, Turbopack)
- Language: TypeScript 5
- Database: Prisma 7 + SQLite (custom.db, 83MB)
- Cache: Redis 6.0.16
- Vector: Qdrant
- Storage: MinIO/S3

## AI Provider Architecture
Agent → AI Gateway → Model Router → Provider Selection → Groq/OpenRouter/Ollama/ZAI-SDK

## Agent Hierarchy
CEO → Department Director → Manager → Team Lead → Specialist → Worker → Tool/API

## Existing Subsystems
1. AI Router (src/lib/ai-router/) — Provider abstraction, circuit breaker, load balancing, failover
2. Agent Runtime (src/lib/agent-runtime/) — Priority queue, execution, context engine, RAG, approval
3. Context Engine (src/lib/context-engine.ts) — Builds agent system prompts from DB
4. Event Bus (src/lib/event-bus/) — Pub/sub event system
5. Approval Engine (src/lib/approval-engine/) — High-risk task approval
6. RAG Engine (src/lib/rag-engine.ts) — Knowledge retrieval
7. Memory System (src/lib/memory/) — Agent memory
8. Job Queue (src/lib/job-queue.ts) — Background job processing
9. Security (src/lib/security/) — CSRF, rate limiting, session management, file validation
10. Social (src/lib/social/) — 12 social media platforms
11. Email (src/lib/email/) — SMTP/IMAP
12. WhatsApp (src/lib/whatsapp/) — Business API

## NEW Subsystems (This Build)
1. Groq Provider (src/lib/ai-router/groq-provider.ts) — Fast LPU inference
2. AI Gateway (src/lib/ai-gateway/) — Unified API with validation, cost tracking
3. Department Registry (src/lib/department-registry/) — 100 departments, 12 groups
4. Model Routing Policy (src/lib/model-routing-policy/) — 7 configurable policies
5. Multi-Agent Orchestrator (src/lib/multi-agent-orchestrator/) — 8 orchestration patterns
6. Agent Factory (src/lib/multi-agent-orchestrator/agent-factory.ts) — Dynamic agent creation