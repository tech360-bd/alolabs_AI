# ALO Labs AI-EOS — Master Architecture

> **Document ID:** DELIVERABLE-2
> **Version:** 1.0
> **Date:** 2025-01-01
> **Classification:** Internal — Engineering Reference
> **Predecessor:** DELIVERABLE-1 (Executive Summary)

---

## 1. Architecture Overview

The ALO Labs AI-EOS (AI Enterprise Operating System) is built on a **6-layer architecture** that separates concerns from physical infrastructure through to end-user applications. This layered approach ensures modularity, independent scalability, and clear data boundaries.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER 6: MOBILE APPS (Flutter)                                            │
│    ├── ALO Customer App          ├── ALO Admin App                         │
│    ├── ALO Agent Management App   └── ALO Reseller App                     │
│                              ↕ REST + WebSocket + FCM                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 5: WEB PLATFORM (Next.js 16)                                        │
│    ├── Enterprise Shell (28 panels)   ├── Public Website                  │
│    ├── Admin Dashboard                └── API Gateway (Caddy)              │
│                              ↕ REST + WebSocket                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 4: AI AGENT LAYER                                                   │
│    ├── 2,000 AI Agents (100 depts)  ├── 8 Cognitive Engines               │
│    ├── Collaboration System          ├── Constitution Engine              │
│    └── Self-Improvement Pipeline                                         │
│                              ↕ z-ai-web-dev-sdk calls                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 3: SERVICE LAYER                                                   │
│    ├── AI Router (multi-model)        ├── Auth Service (NextAuth + MFA)   │
│    ├── Event Bus (Socket.io)          ├── Job Queue                       │
│    ├── RAG Engine                     └── Integration Hub                  │
│                              ↕ Protocol adapters                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 2: DATA LAYER                                                      │
│    ├── PostgreSQL (structured)      ├── Redis (cache + sessions)          │
│    ├── Qdrant (vectors)             ├── Data Lake (raw + processed)       │
│    └── Knowledge Graph                                                     │
│                              ↕ SQL / Redis / gRPC                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 1: INFRASTRUCTURE                                                  │
│    ├── Ubuntu 24.04 LTS              ├── Nginx (reverse proxy + SSL)      │
│    ├── PM2 (process manager)        ├── Docker (containerization)        │
│    └── Monitoring + Backup                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Design Principles

| Principle | Implementation |
|---|---|
| **Separation of Concerns** | Each layer has a single, well-defined responsibility |
| **Loose Coupling** | Layers communicate via well-defined interfaces (REST, WebSocket, SDK) |
| **Defense in Depth** | Security enforced at every layer boundary |
| **Fail-Safe Degradation** | Each layer can operate independently during partial outages |
| **Zero Trust** | Every request authenticated and authorized regardless of origin |
| **Observability** | Full tracing, logging, and metrics across all layers |

---

## 2. Layer 6: Mobile Applications

Four native Flutter applications target iOS and Android platforms from a single Dart codebase.

### 2.1 ALO Customer App

**Purpose:** End-user interface for ALO Labs services — service requests, tracking, payments, support.

| Aspect | Detail |
|---|---|
| **Architecture** | BLoC (Business Logic Component) pattern — clean separation of UI from business logic |
| **State Management** | Riverpod — compile-time safe dependency injection, async state |
| **Navigation** | GoRouter — declarative routing with deep link support |
| **API Communication** | Dio with interceptors — automatic token refresh, retry logic, request/response logging |
| **Local Storage** | Hive (fast key-value) + Isar (structured NoSQL) for offline data |
| **Push Notifications** | Firebase Cloud Messaging (FCM) — topic-based, segmented, transactional |
| **Real-time** | Socket.io client — live order tracking, chat, notifications |
| **Authentication** | OAuth2 PKCE flow + biometric (Face ID / fingerprint) for re-auth |
| **Offline Support** | Local DB sync with conflict resolution — queue mutations, sync on reconnect |
| **Target Screens** | 45+ screens |

### 2.2 ALO Admin App

**Purpose:** Administrative control — user management, system monitoring, approvals, analytics.

| Aspect | Detail |
|---|---|
| **Architecture** | BLoC pattern with repository abstraction |
| **State Management** | Riverpod with async providers for real-time admin data |
| **Navigation** | GoRouter with role-based route guards |
| **API Communication** | Dio with admin-role interceptor, audit logging |
| **Local Storage** | Isar for cached analytics data, Hive for preferences |
| **Push Notifications** | FCM — critical alerts only (security, outage, escalation) |
| **Real-time** | Socket.io client — live dashboards, system health |
| **Authentication** | OAuth2 + MFA TOTP (Time-based One-Time Password) |
| **Offline Support** | Read-only cached views; write operations require connectivity |
| **Target Screens** | 60+ screens |

### 2.3 ALO Agent Management App

**Purpose:** Manage AI agents — deployment, monitoring, reconfiguration, training.

| Aspect | Detail |
|---|---|
| **Architecture** | BLoC with command pattern for agent operations |
| **State Management** | Riverpod with stream providers for live agent telemetry |
| **Navigation** | GoRouter with agent-context-aware routes |
| **API Communication** | Dio with WebSocket fallback for real-time agent control |
| **Local Storage** | Isar for agent configuration cache, Hive for session |
| **Push Notifications** | FCM — agent alerts (failure, anomaly, self-healing events) |
| **Real-time** | Socket.io client — live agent status, performance metrics |
| **Authentication** | OAuth2 + MFA TOTP + device-binding |
| **Offline Support** | Agent monitoring dashboard cached locally, config changes queued |
| **Target Screens** | 35+ screens |

### 2.4 ALO Reseller App

**Purpose:** Reseller/distributor portal — order management, commission tracking, client management.

