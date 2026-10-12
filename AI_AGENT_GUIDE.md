# ALO Labs AIOS — AI Agent Guide

## Overview

AI agents are the core execution units of the AIOS platform. Each agent belongs to a department, has a defined role, and can invoke skills and tools to accomplish tasks. This guide covers agent creation, configuration, deployment, and lifecycle management.

---

## Agent Concepts

### Agent Identity

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | String | Human-readable ID in `AGENT-XXXX` format (e.g., `AGENT-0042`) |
| `name` | String | Display name |
| `slug` | String | URL-safe identifier (unique) |
| `departmentId` | String | Department the agent belongs to |
| `departmentName` | String | Denormalized department name |
| `purpose` | String | One-line description of what the agent does |

### Agent Types

| Type | Description |
|------|-------------|
| `conversational` | Chat-based interaction agent |
| `autonomous` | Self-directed task execution |
| `workflow` | Part of a multi-step workflow |
| `specialized` | Domain-specific expert |

### Agent Roles

| Role | Purpose |
|------|---------|
| `manager` | Coordinates other agents, assigns tasks |
| `planner` | Breaks down complex goals into steps |
| `execution` | Performs the actual work |
| `qa` | Quality assurance and review |
| `report` | Generates reports and summaries |
| `automation` | Handles automated recurring tasks |
| `safety` | Monitors for safety policy violations |
| `memory` | Manages knowledge storage and retrieval |
| `productivity` | Tracks and optimizes productivity metrics |
| `owner_approval` | Handles human-in-the-loop approval |
| `specialist` | Domain expert (default) |

### Agent Tiers

| Tier | Scope | Delegation |
|------|-------|-----------|
| `ceo` | Company-wide | Can delegate to any tier |
| `director` | Department-wide | Can delegate to manager and below |
| `manager` | Team-level | Can delegate to workers |
| `worker` | Individual tasks | Cannot delegate |

### Agent Status Lifecycle

```
created → initializing → ready → running → completed
                                 → failed → ready (retry allowed)
                                 → timed_out → ready (retry allowed)
                                 → waiting_approval → running → completed
                                 → paused → running
                     → archived (terminal state)
```

All state transitions are validated by `isValidTransition()` in `src/lib/agent-runtime/types.ts`. Invalid transitions are rejected.

---

## Creating an Agent

### Via API

```bash
POST /api/agent-factory/build
```

```json
{
  "agentName": "Contract Reviewer",
  "departmentId": "clx-legal-dept-id",
  "config": {
    "type": "specialized",
    "role": "specialist",
    "purpose": "Reviews legal contracts for risks and compliance issues",
    "allowedSkills": "[\"contract-analysis\", "legal-research\"]",
    "allowedTools": "[\"web-search\", "pdf-reader\"]",
    "protectionRules": "[{\"rule\": \"no_external_sharing\", \"level\": \"high\"}]"
  }
}
```

This creates an `AgentBuildRequest` (status: `pending`) which may require approval before the agent is created.

### Via Database Seed

Agents can be pre-seeded using the seed scripts:

```bash
bun run scripts/seed.ts           # Initial seed (departments, agents, skills)
bun run scripts/seed-v2.ts        # Extended seed
bun run scripts/seed-enterprise.ts # Enterprise features
bun run scripts/seed-crm.ts       # CRM data
```

---

## Agent Configuration

### Skill Access Control

```json
{
  "allowedSkills": "[\"research\", \"data-analysis\"]",
  "forbiddenSkills": "[\"social-publish\", \"payment-process\"]"
}
```

- `allowedSkills`: JSON array of skill slugs the agent CAN use (whitelist)
- `forbiddenSkills`: JSON array of skill slugs the agent CANNOT use (blacklist)

### Tool Access Control

```json
{
  "allowedTools": "[\"web-search\", \"file-read\", \"db-query\"]",
  "forbiddenTools": "[\"shell-exec\", \"email-send\", \"file-delete\"]"
}
```

### Protection Rules

```json
[
  {
    "rule": "no_external_apis_without_approval",
    "level": "high",
    "action": "block"
  },
  {
    "rule": "max_cost_per_task_usd",
    "value": 1.00,
    "action": "block"
  }
]
```

Protection rules are evaluated by the protection engine (`/api/protection/evaluate`) before the agent executes tools or makes API calls.

### Approval Rules

