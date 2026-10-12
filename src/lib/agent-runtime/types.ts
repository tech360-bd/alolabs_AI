/**
 * Agent Runtime Type Definitions
 * ALO Labs AISMH — Enterprise Agent Execution System
 */

// ─── Agent Status ─────────────────────────────────────────────────

export type AgentStatus =
  | 'created'
  | 'initializing'
  | 'ready'
  | 'running'
  | 'degraded'
  | 'waiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'archived';

export type AgentTier = 'ceo' | 'director' | 'manager' | 'worker';

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ExecutionMode = 'sync' | 'async' | 'streaming';

// ─── Agent Task ────────────────────────────────────────────────────

export interface AgentTask {
  id: string;
  agentId: string;
  companyId: string;
  userId: string;
  instanceId?: string;
  approvalExecutionId?: string;
  approvalId?: string;
  riskScore?: number;
  securityFlags?: string[];
  parentTaskId?: string;
  tier: AgentTier;
  priority: TaskPriority;
  riskLevel: RiskLevel;
  status: AgentStatus;
  mode: ExecutionMode;
  input: string;
  context?: Record<string, unknown>;
  systemPrompt?: string;
  tools?: string[];
  delegatedTo?: string[];
  approvedBy?: string;
  maxTokens?: number;
  timeoutMs?: number;
  result?: ExecutionResult;
  error?: ExecutionError;
  tokenUsage?: TokenUsage;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Execution Result ───────────────────────────────────────────────

export interface ExecutionResult {
  content: string;
  toolCalls?: ToolCallResult[];
  delegations?: DelegationResult[];
  /** Provider confidence is optional; the runtime does not synthesize it. */
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  success: boolean;
  latencyMs: number;
}

export interface DelegationResult {
  targetAgentId: string;
  task: string;
  result: ExecutionResult;
  latencyMs: number;
}

export interface ExecutionError {
  code: string;
  message: string;
  retryable: boolean;
  attempts: number;
  maxRetries: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Only populated when the provider reports a real charge. */
  costUsd?: number;
}

// ─── Resource Limits ────────────────────────────────────────────────

export interface ResourceLimits {
  maxConcurrentPerAgent: number;
  maxConcurrentPerCompany: number;
  maxTokensPerMinute: number;
  maxTokensPerDay: number;
  maxExecutionTimeMs: number;
  maxRetries: number;
  maxDelegationDepth: number;
}

export interface ResourceUsage {
  activeExecutions: number;
  tokensThisMinute: number;
  tokensToday: number;
  queueDepth: number;
}

// ─── Health ─────────────────────────────────────────────────────────

export interface AgentHealthSnapshot {
  agentId: string;
  status: AgentStatus;
  healthScore: number;
  successRate: number;
  avgLatencyMs: number;
  errorRate: number;
  totalExecutions: number;
  lastExecutionAt?: Date;
  lastErrorAt?: Date;
  consecutiveFailures: number;
  isDegraded: boolean;
}

// ─── State Transition ───────────────────────────────────────────────

export interface StateTransition {
  from: AgentStatus;
  to: AgentStatus;
  taskId: string;
  agentId: string;
  reason: string;
  timestamp: Date;
}

const VALID_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  created: ['initializing', 'ready', 'running', 'archived'],
  initializing: ['ready', 'running', 'failed', 'archived'],
  ready: ['running', 'degraded', 'archived'],
  running: ['completed', 'failed', 'timed_out', 'waiting_approval', 'paused', 'degraded'],
  degraded: ['running', 'ready', 'failed', 'archived'],
  waiting_approval: ['running', 'completed', 'failed'],
  paused: ['running', 'failed', 'archived'],
  completed: ['archived'],
  failed: ['ready', 'archived'],
  timed_out: ['ready', 'archived'],
  archived: [],
};

export function isValidTransition(from: AgentStatus, to: AgentStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Schedule ───────────────────────────────────────────────────────

export interface AgentSchedule {
  id: string;
  agentId: string;
  companyId: string;
  task: string;
  cron?: string;
  intervalMs?: number;
  runAt?: Date;
  priority: TaskPriority;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  totalRuns: number;
  failureCount: number;
  createdAt: Date;
}

// ─── Priority Weights ────────────────────────────────────────────────

export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 1000,
  high: 100,
  normal: 10,
  low: 1,
};

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxConcurrentPerAgent: 5,
  maxConcurrentPerCompany: 50,
  maxTokensPerMinute: 100_000,
  maxTokensPerDay: 10_000_000,
  maxExecutionTimeMs: 120_000,
  maxRetries: 3,
  maxDelegationDepth: 3,
};

export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_DELEGATION_DEPTH = 3;