| Aspect | Detail |
|---|---|
| **Architecture** | BLoC with feature-first modular structure |
| **State Management** | Riverpod with stateNotifier for multi-step order flows |
| **Navigation** | GoRouter with deep links for shared order views |
| **API Communication** | Dio with reseller-scope interceptor |
| **Local Storage** | Hive for preferences, Isar for order/client cache |
| **Push Notifications** | FCM — new orders, payment confirmations, client activity |
| **Real-time** | Socket.io client — order status updates, commission events |
| **Authentication** | OAuth2 + biometric |
| **Offline Support** | Full offline order creation, client lookup, commission history |
| **Target Screens** | 40+ screens |

### Mobile Communication Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Customer App    │     │  Admin App       │     │  Agent Mgmt App  │     │  Reseller App    │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │                        │
         └────────────────────────┼────────────────────────┼────────────────────────┘
                                  │                        │
                          ┌───────▼────────────────────────▼───────┐
                          │         REST API (JSON)                │
                          │         WebSocket (Socket.io)          │
                          │         FCM (Push Notifications)       │
                          └───────────────┬───────────────────────┘
                                          │
                                  ┌───────▼───────┐
                                  │  Caddy Gateway │
                                  │  (Port 3000)  │
                                  └───────┬───────┘
                                          │
                                  ┌───────▼───────┐
                                  │  Next.js API  │
                                  │  (274 routes) │
                                  └───────────────┘
```

---

## 3. Layer 5: Web Platform

### 3.1 Next.js 16 App Router Architecture

The web platform is built on **Next.js 16** with the App Router paradigm:

- **File-system routing** via `src/app/` directory structure
- **React Server Components** for static/shell rendering by default
- **Client Components** (`'use client'`) only where interactivity is required
- **Dynamic imports** with `React.lazy()` for all 28 enterprise panels (code-split)
- **Layout nesting** — root layout → enterprise layout → panel content
- **SSR/CSR Strategy**: Heavy panels use `ssr: false` via dynamic imports to avoid server-side rendering of complex interactive UIs

```
src/app/
├── layout.tsx                 # Root layout (fonts, providers, theme)
├── page.tsx                   # Entry point → redirects to enterprise
├── api/                       # 274 API routes
│   ├── auth/                  # Authentication (login, MFA, session)
│   ├── enterprise/            # 15+ enterprise API endpoints
│   ├── agents/                # Agent management APIs
│   ├── knowledge/             # Knowledge graph APIs
│   └── ...                    # Domain-specific route groups
├── (enterprise)/              # Enterprise route group
│   └── enterprise/
│       └── page.tsx            # Enterprise shell page
└── ...                        # Other route groups
```

### 3.2 Enterprise Shell (28 Panels)

All panels are **lazy-loaded** via `React.lazy()` in the enterprise shell component. This ensures:
- Initial bundle size stays minimal (only shell + active panel loaded)
- Each panel is an independent code-split chunk
- Navigation between panels triggers on-demand loading
- Suspense boundary shows skeleton loaders during panel transitions

**Panel Categories:**

| Category | Panels | Count |
|---|---|---|
| ALO Labs | Strategic Command, System Architecture | 2 |
| Command Center | Enterprise Overview | 1 |
| Foundation | Department Hub, AI Employees | 2 |
| Governance | Constitutional Rules, SOPs, Governance, Compliance, Audit | 5 |
| Intelligence | Knowledge Graph, RAG Engine, Prompt Library, Skills Registry | 4 |
| Cognitive | Memory, Planning, Reflection, Self-Healing, Self-Optimization, Evaluation | 6 |
| Collaboration | Multi-Agent Collab, Workflow Orchestration, Event Bus | 3 |
| Infrastructure | API Gateway, MCP Integration, Data Lake, Observability, Security | 5 |

### 3.3 API Routes (274 routes)

- All mutating routes protected with `requireAuth()` middleware
- Input validation via **Zod** schemas
- Rate limiting per-route, per-user, per-IP
- CORS configured for cross-origin requests (mini-services)
- Response caching headers for static/read-heavy endpoints
- Error handling: consistent `{ error: string }` JSON format

### 3.4 Caddy Gateway

In the development environment, **Caddy** serves as the reverse proxy gateway:
- Single external port exposure (port 3000)
- `XTransformPort` query parameter routes requests to different mini-services
- WebSocket upgrade passthrough for Socket.io connections
- Static asset serving with automatic compression
- HTTPS with automatic TLS certificate management

```
Client Request
     │
     ▼
┌─────────────────┐
│  Caddy Gateway   │  Port 3000 (external)
│  XTransformPort  │──────► Port 3000 (Next.js)
│  routing logic   │──────► Port 3003 (Socket.io)
│                  │──────► Port 30xx (other services)
└─────────────────┘
```

---

## 4. Layer 4: AI Agent Layer

### 4.1 Agent Lifecycle

Every AI agent follows a strict lifecycle managed by the platform:

```
┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐
│  CREATE  │───►│ CONFIGURE │───►│  DEPLOY  │───►│ MONITOR  │
│          │    │           │    │          │    │          │
│ Template │    │ Skills    │    │ Staging  │    │ Metrics  │
│ Identity │    │ Prompts   │    │ → Prod   │    │ Alerts   │
│ Role     │    │ Rules     │    │          │    │ Logs     │
└──────────┘    └───────────┘    └──────────┘    └────┬─────┘
                                                       │
    ┌──────────────────────────────────────────────────┘
    │
    ▼