```json
[
  {
    "trigger": "paid_api_call",
    "requires": "manager_approval",
    "timeoutMinutes": 60
  },
  {
    "trigger": "external_communication",
    "requires": "admin_approval",
    "timeoutMinutes": 240
  }
]
```

### Handoff Rules

```json
[
  {
    "condition": "legal_question_detected",
    "targetAgentSlug": "legal-advisor",
    "autoHandoff": true
  },
  {
    "condition": "cost_exceeds_budget",
    "targetAgentSlug": "cost-controller",
    "autoHandoff": true
  }
]
```

### Input/Output Schemas

```json
{
  "inputSchema": "{\"type\": \"object\", \"properties\": {\"query\": {\"type\": \"string\"}}}"
  "outputSchema": "{\"type\": \"object\", \"properties\": {\"answer\": {\"type\": \"string\"}, \"confidence\": {\"type\": \"number\"}}}"
}
```

### Self-Improvement Configuration

```json
{
  "selfImprovement": {
    "enabled": true,
    "learningRate": 0.1,
    "maxCorrectionsPerDay": 50,
    "autoApplyPatterns": false
  }
}
```

### Productivity Rules

```json
{
  "productivityRules": {
    "maxTokensPerTask": 50000,
    "maxToolsPerTask": 20,
    "maxDurationMs": 300000,
    "parallelAllowed": false
  }
}
```

---

## Executing an Agent

### Synchronous Execution

```bash
POST /api/agent-runtime/execute
```

```json
{
  "agentId": "clx-agent-id",
  "companyId": "clx-company-id",
  "userId": "clx-user-id",
  "input": "Analyze the Q3 revenue report and identify trends",
  "mode": "sync",
  "priority": "normal"
}
```

### Streaming Execution

```json
{
  "agentId": "clx-agent-id",
  "input": "Write a market analysis report",
  "mode": "streaming"
}
```

### Execution Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `sync` / `async` / `streaming` | `sync` | Execution mode |
| `priority` | `critical` / `high` / `normal` / `low` | `normal` | Task priority |
| `maxTokens` | number | varies | Maximum tokens to generate |
| `timeoutMs` | number | 60000 | Execution timeout |
| `tools` | string[] | from config | Override allowed tools |
| `systemPrompt` | string | from config | Override system prompt |

### Resource Limits (Defaults)

| Limit | Value |
|-------|-------|
| `maxConcurrentPerAgent` | 5 |
| `maxConcurrentPerCompany` | 50 |
| `maxTokensPerMinute` | 100,000 |
| `maxTokensPerDay` | 10,000,000 |
| `maxExecutionTimeMs` | 120,000 (2 min) |
| `maxRetries` | 3 |
| `maxDelegationDepth` | 3 |

### Execution Result

```json
{
  "content": "The Q3 revenue analysis shows...",
  "toolCalls": [
    {
      "id": "tc_001",
      "name": "file-read",
      "arguments": { "path": "/reports/q3.pdf" },
      "result": { "text": "..." },
      "success": true,
      "latencyMs": 234
    }
  ],
  "delegations": [
    {
      "targetAgentId": "clx-data-analyst",
      "task": "Generate revenue charts",
      "result": { "content": "..." },
      "latencyMs": 5600
    }
  ],
  "confidence": 0.87,
  "tokenUsage": {
    "promptTokens": 1500,
    "completionTokens": 800,
    "totalTokens": 2300,
    "costUsd": 0.0023
  }
}
```

---

## Agent Memory

### Memory Tiers

The platform implements a 3-tier memory system:

| Tier | Model | Purpose | Retention |
|------|-------|---------|-----------|
| Short-term | `MemoryShortTerm` | Conversation context, task state | Session-scoped, expires |
| Long-term | `MemoryLongTerm` | Learned knowledge, patterns | Permanent, scoppable |
| Static rules | `MemoryStaticRule` | Immutable operational rules | Permanent, locked |

### Agent-Specific Memory

```bash
GET /api/agent-memory?agentId=clx-agent-id
```

Agent memory entries have a temperature classification:

| Temperature | Meaning |
|-------------|---------|
| `hot` | Recently learned, high confidence, frequently used |
| `warm` | Verified knowledge, moderate use |
| `cold` | Historical knowledge, rarely accessed |

Memory entries track `successCount` and `useCount` for promotion/demotion decisions.

### Department Memory

```bash
GET /api/department-memory?departmentId=clx-dept-id
```

Shared knowledge across all agents in a department.

### Company Memory

```bash
GET /api/company-memory?companyId=clx-company-id
```

Organization-wide knowledge accessible to all agents of a company.

