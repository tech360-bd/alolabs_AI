# Licence Register — ALO Labs AgentOS / Central AI Platform

> Generated: 2026-11-25 · Sources: `package.json` `license` field and each dependency's own `package.json` (verified from the installed tree). Model licences are registry defaults and must be re-verified at each model-pin bump.

## 1. Application

| Component | Licence | Version |
|---|---|---|
| alolabs-agentos (this repository) | Proprietary — ALO Labs | — |

## 2. Core software dependencies (verified from installed packages)

| Package | Licence | Version | Role |
|---|---|---|---|
| next | MIT | 16.4.6 | App framework |
| react | MIT | 19.2.3 | UI runtime |
| typescript | Apache-2.0 | 5.9.3 | Language |
| prisma / @prisma/client | Apache-2.0 | 6.19.2 | ORM / DB client |
| zod | MIT | 4.6.7 | Validation |
| tailwindcss | MIT | 4.3.3 | Styling |
| zustand | MIT | 5.0.15 | State |
| vitest | MIT | 4.1.12 | Tests |
| eslint | MIT | 9.39.5 | Lint |

Full transitive inventory: `npx license-checker --summary` (not committed; run in CI).

## 3. Model infrastructure

| Component | Licence (verify at pin) | Notes |
|---|---|---|
| Ollama (runtime) | MIT | Local inference runtime, `src/lib/ai-router/ollama-provider.ts` |
| Qwen family (Alibaba) | Apache-2.0 / Tongyi Qianwen LICENSE depending on size | Check the exact model card before commercial pinning |
| Llama family (Meta) | Meta Llama Community License (not OSI) | Commercial terms apply above 700M MAU |
| Gemma family (Google) | Gemma Terms of Use | Restricted-use terms |
| DeepSeek / Mistral / Phi | model-card specific (MIT / Apache-2.0 / MIT respectively as of common pins) | Re-verify each pin |
| llama.cpp | MIT | **Not integrated yet** (audit gap G5) |

## 4. Planned integrations (directive §6) — licences to clear before adoption

| Tool | Licence | Status |
|---|---|---|
| LangGraph (Python/JS) | MIT | Not integrated (gap G4) |
| OpenHands | MIT | Not integrated (gap G4) |
| Aider | Apache-2.0 | Not integrated (gap G4) |
| Asterisk | GPLv2 (server) — keep as isolated external service | Not integrated as adapter (gap G8) |
| Pipecat | BSD-2-Clause | Not integrated as adapter (gap G8) |

## 5. Rules

1. **No paid hosted-model API is mandatory.** The platform operates with `AI_PROVIDER=local` / free-tier profiles; paid execution only via explicitly authorized profiles (directive §7 honoured in code).
2. New dependencies must be OSI-compatible or cleared by the owner before merge; record them here in the same PR.
3. Benchmark-research artefacts (PR #58) contain no third-party proprietary code, logos or screenshots — concepts only.