┌──────────┐    ┌───────────┐    ┌──────────┐
│ IMPROVE  │───►│  TEST     │───►│  RETIRE  │
│          │    │           │    │          │
│ Reflect  │    │ A/B Test  │    │ Archive  │
│ Retrain  │    │ Validate  │    │ Replace  │
│ Optimize │    │ Approve   │    │ Delete   │
└──────────┘    └───────────┘    └──────────┘
```

### 4.2 Agent Scale: 2,000 Agents Across 100 Departments

- **20 agents per department** (configurable)
- Department templates define agent distribution:
  - 1 Director (L7)
  - 1 Manager (L6)
  - 2 Supervisors (L5)
  - 3 Senior Specialists (L4)
  - 5 Specialists (L3)
  - 4 Juniors (L2)
  - 4 Workers (L1)

### 4.3 Agent Role Hierarchy

```
Level 7 ── Director          │ Strategic vision, cross-dept coordination
Level 6 ── Manager           │ Department strategy, resource allocation
Level 5 ── Supervisor        │ Team oversight, quality assurance
Level 4 ── Senior Specialist │ Complex task execution, mentoring
Level 3 ── Specialist        │ Standard task execution, domain expertise
Level 2 ── Junior            │ Guided tasks, learning mode
Level 1 ── Worker            │ Repetitive tasks, data processing
```

### 4.4 Eight Cognitive Engines

```
┌───────────────────────────────────────────────────────────────┐
│                    COGNITIVE ENGINE SUITE                      │
├─────────────────┬─────────────────────────────────────────────┤
│  1. MEMORY      │ Short-term (conversation) + Long-term       │
│     ENGINE      │ (persistent knowledge). Semantic retrieval   │
│                 │ via embeddings. Forgetting curve management. │
├─────────────────┼─────────────────────────────────────────────┤
│  2. PLANNING    │ Task decomposition, dependency resolution,   │
│     ENGINE      │ critical path analysis, resource allocation, │
│                 │ deadline management, parallel execution.     │
├─────────────────┼─────────────────────────────────────────────┤
│  3. REFLECTION  │ Post-task analysis, outcome vs. expectation, │
│     ENGINE      │ pattern recognition, lesson extraction,      │
│                 │ hypothesis generation for improvement.       │
├─────────────────┼─────────────────────────────────────────────┤
│  4. SELF-       │ Error detection, root cause analysis,        │
│     HEALING     │ automatic rollback, retry with adjustment,   │
│     ENGINE      │ circuit breaker pattern, degradation modes.  │
├─────────────────┼─────────────────────────────────────────────┤
│  5. SELF-       │ Performance profiling, parameter tuning,     │
│     OPTIMIZATION│ prompt optimization, cache strategies,       │
│     ENGINE      │ cost reduction, latency improvement.         │
├─────────────────┼─────────────────────────────────────────────┤
│  6. EVALUATION  │ Quality scoring, KPI tracking, benchmark     │
│     ENGINE      │ comparison, peer review, certification.      │
├─────────────────┼─────────────────────────────────────────────┤
│  7. GOVERNANCE  │ Constitution rule enforcement, policy        │
│     ENGINE      │ compliance checking, ethical boundary        │
│                 │ validation, human override triggers.         │
├─────────────────┼─────────────────────────────────────────────┤
│  8. SECURITY    │ Input sanitization, output filtering,        │
│     ENGINE      │ prompt injection defense, data leak          │
│                 │ prevention, access control enforcement.      │
└─────────────────┴─────────────────────────────────────────────┘
```

### 4.5 Multi-Agent Collaboration

```
┌─────────┐     ┌─────────────────┐     ┌─────────┐
│ Agent A │────►│   EVENT BUS     │────►│ Agent B │
│ (Sender)│     │  (Socket.io)    │     │(Receiver)│
└─────────┘     └────────┬────────┘     └─────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐┌──────────┐┌──────────┐
        │ Agent C  ││ Agent D  ││ Agent E  │
        │(Delegated)││(Review)  ││(Notify)  │
        └──────────┘└──────────┘└──────────┘

Collaboration Patterns:
  • DELEGATION:   Agent A delegates sub-task to Agent C
  • CONSENSUS:    Multiple agents vote on a decision
  • PIPELINE:     Sequential agent chain (A → B → C → D)
  • FAN-OUT:      One agent broadcasts to many
  • AGGREGATION:  Multiple agents contribute to single result
```

### 4.6 Constitution Compliance

- **500 constitutional rules** organized by chapter and domain
- Enforced at runtime by the **Governance Engine**
- Every agent action is checked against applicable rules before execution
- Violations trigger: warning → correction → escalation → shutdown
- Rules cover: ethics, quality standards, data handling, communication, security, escalation protocols
- Continuous review cycle: rules audited and updated quarterly

### 4.7 Self-Improvement Pipeline

```
Observation ──► Reflection ──► Hypothesis ──► A/B Test ──► Deploy
     │               │               │             │           │
     ▼               ▼               ▼             ▼           ▼
  Task logs    What went       "If I change   Split traffic  Winner
  Outcomes     wrong/right?   X, outcome Y  50/50 test   promoted
  Metrics      Pattern?        will improve"               │
                                                                 ▼
                                                           Evaluate
                                                           │
                                                           ▼
                                                    ┌──────────────┐
                                                    │ Improve? Yes │──► Standardize
                                                    │ Improve? No  │──► Revert
                                                    └──────────────┘
```

---

## 5. Layer 3: Service Layer

### 5.1 AI Router (Multi-Model)

Routes AI requests to the optimal model based on task characteristics:

| Model | Provider | Best For | Cost Tier | Latency |
|---|---|---|---|---|
| Claude 3.5/4 | Anthropic (via SDK) | Complex reasoning, long context, code | High | Medium |
| GPT-4/4o | OpenAI (via SDK) | General tasks, instruction following | High | Low |
| Gemini Pro | Google (via SDK) | Multimodal, large context window | Medium | Medium |
| Llama 3 | Meta (self-hosted) | Cost-sensitive, bulk processing | Low | Low |
| Mistral | Mistral AI (via SDK) | European compliance, multilingual | Medium | Low |

**Routing Logic:**
```
Request → Classify Task Type → Check Cost Budget → Evaluate Latency Need
                                                          │
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                    High Complexity   Medium         Low/Bulk
                                    Claude/GPT-4     Gemini/Mistral   Llama
