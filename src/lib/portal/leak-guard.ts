/**
 * Last line of defence for the client route group.
 *
 * Portal handlers build their responses from explicit allow-list mappers
 * (src/lib/portal/dto.ts), so internal fields should never be present. This
 * guard assumes a mapper might one day be wrong: every JSON body leaving
 * `/api/portal/**` is walked, and if any key names an internal concept the
 * response is replaced with a generic 500 and the event is recorded. A client
 * sees an error, never the internal value.
 */

/** Exact key names that must never appear in a client response. */
const FORBIDDEN_KEYS = new Set(
  [
    // identity of the internal workforce
    'agentId', 'agentIds', 'agentName', 'agent', 'agents', 'agentCount', 'assignedAgent', 'assignedAgents',
    'assignedAgentId', 'employeeId', 'employeeIds', 'departmentId', 'department', 'departments', 'workforce',
    // models, providers, routing
    'model', 'models', 'modelId', 'modelName', 'provider', 'providers', 'providerId', 'routing', 'failover',
    'fallbackModel', 'gateway',
    // prompts and orchestration
    'prompt', 'prompts', 'systemPrompt', 'instructions', 'systemInstructions', 'workflowId', 'workflow',
    'runId', 'taskId', 'traceId', 'stepId', 'orchestration', 'toolCalls', 'tools',
    // internal economics and telemetry
    'tokens', 'tokensUsed', 'inputTokens', 'outputTokens', 'promptTokens', 'completionTokens', 'cost',
    'costUsd', 'internalCost', 'apiUsage', 'latencyMs', 'logs',
    // internal-only columns of the client tables
    'storageKey', 'internalNotes', 'internalFulfilment', 'senderUserId', 'uploadedByUserId', 'recordedByUserId',
    'reviewedByUserId', 'respondedByUserId', 'requestedByUserId', 'createdByUserId', 'startedByUserId',
    'reviewNotes', 'reviewStatus', 'execution', 'executions',
    // credentials
    'passwordHash', 'otpSecret', 'apiKey', 'keyHash', 'secret',
    // tenancy plumbing a client has no use for
    'companyId',
  ].map((k) => k.toLowerCase()),
);

/** Returns the dotted path of the first forbidden key, or null when clean. */
export function findInternalLeak(value: unknown, path = '$', depth = 0): string | null {
  if (value === null || typeof value !== 'object' || depth > 12) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findInternalLeak(value[i], `${path}[${i}]`, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (value instanceof Date) return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return `${path}.${key}`;
    const hit = findInternalLeak(child, `${path}.${key}`, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export function isForbiddenClientKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key.toLowerCase());
}
