/**
 * Multi-Agent Orchestrator — Public API
 * Re-exports and singleton accessors for the orchestration system.
 */

// Types
export type {
  OrchestrationTask,
  OrchestrationStep,
  OrchestrationResult,
  ParallelExecutionConfig,
  AgentFactorySpec,
} from './types';

export {
  CONCURRENCY_LIMITS,
  ORCHESTRATION_PRIORITY_MAP,
  DEFAULT_PARALLEL_CONFIG,
} from './types';

// Orchestrator
export { MultiAgentOrchestrator, getOrchestrator } from './orchestrator';

// Agent Factory
export { AgentFactory, getAgentFactory } from './agent-factory';