```

### 5.2 Auth Service (NextAuth.js v4 + MFA)

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. CREDENTIAL CHECK                                        │
│     Email/Password ──► NextAuth.js ──► Validate             │
│     OAuth (Google/GitHub) ──► NextAuth.js ──► Profile       │
│                                                              │
│  2. MFA CHALLENGE (if enabled)                               │
│     TOTP Code ──► Verify ──► ✓/✗                            │
│                                                              │
│  3. SESSION CREATION                                         │
│     JWT Token ──► HTTP-only Cookie ──► Redis Session Store  │
│                                                              │
│  4. RBAC ENFORCEMENT                                        │
│     Role: super_admin │ admin │ manager │ operator │ viewer │
│     Permission check on every API request                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**RBAC Roles:**

| Role | Access Level | Typical Users |
|---|---|---|
| `super_admin` | Full system access, user management, system config | CTO, Platform Lead |
| `admin` | All enterprise features, agent management, analytics | Department Heads |
| `manager` | Department-scoped access, agent monitoring, SOPs | Team Leads |
| `operator` | Task execution, agent interaction, limited config | Operators |
| `viewer` | Read-only dashboards, reports, monitoring | Stakeholders, Auditors |

### 5.3 Event Bus (Socket.io)

- **Implementation:** Dedicated mini-service on port 3003
- **Protocol:** WebSocket with Socket.io library
- **Pattern:** Async pub/sub with priority levels P0 (critical) through P4 (low)
- **Event Types:** 200+ defined event types across all domains
- **Features:**
  - Room-based broadcasting (department, agent-group, user)
  - Event persistence for replay
  - Dead letter queue for failed deliveries
  - Backpressure handling
  - Automatic reconnection with exponential backoff

```
Event Priority Queue:
  P0 ──► CRITICAL    (system failure, security breach)     → immediate
  P1 ──► HIGH        (agent failure, SLA breach)           → < 1s
  P2 ─── MEDIUM      (task completion, status change)      → < 5s
  P3 ─── LOW         (metrics update, log entry)           → < 30s
  P4 ─── BACKGROUND  (analytics aggregation, batch jobs)  → < 5min
```

### 5.4 Job Queue

- **Primary:** In-memory priority queue (fast, low-latency)
- **Backing Store:** Redis (durability, cross-process sharing)
- **Features:**
  - Priority-based scheduling (inherits event bus P0-P4)
  - Job deduplication (idempotency keys)
  - Retry with exponential backoff (max 5 retries)
  - Dead letter queue after max retries
  - Job cancellation and timeout support
  - Progress tracking via event bus

### 5.5 RAG Engine

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│  DOCUMENT  │───►│  CHUNKING  │───►│ EMBEDDING  │───►│  STORE IN  │
│  INGEST    │    │  (512 tok) │    │  (vector)  │    │  QDRANT    │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
                                                           │
┌────────────┐    ┌────────────┐    ┌────────────┐          │
│  GENERATE  │◄───│  CONTEXT   │◄───│  RETRIEVE  │◄─────────┘
│  ANSWER    │    │  ASSEMBLY  │    │  (top-k)   │
└────────────┘    └────────────┘    └────────────┘
       │
       ▼
  User receives
  grounded answer
```

- **Vector Store:** Qdrant (self-hosted)
- **Chunking:** 512-token overlapping chunks
- **Embedding:** Via z-ai-web-dev-sdk LLM embeddings
- **Retrieval:** Top-k semantic search with reranking
- **Context Assembly:** Retrieved chunks + conversation history + agent context
- **Answer Generation:** LLM generates response grounded in retrieved context

### 5.6 Integration Hub

Central adapter pattern for all external service integrations:

```
┌──────────────────────────────────────────────────┐
│                 INTEGRATION HUB                   │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐               │
│  │ Communication│  │  Payments   │               │
│  │  Adapters   │  │  Adapters   │               │
│  │  WhatsApp   │  │  bKash      │               │
│  │  Email      │  │  Nagad      │               │
│  │  Telegram   │  │  Stripe     │               │
│  │  SMS        │  │  SSLCommerz │               │
│  └─────────────┘  └─────────────┘               │
│                                                  │
│  ┌─────────────┐  ┌─────────────┐               │
│  │   Social    │  │  Productivity│              │
│  │   Media     │  │  Adapters   │               │
│  │  Facebook   │  │  Google WS  │               │
│  │  Instagram  │  │  MS 365     │               │
│  │  LinkedIn   │  │  cPanel     │               │
│  │  Twitter/X  │  │  Domains    │               │
│  └─────────────┘  └─────────────┘               │
└──────────────────────────────────────────────────┘
```

Each adapter implements a common interface:
- `connect()` — Establish connection
- `send(payload)` — Send data
- `receive()` — Receive data (pull or push)
- `validate(payload)` — Schema validation
- `transform(payload)` — Format conversion
- `disconnect()` — Clean shutdown
- `healthCheck()` — Connection status

---

## 6. Layer 2: Data Layer

### 6.1 PostgreSQL (Structured Data)

- **ORM:** Prisma (type-safe, migration-managed)
- **Models:** 134 Prisma models covering all business domains
- **Seeded Records:** 103,000+ entities for development/demo
- **Production Target:** PostgreSQL (currently SQLite for development)

**Model Categories:**

| Domain | Example Models | Count |
|---|---|---|
| Users & Auth | User, Account, Session, MFA | 8 |
| Agents | AiAgent, AgentConfig, AgentMetrics | 12 |
| Knowledge | KnowledgeNode, Prompt, Skill | 15 |
| Workflows | Workflow, Task, Job, Event | 18 |
| Governance | Rule, Sop, Audit, Compliance | 14 |
| Infrastructure | Service, Deployment, Metric | 10 |
| Business | Client, Order, Payment, Invoice | 25 |
| Communication | Message, Channel, Notification | 12 |
| Data Lake | RawLog, ProcessedData, Insight | 10 |
| Other | Settings, Tags, Relations | 10 |

