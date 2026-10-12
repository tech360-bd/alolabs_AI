/**
 * Multi-Agent Orchestrator Type Definitions
 * ALO Labs AIOS — Enterprise Multi-Agent Orchestration System
 */

export interface OrchestrationTask {
  id: string;
  type: 'sequential' | 'parallel' | 'conditional' | 'delegation' | 'aggregation' | 'voting' | 'consensus' | 'review';
  steps: OrchestrationStep[];
  input: string;
  context?: Record<string, unknown>;
  companyId: string;
  userId: string;
  departmentId?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  result?: OrchestrationResult;
  error?: string;
  parallelConfig?: Partial<ParallelExecutionConfig>;
}

export interface OrchestrationStep {
  id: string;
  agentId: string;
  task: string;
  dependsOn?: string[]; // step IDs
  condition?: string; // expression
  timeoutMs?: number;
  maxTokens?: number;
  tools?: string[];
  retryCount?: number;
  status?: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
  latencyMs?: number;
  tokensUsed?: number;
  model?: string;
  executionId?: string;
  approvalId?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface OrchestrationResult {
  finalOutput: string;
  steps: OrchestrationStep[];
  totalLatencyMs: number;
  totalTokens: number;
  costUsd: number | null;
  agentIds: string[];
  modelUsed: string[];
}

export interface ParallelExecutionConfig {
  maxConcurrency: number;
  timeoutMs: number;
  failFast: boolean;
  aggregationStrategy: 'first' | 'last' | 'voting' | 'consensus' | 'all' | 'concatenate';
}

export interface AgentFactorySpec {
  name: string;
  departmentId: string;
  role: string;
  systemPrompt: string;
  skills: string[];
  tools: string[];
  knowledge: string[];
  memoryProfile: 'none' | 'short' | 'standard' | 'long';
  modelPolicy: 'fast' | 'balanced' | 'reasoning' | 'coding' | 'vision';
  allowedProviders: string[];
  permissions: string[];
  budgetLimit: number;
  triggers?: string[];
  outputSchema?: Record<string, unknown>;
  evaluationPolicy?: string;
  expirationMinutes?: number;
}

/** Concurrency limit tiers */
export const CONCURRENCY_LIMITS = {
  global: 50,
  department: 10,
  agent: 3,
  user: 5,
} as const;

/** Priority-to-TaskPriority mapping */
export const ORCHESTRATION_PRIORITY_MAP: Record<string, 'critical' | 'high' | 'normal' | 'low'> = {
  P0: 'critical',
  P1: 'high',
  P2: 'high',
  P3: 'normal',
  P4: 'normal',
  P5: 'low',
} as const;

/** Default parallel execution config */
export const DEFAULT_PARALLEL_CONFIG: ParallelExecutionConfig = {
  maxConcurrency: 5,
  timeoutMs: 120_000,
  failFast: false,
  aggregationStrategy: 'concatenate',
};
