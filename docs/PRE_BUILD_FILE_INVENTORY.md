# PRE-BUILD FILE INVENTORY
Generated: 2026-08-18

## Directory Structure
- src/ — Next.js application source (573 files)
- prisma/ — Database schema (134 models, 70K+ lines)
- db/ — SQLite database (83MB, 103K+ entities)
- scripts/ — Seed and deployment scripts (143 files)
- deploy/ — Deployment configs (19 files)
- monitoring/ — Prometheus/Grafana/AlertManager (15 files)
- skills/ — AI skill modules (1079 files, 69 skills)
- mini-services/ — Realtime + Queue services (989 files)
- upload/ — Reference documents (23 files)
- __tests__/ — Test suites (38 files)
- public/ — Static assets (6 files)
- examples/ — WebSocket demo (17 files)
- docs/ — Documentation
- .github/ — CI/CD workflows (9 files)

## API Routes (274+)
- /api/ai/* — AI Gateway (NEW: chat, stream, route, batch, parallel, models, providers)
- /api/agents/* — Agent management
- /api/enterprise/* — Enterprise endpoints (agents, departments, orchestrator, agent-factory)
- /api/auth/* — Authentication
- /api/health/* — Health checks
- /api/workflows/* — Workflow management
- /api/conversations/* — Conversation management
- /api/knowledge/* — Knowledge graph
- /api/tools/* — Tool management
- /api/settings/* — System settings
- /api/departments/* — Department management
- /api/audit/* — Audit logs
- /api/datalake/* — Data lake
- /api/permissions/* — RBAC permissions
- /api/social/* — Social media integrations
- /api/email/* — Email management
- /api/whatsapp/* — WhatsApp integration
- /api/upload/* — File uploads
- /api/reports/* — Reports and analytics
- /api/webhooks/* — Webhook management
- /api/memory/* — Agent memory

## Database Models (134)
Agent, AgentPrompt, Skill, EnterpriseSOP, KnowledgeNode, KnowledgeEdge,
AgentMemory, AgentRun, Conversation, Message, Tool, WebhookConfig,
Workflow, WorkflowStep, WorkflowRun, DataLakeEntry, ProtectionLog,
AuditLog, Settings, Department, User, Company, ModelCost,
ModelRoutingPolicy, AgentPermission, ToolPermission, APIKey,
Session, MFAConfig, RBACRole, RBACPermission, RBACAssignment,
ProviderHealth, ProviderMetric, RoutingDecision, BatchJob,
BatchJobItem, ParallelJob, ParallelJobItem, OrchestratorRun,
OrchestratorStep, AgentFactoryRecord, DepartmentRegistry,
ContextTemplate, PromptTemplate, EvaluationMetric,
EvaluationRun, EvaluationResult, ApprovalRequest,
ApprovalAction, EventLog, Notification,
RateLimitRule, RateLimitEntry, SecurityEvent,
EncryptionKey, AccessToken, RefreshToken,
AgentTag, AgentGroup, AgentGroupMember,
SkillCategory, SkillVersion, SkillExecution,
WebhookDelivery, WebhookEvent,
DataLakeSchema, DataLakeColumn, DataLakeQuery,
ReportTemplate, ReportSchedule, ReportExecution,
SocialAccount, SocialPost, SocialAnalytics,
EmailTemplate, EmailCampaign, EmailSend,
WhatsAppMessage, WhatsAppTemplate,
KnowledgeSource, KnowledgeChunk, KnowledgeEmbedding,
AgentCapability, AgentConstraint, AgentBehavior,
DepartmentGoal, DepartmentMetric, DepartmentKPI,
ConversationContext, ConversationSummary,
MessageAttachment, MessageReaction,
ToolExecution, ToolResult, ToolError,
WorkflowTrigger, WorkflowCondition, WorkflowAction,
AuditEvent, AuditTarget, AuditChange,
RateLimitConfig, RateLimitBucket,
HealthCheck, HealthCheckResult,
BackupRecord, BackupRestore,
CacheEntry, CacheInvalidation,
QueueJob, QueueWorker, QueueRetry,
SearchIndex, SearchResult,
NotificationChannel, NotificationRule, NotificationDelivery,
PermissionSet, PermissionGrant,
FeatureFlag, FeatureFlagAssignment

## Key Libraries
- src/lib/ai-router/ — Multi-provider AI routing (Groq, OpenRouter, Ollama, ZAI SDK)
- src/lib/ai-gateway/ — AI Gateway with validation, cost tracking
- src/lib/agent-runtime/ — Agent execution engine with priority queues
- src/lib/multi-agent-orchestrator/ — Multi-agent orchestration
- src/lib/department-registry/ — 100-department registry
- src/lib/model-routing-policy/ — Model routing policy engine
- src/lib/context-engine.ts — Agent context builder
- src/lib/event-bus/ — Event publish/subscribe
- src/lib/approval-engine/ — Human approval workflow
- src/lib/rag-engine.ts — RAG knowledge retrieval
- src/lib/memory/ — Agent memory system