### 6.2 Redis (Cache + Sessions)

```
Redis 6.0.16 Usage:
├── Session Store          │ JWT sessions, MFA states
├── Rate Limiting          │ Sliding window per route/user/IP
├── Real-time State        │ Agent status, dashboard counters
├── Job Queue              │ Priority queue backing store
├── Cache Layer            │ API response caching (TTL-based)
├── Pub/Sub                │ Cross-process event propagation
└── Feature Flags          │ Runtime feature toggles
```

### 6.3 Qdrant (Vector Store)

- **Purpose:** Semantic search and RAG retrieval
- **Collections:** Document chunks, agent memories, knowledge embeddings
- **Scale:** 10,000+ document chunks indexed
- **Operations:** Upsert, search, filter, delete
- **Access:** Via RAG Engine service (Layer 3)

### 6.4 Data Lake

- **Purpose:** Raw and processed data storage for analytics and ML
- **Sources:** 5 source types (agent logs, user interactions, system metrics, external data, business events)
- **Scale:** 15,000+ entries
- **Pipeline:** Raw ingestion → Processing → Enrichment → Storage → Query

```
Data Lake Pipeline:

  Raw Logs ──► Parse ──► Validate ──► Transform ──► Store (Processed)
      │                                        │
      └──► Archive (Raw)                       └──► Index (Searchable)
                                                │
                                                ▼
                                          Analytics Queries
```

### 6.5 Knowledge Graph

- **Nodes:** 2,500+ entities across 9 entity types
- **Edges:** 5,000+ relationships across 7+ relation types
- **Entity Types:** Agent, Department, Skill, Knowledge, Rule, Sop, Client, Project, Concept
- **Relation Types:** belongs_to, manages, requires, depends_on, related_to, reports_to, collaborates_with
- **Storage:** PostgreSQL (adjacency lists + materialized paths)
- **Query:** Traversal APIs, shortest path, subgraph extraction

---

## 7. Layer 1: Infrastructure

### 7.1 Server Stack

```
┌─────────────────────────────────────────────────────┐
│  UBUNTU 24.04 LTS                                    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  NGINX                                       │    │
│  │  • Reverse proxy (port 80/443)               │    │
│  │  • SSL/TLS termination                       │    │
│  │  • Gzip compression                          │    │
│  │  • Static file serving (/uploads, /assets)   │    │
│  │  • Rate limiting (connection level)          │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │  PM2         │  │  Docker      │                  │
│  │  • Node.js   │  │  • Services  │                  │
│  │  • Auto-restart│ │  • Databases │                  │
│  │  • Log mgmt  │  │  • Utilities │                  │
│  │  • Cluster   │  │  • Compose   │                  │
│  └──────────────┘  └──────────────┘                  │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  MONITORING & BACKUP                         │    │
│  │  • Health checks (every 30s)                 │    │
│  │  • Metrics collection (Prometheus-compatible) │    │
│  │  • Error logging (structured JSON)           │    │
│  │  • Daily automated backups                  │    │
│  │  • Disaster recovery procedures             │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 7.2 Process Management (PM2)

- **Primary process manager** for Node.js/Bun applications
- **Cluster mode:** Multiple worker processes per CPU core
- **Auto-restart:** Zero-downtime restarts on crash or deploy
- **Log management:** Rotating logs with retention policy
- **Monitoring:** Real-time CPU, memory, and event metrics
- **Ecosystem file:** Defines all application processes and their configurations

### 7.3 Containerization (Docker)

- **Docker Compose** for multi-service orchestration
- **Containers:** Qdrant, Redis, PostgreSQL, external service adapters
- **Volumes:** Persistent data for databases and file storage
- **Networks:** Isolated bridge networks per service group
- **Health checks:** Per-container health monitoring

### 7.4 Security Infrastructure

- **Operating System:** Ubuntu 24.04 LTS with security patches
- **Encryption at Rest:** AES-256 for all stored data
- **Encryption in Transit:** TLS 1.3 for all network communication
- **Firewall:** UFW (Uncomplicated Firewall) — only required ports open
- **SSH:** Key-based authentication only, no password login
- **Zero Trust:** Never trust, always verify — every request authenticated
- **Secrets:** Environment variables only, no hardcoded credentials in code
- **File System:** Non-root user, restricted directory permissions

---

## 8. Security Architecture

### 8.1 Zero Trust Model

```
┌─────────────────────────────────────────────────────────────┐
│                   ZERO TRUST ARCHITECTURE                    │
│                                                              │
│  PRINCIPLE: Never trust, always verify                       │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │ IDENTITY │──►│  DEVICE  │──►│ NETWORK  │──►│  APP/    │  │
│  │ VERIFY   │   │ TRUST    │   │ VERIFY   │   │  DATA    │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘  │
│       │              │              │              │        │
│  • Bearer Token  • Device ID    • IP allow     • RBAC       │
│  • MFA TOTP      • Fingerprint  • TLS 1.3     • ABAC       │
│  • OAuth2        • Binding      • Encrypted    • Audit      │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Security Controls

| Control | Implementation | Scope |
|---|---|---|
| **Authentication** | Bearer token + MFA TOTP + OAuth (Google, GitHub) + biometric | All users |
| **Authorization** | RBAC (5 roles) + ABAC (context-aware policies) | All API routes |
| **Encryption at Rest** | AES-256 | All databases, file storage |
| **Encryption in Transit** | TLS 1.3 | All network communication |
| **End-to-End Encryption** | Additional E2E layer for sensitive data (credentials, payments) | Sensitive flows |
| **Input Validation** | Zod schemas on all API inputs | All API routes |
| **Rate Limiting** | Per-route, per-user, per-IP sliding window | All endpoints |
| **CSRF Protection** | Token-based for all mutating requests | Web platform |
| **Audit Logging** | 100% action logging, immutable trail | All user and agent actions |
| **Secrets Management** | Environment variables, no hardcoded credentials | Entire codebase |
| **File Validation** | Type checking, size limits, path traversal prevention | File upload endpoints |
| **Session Security** | HTTP-only cookies, 30-min inactivity timeout, rotation | All sessions |
| **Prompt Injection Defense** | Input sanitization, output filtering (Security Engine) | All AI interactions |
| **Data Leak Prevention** | PII detection, redaction, access control on sensitive fields | Data layer |