### Static Rules (Locked Memory)

```prisma
model MemoryStaticRule {
  scope     String  // global, company, department
  scopeId   String? // ID of the scope
  ruleType  String  // protection, payment, approval, rbac, data_classification
  ruleKey   String  // Unique key within scope
  ruleValue String  // The rule content
  isLocked  Boolean  // Cannot be modified by agents (default: true)
}
```

---

## Agent Scheduling

### Cron-Based Scheduling

```typescript
import { getAgentScheduler } from '@/lib/agent-runtime';

const scheduler = getAgentScheduler();
scheduler.schedule({
  agentId: 'clx-agent-id',
  companyId: 'clx-company-id',
  task: 'Generate daily report',
  cron: '0 9 * * *', // Every day at 9 AM
  priority: 'normal',
});
```

### Interval-Based Scheduling

```typescript
scheduler.schedule({
  agentId: 'clx-agent-id',
  companyId: 'clx-company-id',
  task: 'Check system health',
  intervalMs: 300_000, // Every 5 minutes
  priority: 'high',
});
```

### One-Time Scheduled Execution

```typescript
scheduler.schedule({
  agentId: 'clx-agent-id',
  companyId: 'clx-company-id',
  task: 'Process end-of-month report',
  runAt: new Date('2025-02-01T00:00:00Z'),
  priority: 'critical',
});
```

---

## Agent Health Monitoring

### Health Snapshot

```typescript
interface AgentHealthSnapshot {
  agentId: string;
  status: AgentStatus;
  healthScore: number;       // 0-100
  successRate: number;       // 0-1
  avgLatencyMs: number;
  errorRate: number;         // 0-1
  totalExecutions: number;
  lastExecutionAt?: Date;
  lastErrorAt?: Date;
  consecutiveFailures: number;
  isDegraded: boolean;       // true if healthScore < 50
}
```

### Health APIs

| Endpoint | Description |
|----------|-------------|
| `GET /api/agent-runtime/health` | Overall agent runtime health |
| `GET /api/agent-stability/health` | Agent stability metrics |
| `GET /api/agent-performance` | Performance scores per agent |
| `GET /api/agent-status-history` | Status change history |
| `GET /api/agent-health` | Detailed health records |

### Degradation Detection

An agent is considered **degraded** when:
- `healthScore < 50`
- `consecutiveFailures >= 3`
- `errorRate > 0.3` (30%)

Degraded agents trigger alerts and may be automatically paused.

---

## Agent Versioning

Every agent modification increments the `version` field and creates an `AgentVersion` record:

```prisma
model AgentVersion {
  id        String  @id @default(cuid())
  agentId   String
  version   Int
  config    String  // Full JSON snapshot of agent config
  changeLog String? // Human-readable description
  createdAt DateTime @default(now())
}
```

View version history: `GET /api/agent-versions?agentId=clx-agent-id`

---

## Agent Performance Scoring

The `AgentPerformanceScore` model tracks per-agent metrics aggregated by period:

| Metric | Description |
|--------|-------------|
| `successRate` | Ratio of successful executions |
| `errorRate` | Ratio of failed executions |
| `avgRuntimeMs` | Average execution time |
| `outputQualityScore` | Quality assessment score |
| `userCorrectionCount` | Times user corrected output |
| `blockedActionCount` | Actions blocked by protection engine |
| `approvalRequiredCount` | Times approval was needed |
| `productivityScore` | Composite productivity metric |

Periods: `daily`, `weekly`, `monthly`

---

## Agent Delegation

Higher-tier agents can delegate tasks to lower-tier agents:

```
CEO Agent
  └─→ Director Agent
        └─→ Manager Agent
              └─→ Worker Agent (max depth: 3)
```

Configuration:
- `MAX_DELEGATION_DEPTH = 3` (hard limit in `types.ts`)
- Per-agent delegation is controlled by `handoffRules` JSON

### Delegation Result

```typescript
interface DelegationResult {
  targetAgentId: string;
  task: string;
  result: ExecutionResult;
  latencyMs: number;
}
```

---

## Agent Training

Training records are stored in `AgentTrainingRecord`. The training endpoint:

```bash
GET /api/training?agentId=clx-agent-id
```

Training improves agent performance by:
1. Analyzing `LearningReport` records (what worked, what failed, corrections, patterns)
2. Updating `AgentMemory` entries with temperature adjustments
3. Modifying agent configuration based on `ProductivityReport` recommendations

---

