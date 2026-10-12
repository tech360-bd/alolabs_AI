# CHANGELOG

## [2.0.0-groq] - 2026-08-18
### Added
- **Groq Provider** — First-class Groq LPU inference integration with 7 models
- **AI Gateway** — Unified AI API with validation, cost tracking, structured errors
  - POST /api/ai/chat — Non-streaming chat
  - POST /api/ai/stream — Streaming SSE chat
  - POST /api/ai/route — Dry-run routing decision
  - POST /api/ai/batch — Sequential batch execution
  - POST /api/ai/parallel — Parallel execution with aggregation
  - GET /api/ai/models — List all models
  - GET /api/ai/providers — Provider health status
- **100-Department Registry** — Full 12-group, 100-department architecture
  - Executive & Strategy (5), Finance (5), HR (5), Sales (5), Marketing (10)
  - ALO Education (10), Technology (10), Data & AI (10), Operations (10)
  - Customer & Communications (10), Research & Expansion (10), Product & Platform (10)
- **Model Routing Policy Engine** — 7 configurable routing policies
- **Multi-Agent Orchestrator** — 8 orchestration patterns
  - Sequential, Parallel, Conditional, Delegation, Aggregation, Voting, Consensus, Review
- **Agent Factory** — Dynamic agent creation with expiration and cloning
- **Production Documentation** — Full manifests, integrity reports, deployment guides

### Changed
- AIProvider type extended with 'groq' (additive, non-breaking)
- .env.example updated with GROQ_* variables

### Removed
- Nothing. Zero deletions.