---

## 9. Integration Architecture

### 9.1 Communication Integrations

| Integration | Protocol | Direction | Status |
|---|---|---|---|
| WhatsApp Business API | REST + WebSocket | Bidirectional | Active |
| Email (SMTP/IMAP) | SMTP + IMAP | Bidirectional | Active |
| Telegram Bot API | REST + WebSocket | Bidirectional | Active |
| Discord Bot API | WebSocket + REST | Bidirectional | Active |
| SMS Gateway | REST API | Outbound | Planned |

### 9.2 Payment Integrations

| Integration | Market | Protocol | Security | Status |
|---|---|---|---|---|
| bKash | Bangladesh | REST API | Encrypted | Planned |
| Nagad | Bangladesh | REST API | Encrypted | Planned |
| SSLCommerz | Bangladesh | REST API | PCI-DSS | Planned |
| Stripe | International | REST API | PCI-DSS | Planned |

### 9.3 Social Media Integrations

| Platform | Capabilities | Protocol | Status |
|---|---|---|---|
| Facebook | Posting, messaging, analytics, ads | REST + WebSocket | Active |
| Instagram | Content, stories, engagement, DMs | REST API | Active |
| LinkedIn | Professional posts, connections, jobs | REST API | Active |
| Twitter/X | Posting, replies, threads, analytics | REST API | Active |
| TikTok | Video uploads, comments, analytics | REST API | Active |
| YouTube | Video management, comments, analytics | REST API | Active |
| Pinterest | Pins, boards, analytics | REST API | Active |
| Threads | Text posts, replies, engagement | REST API | Active |

### 9.4 Productivity & Hosting Integrations

| Integration | Purpose | Protocol | Status |
|---|---|---|---|
| Google Workspace | Docs, Sheets, Calendar, Gmail | REST API (OAuth) | Planned |
| Microsoft 365 | Teams, Outlook, OneDrive, SharePoint | REST API (OAuth) | Planned |
| cPanel | Hosting control panel management | REST API (TLS) | Planned |
| Domain Registrar | Domain registration and DNS | REST API (TLS) | Planned |
| Cloud Services | AWS, GCP, Azure resources | SDK + REST | Planned |

---

## 10. Data Flow Diagrams

### 10.1 Customer Request Flow

```
Mobile App                    API Gateway                 AI Agent                  Service Layer               Data Layer
     │                             │                           │                          │                          │
     │─── POST /api/request ──────►│                           │                          │                          │
     │    {type, payload, auth}    │                           │                          │                          │
     │                             │─── Authenticate ─────────►│                          │                          │
     │                             │◄── Token Valid ───────────│                          │                          │
     │                             │                           │                          │                          │
     │                             │─── Classify & Route ────►│                          │                          │
     │                             │                           │─── Execute Task ────────►│                          │
     │                             │                           │                          │─── Query DB ────────────►│
     │                             │                           │                          │◄── Result ──────────────│
     │                             │                           │─── RAG Retrieve ────────►│                          │
     │                             │                           │                          │─── Vector Search ───────►│
     │                             │                           │◄── Context ─────────────│◄── Chunks ──────────────│
     │                             │                           │                          │                          │
     │                             │                           │─── Generate Answer ─────►│                          │
     │                             │◄── Response ─────────────│                          │                          │
     │◄── 200 JSON Response ───────│                           │                          │                          │
     │                             │                           │                          │                          │
     │─── Log to Event Bus ───────►│                           │                          │                          │
     │                             │─── Persist ───────────────────────────────────────────────────────────────►│
```

### 10.2 AI Agent Collaboration Flow

```
Task Arrival                    Classification               Selection                Execution                 Review
     │                              │                           │                          │                          │
     │─── New Task ────────────────►│                           │                          │                          │
     │                              │─── Analyze Type ────────►│                          │                          │
     │                              │─── Check Priority ──────►│                          │                          │
     │                              │─── Identify Skills ─────►│                          │                          │
     │                              │                           │                          │                          │
     │                              │                           │─── Match Agent ──────────►│                          │
     │                              │                           │    (skill + availability) │                          │
     │                              │                           │                          │                          │
     │                              │                           │                          │─── Execute ──────────────►│
     │                              │                           │                          │    (cognitive engines)    │
     │                              │                           │                          │                          │
     │                              │                           │                          │─── Self-Heal if needed ──►│
     │                              │                           │                          │◄── Result ───────────────│
     │                              │                           │                          │                          │
     │                              │                           │                          │─── Peer Review ──────────►│
     │                              │                           │                          │◄── Approved/Rejected ────│
     │                              │                           │                          │                          │
     │                              │                           │                          │─── Log & Update Metrics ─►│
     │◄── Task Complete ─────────────────────────────────────────────────────────────────────────────────────│
```

### 10.3 Payment Processing Flow