## LLM Routing for Agents

When an agent needs LLM completion, the request goes through the AI Router:

### Available Providers

| Provider | Models | Use Case |
|----------|--------|----------|
| Ollama | LLaMA, Qwen, Gemma, Phi, Mistral, DeepSeek | Local, free, private |
| OpenRouter | 100+ models | Cloud, diverse model selection |
| Z-AI SDK | GLM, custom | Z-AI ecosystem |
| OpenAI-compatible | Any compatible endpoint | Custom/self-hosted |

### Model Families

| Family | Example Models | Strengths |
|--------|--------------|------------|
| `qwen` | qwen2.5:7b, qwen2.5:72b | General purpose, multilingual |
| `llama` | llama3.1:8b, llama3.1:70b | General purpose, instruction following |
| `deepseek` | deepseek-r1, deepseek-coder | Reasoning, coding |
| `gemma` | gemma2:9b | Efficient, lightweight |
| `phi` | phi-4 | Small, fast, capable |
| `mistral` | mistral-large, codestral | European, coding |
| `glm` | glm-4 | Chinese, multilingual |

### Routing Strategy

The `AIRouter` selects the best provider based on:

1. **Capability matching**: Requested capabilities (chat, streaming, function-calling, vision, json-mode, code-generation)
2. **Load balancing**: Round-robin, least-connections, random, or weighted strategy
3. **Circuit breaker**: Providers with 5+ consecutive failures are temporarily excluded (60s cooldown)
4. **Cost optimization**: Routes to cheapest capable provider when `reason: 'cost'`
5. **Speed optimization**: Routes to lowest-latency provider when `reason: 'speed'`
6. **Quality optimization**: Routes to highest-quality provider when `reason: 'quality'`

### Provider Configuration

```typescript
import { AIRouter } from '@/lib/ai-router';
import { OllamaProvider } from '@/lib/ai-router/ollama-provider';
import { OpenRouterProvider } from '@/lib/ai-router/openrouter-provider';

const router = new AIRouter();

// Register Ollama for local models
router.registerProvider(new OllamaProvider({
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
}), weight: 70);

// Register OpenRouter as fallback
router.registerProvider(new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
}), weight: 30);

// Set load balancing strategy
router.setLoadBalance({ strategy: 'weighted' });
```

---

## Self-Improvement System

Agents can learn from their execution history:

```bash
GET /api/self-improvement?agentId=clx-agent-id
GET /api/self-improvement/report?agentId=clx-agent-id
```

### Learning Reports

```prisma
model LearningReport {
  taskId      String?
  agentId     String?
  whatWorked  String   // JSON array of successful strategies
  whatFailed  String   // JSON array of failed approaches
  corrections String   // JSON array of user corrections
  pattern     String?  // Detected pattern
  suggestion  String?  // Improvement suggestion
}
```

### Productivity Reports

```prisma
model ProductivityReport {
  speedScore           Float  // 0-100
  qualityScore         Float  // 0-100
  reuseScore           Float  // 0-100 (memory/skill reuse)
  errorScore           Float  // 0-100 (lower is better)
  finalProductivityScore Float // Weighted composite
  recommendations       String // JSON array of suggestions
}
```

---

## Company-Level Agent Access

Not all agents are available to all companies. Access is controlled via:

```bash
GET /api/agent-company-access
GET /api/company/agents/allowed?companyId=clx-company-id
```

The `AgentCompanyAccess` model maps agents to companies. Only agents with an active mapping are visible and executable by that company's users.

---

## Approval Workflow for Agent Actions

When an agent needs to perform a high-risk action, it enters `waiting_approval` status:

1. Agent requests action (e.g., paid API call, external deployment)
2. System creates an `Approval` record with type `paid_api`, `deployment`, etc.
3. Notification is sent to the appropriate approver (based on `approvalRules`)
4. Approver reviews and approves/rejects via `/api/approval-engine`
5. On approval: agent resumes execution
6. On rejection: agent fails with rejection reason
7. On timeout: approval expires, agent fails

---

## Monitoring Agent Operations

### Real-time

- `GET /api/agent-runtime/status` — current status of all agents
- `GET /api/agent-runs/[taskId]` — specific run details
- `GET /api/agent-usage-summaries` — aggregated usage per agent

### Historical

- `GET /api/agent-performance` — performance scores over time
- `GET /api/agent-status-history` — all status transitions
- `GET /api/tool-runs` — tool invocation history
- `GET /api/usage/agents` — token usage per agent