```
Initiate                      Validate                     Gateway                   Process                    Record
     │                             │                           │                          │                          │
     │─── Payment Request ────────►│                           │                          │                          │
     │   {amount, method, order}   │                           │                          │                          │
     │                             │─── Validate Amount ──────►│                          │                          │
     │                             │─── Check Method ─────────►│                          │                          │
     │                             │─── Verify Order ─────────►│                          │                          │
     │                             │◄── Valid ─────────────────│                          │                          │
     │                             │                           │                          │                          │
     │                             │─── Route to Gateway ────►│                          │                          │
     │                             │   (bKash/Nagad/Stripe)    │                          │                          │
     │                             │                           │─── Process Payment ──────►│                          │
     │                             │                           │                          │                          │
     │                             │                           │   ┌──────────┐             │                          │
     │                             │                           │   │ bKash   │             │                          │
     │                             │                           │   │ Nagad   │             │                          │
     │                             │                           │   │ Stripe  │             │                          │
     │                             │                           │   └────┬─────┘             │                          │
     │                             │                           │◄──────┘                     │                          │
     │                             │                           │                          │                          │
     │                             │◄── Transaction Result ───│                          │                          │
     │◄── Confirm/Reject ──────────│                           │                          │                          │
     │                             │                           │                          │─── Record Transaction ──►│
     │                             │                           │                          │─── Update Order Status ─►│
     │                             │                           │                          │─── Send Notification ───►│
     │                             │                           │                          │◄── Stored ───────────────│
```

### 10.4 Knowledge Learning Flow

```
Observation                 Extraction                  Validation                 Integration                Dissemination
     │                             │                           │                          │                          │
     │─── Agent Task Log ─────────►│                           │                          │                          │
     │─── User Feedback ──────────►│                           │                          │                          │
     │─── System Metrics ─────────►│                           │                          │                          │
     │─── External Data ──────────►│                           │                          │                          │
     │                             │                           │                          │                          │
     │                             │─── Pattern Extraction ──►│                          │                          │
     │                             │─── Correlation Analysis ►│                          │                          │
     │                             │─── Knowledge Distillation►│                          │                          │
     │                             │                           │                          │                          │
     │                             │                           │─── Rule Check ──────────►│                          │
     │                             │                           │─── Conflict Detection ──►│                          │
     │                             │                           │─── Quality Score ───────►│                          │
     │                             │                           │◄── Validated ───────────│                          │
     │                             │                           │                          │                          │
     │                             │                           │                          │─── Store in Knowledge ──►│
     │                             │                           │                          │─── Update Vectors ──────►│
     │                             │                           │                          │─── Update Graph ────────►│
     │                             │                           │                          │◄── Indexed ─────────────│                          │
     │                             │                           │                          │                          │
     │                             │                           │                          │─── Notify Agents ───────►│
     │                             │                           │                          │─── Update RAG Index ────►│
     │◄── Knowledge Available ──────────────────────────────────────────────────────────────────────────────────│
```

### 10.5 Security Event Flow

```
Detection                   Classification               Response                   Notification               Audit
     │                             │                           │                          │                          │
     │─── Anomaly Detected ───────►│                           │                          │                          │
     │─── Rule Violation ─────────►│                           │                          │                          │
     │─── Auth Failure ───────────►│                           │                          │                          │
     │─── Rate Limit Hit ─────────►│                           │                          │                          │
     │                             │                           │                          │                          │
     │                             │─── Severity Assessment ─►│                          │                          │
     │                             │   P0: Critical            │                          │                          │
     │                             │   P1: High                │                          │                          │
     │                             │   P2: Medium              │                          │                          │
     │                             │   P3: Low                 │                          │                          │
     │                             │                           │                          │                          │
     │                             │                           │─── Auto-Response ───────►│                          │
     │                             │                           │   • Block IP (P0/P1)     │                          │
     │                             │                           │   • Lock Account (P0)    │                          │
     │                             │                           │   • Reset Session (P1)   │                          │
     │                             │                           │   • Flag for Review (P2) │                          │
     │                             │                           │   • Log Only (P3)        │                          │
     │                             │                           │                          │                          │
     │                             │                           │                          │─── Alert Admins ────────►│
     │                             │                           │                          │   • Push notification   │                          │
     │                             │                           │                          │   • Email alert         │                          │
     │                             │                           │                          │   • Dashboard badge     │                          │
     │                             │                           │                          │                          │
     │                             │                           │                          │                          │─── Immutable Audit ────►│
     │                             │                           │                          │                          │   • Timestamp          │                          │
     │                             │                           │                          │                          │   • Actor              │                          │
     │                             │                           │                          │                          │   • Action             │                          │
     │                             │                           │                          │                          │   • Resource           │                          │
     │                             │                           │                          │                          │   • Outcome            │                          │
     │                             │                           │                          │                          │   • Cannot be deleted  │                          │
     │◄── Event Handled ────────────────────────────────────────────────────────────────────────────────────│
```

---

## 11. Scaling Strategy

### 11.1 Horizontal Scaling

```
Current (Single Instance)          Future (Clustered)
┌──────────────────────┐           ┌──────────────────────────────────┐
│    Single Server     │           │         Load Balancer            │
│  ┌────────────────┐  │           │    ┌─────┬─────┬─────┐          │
│  │  Next.js (PM2) │  │     ═══►  │    │     │     │     │          │
│  │  Socket.io     │  │           │  ┌─▼──┐┌─▼──┐┌─▼──┐┌─▼──┐      │
│  │  PostgreSQL    │  │           │  │ S1 ││ S2 ││ S3 ││ S4 │      │
│  │  Redis         │  │           │  └────┘└────┘└────┘└────┘      │
│  │  Qdrant        │  │           │         │    │    │    │        │
│  └────────────────┘  │           │    ┌────▼────▼────▼────▼────┐   │
└──────────────────────┘           │    │   Shared Data Layer     │   │
                                  │    │   PostgreSQL (Primary +  │   │
                                  │    │   Read Replicas)        │   │
                                  │    │   Redis Cluster         │   │
                                  │    │   Qdrant Cluster        │   │
                                  │    └────────────────────────┘   │
                                  └──────────────────────────────────┘
```

- **PM2 Cluster Mode:** Multiple Node.js workers per CPU core
- **Stateless Application Layer:** Sessions in Redis, files in object storage
- **Connection Pooling:** Prisma connection pool with configurable limits

### 11.2 Vertical Scaling

- **CPU:** Scale from 4-core to 16+ cores as agent count grows
- **Memory:** 16GB minimum, scaling to 64GB+ for AI workloads
- **Storage:** SSD NVMe for database, HDD for data lake archives
- **Network:** 1Gbps minimum, 10Gbps for inter-service communication

### 11.3 Database Scaling

- **Read Replicas:** PostgreSQL read replicas for analytics queries
- **Connection Pooling:** PgBouncer for connection management
- **Partitioning:** Time-based partitioning for logs and events
- **Indexing:** Optimized indexes for common query patterns

### 11.4 CDN Strategy

- **Static Assets:** Next.js build output served via CDN
- **Media Files:** Images, videos, documents via CDN with caching
- **API Caching:** Redis-backed cache with TTL and cache-invalidation

### 11.5 Auto-Scaling Triggers

| Metric | Threshold | Action |
|---|---|---|
| CPU Usage | > 80% for 5 min | Scale up (+1 instance) |
| Memory Usage | > 85% for 5 min | Scale up (+1 instance) |
| Request Rate | > 1000 req/s | Scale up (+1 instance) |
| Response Time | P95 > 2s for 10 min | Scale up (+1 instance) |
| Queue Depth | > 1000 pending jobs | Scale workers |
| CPU Usage | < 20% for 30 min | Scale down (-1 instance) |

### 11.6 Multi-Region Strategy

```
Phase 1 (Current):          Phase 2 (Q2 2025):         Phase 3 (Q4 2025):
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  USA (Primary)  │         │  USA (Primary)  │         │  USA (Primary)  │
│  • All services │         │  • Primary DB    │         │  • Primary DB    │
│  • All data     │   ═══►  │  USA → BD sync  │   ═══►  │  USA + BD + SG   │
└─────────────────┘         │  BD (Edge)       │         │  Active-Active   │
                            │  • CDN edge      │         │  Global LB       │
                            │  • Static cache  │         │  Regional failover│
                            └─────────────────┘         └─────────────────┘
```

- **Phase 1:** Single region (USA) — current state
- **Phase 2:** Bangladesh edge node (CDN + static cache), primary DB in USA
- **Phase 3:** Multi-region active-active with global load balancing

---

## 12. Technology Decisions

### Build vs Buy Matrix

| Component | Decision | Rationale |
|---|---|---|
| Web Framework | **Build** (Next.js 16) | Already built — 514 source files, 274 API routes, 28 panels. Mature and stable. |
| Mobile Framework | **Build** (Flutter) | Single codebase for iOS + Android. Native performance. Hot reload for fast development. |
| Auth System | **Build** (NextAuth.js v4) | Already integrated with MFA TOTP + OAuth. RBAC working. 5 roles configured. |
| AI Orchestration | **Build** (Custom) | Full control over agent lifecycle, cognitive engines, and self-improvement. Uses z-ai-web-dev-sdk. |
| Vector Database | **Buy** (Qdrant) | Open source, self-hosted. Best-in-class filtering. Rust performance. Active community. |
| Cache Layer | **Buy** (Redis 6.0.16) | Industry standard. Proven at scale. Rich data structures. Pub/sub built in. |
| Payments (BD) | **Integrate** (bKash, Nagad, SSLCommerz) | Market requirement. Bangladesh mobile wallet dominance (70%+ market share). |
| Payments (Intl) | **Integrate** (Stripe) | International card payments. Excellent API, developer experience, global coverage. |
| Email | **Integrate** (SMTP/IMAP) | Already built. Universal protocol support. No vendor lock-in. |
| WhatsApp | **Integrate** (Business API) | Primary customer communication channel in Bangladesh. Already built. |
| Social Media | **Integrate** (Platform APIs) | 9 platforms. Brand management, content scheduling, analytics. Already integrated. |
| Monitoring | **Build** (Custom + PM2) | Integrated with platform. Custom dashboards. Agent-specific metrics. Cost-effective. |
| CI/CD | **Build** (Custom scripts) | Tailored to project structure. Prisma migrations, seed scripts, lint checks. |
| Containerization | **Buy** (Docker) | Industry standard. Isolated dependencies. Reproducible builds. Compose for orchestration. |
| Process Manager | **Buy** (PM2) | Battle-tested Node.js process manager. Cluster mode. Zero-downtime deploys. |
| Reverse Proxy | **Buy** (Nginx + Caddy) | Nginx for production (SSL, compression, static files). Caddy for development (auto-TLS, XTransformPort). |
| ORM | **Buy** (Prisma) | Type-safe database access. Migration management. 134 models. Excellent DX. |
| UI Components | **Buy** (shadcn/ui) | Copy-paste components. Full ownership. Tailwind CSS 4 native. No runtime dependency. |
| State Management | **Buy** (Zustand) | Lightweight. No boilerplate. TypeScript-first. Perfect for panel state. |

---

## Appendix A: System Specifications Summary

| Metric | Value |
|---|---|
| Source Files | 517+ |
| API Routes | 275+ |
| Enterprise Panels | 29+ |
| Prisma Models | 134 |
| AI Agents (designed) | 2,000 |
| Departments | 100 |
| Constitutional Rules | 500 |
| Event Types | 200+ |
| Cognitive Engines | 8 |
| External Integrations | 20 |
| Seeded Records | 103,000+ |
| Knowledge Graph Nodes | 2,500+ |
| Knowledge Graph Edges | 5,000+ |
| Data Lake Entries | 15,000+ |
| Mobile Apps | 4 (Flutter) |
| RBAC Roles | 5 |
| Payment Gateways | 4 |
| Social Platforms | 9 |

---

*Document generated as part of ALO Labs AI-EOS Master Build — Deliverable 2 of 10.*
