/**
 * Public response sanitization layer.
 *
 * The public service plane (/v1/ai/**, customer portal) must NEVER disclose
 * internal workforce identifiers, prompts, model names, routing decisions,
 * tool registry, orchestration traces, or private infrastructure.
 *
 * Three response contracts:
 *  1. Public service APIs  — sanitized DTOs, opaque IDs only.
 *  2. Customer portal APIs — tenant-scoped, sanitized.
 *  3. Internal control-plane APIs — unrestricted (Super Admin only).
 *
 * This module provides:
 *  - `publicTaskResponse()` — the canonical public task shape.
 *  - `sanitizePublic()` — recursively strips known-leaky fields.
 *  - `safePublicError()` — safe error message for public consumers.
 *
 * P0-C: closes the information-disclosure gaps identified in PR #29 review.
 */

export interface PublicTaskResponse {
  success: true;
  request_id: string;
  task_id: string;
  service: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: {
    summary?: string;
    output?: unknown;
    recommendations?: string[];
    citations?: Array<{ label: string; ref: string }>;
  };
  usage: {
    units: number;
  };
  created_at: string;
  completed_at?: string;
}

/** Fields that must never appear in a public/portal response. */
const LEAKY_FIELDS = new Set([
  // Agent / workforce identifiers
  'agentId', 'agentName', 'agent_id', 'agent_name',
  'systemInstructions', 'system_instructions', 'prompt', 'systemPrompt',
  'runtimeProfile', 'runtime_profile', 'modelConfig', 'model_config',
  'allowedSkills', 'allowed_skills', 'allowedTools', 'allowed_tools',
  'toolPermissions', 'tool_permissions',
  'departmentId', 'department_id', 'departmentName', 'department_name',
  'riskLevel', 'risk_level', 'budget', 'concurrency', 'approvalPolicy',
  // Model / provider internals
  'model', 'modelName', 'model_name', 'provider', 'providerName',
  'modelId', 'model_id', 'providerId', 'provider_id',
  'routing', 'routingDecision', 'routing_decision',
  'tokens', 'tokensIn', 'tokensOut', 'latencyMs', 'latency_ms',
  // Orchestration traces
  'runId', 'run_id', 'events', 'trace', 'traceId', 'trace_id',
  'orchestrationLog', 'reasoning', 'chainOfThought', 'chain_of_thought',
  'heuristicValidationScore', 'securityValidationPassed',
  // Internal tool registry
  'toolRegistry', 'tool_registry', 'toolDefinitions', 'tool_definitions',
  // Infrastructure
  'databaseId', 'database_id', 'internalUrl', 'internal_url',
  'host', 'hostname', 'port', 'ipAddress', 'ip_address',
  'stack', 'stackTrace', 'stack_trace', 'error', 'exception',
  // Secrets
  'apiKey', 'api_key', 'secret', 'password', 'token', 'credential',
  'keyHash', 'key_hash', 'previousKeyHash', 'previous_key_hash',
  // Aggregate counts that reveal workforce size
  'totalAgents', 'total_agents', 'agentCount', 'agent_count',
  'workforceSize', 'workforce_size', 'departmentCount', 'department_count',
]);

/** Fields that ARE safe to expose in public responses (allowlist for task results). */
const SAFE_RESULT_FIELDS = new Set([
  'summary', 'output', 'recommendations', 'citations',
  'label', 'ref', 'confidence', 'limitations',
]);

/**
 * Recursively strip leaky fields from an arbitrary object.
 * Used as a safety net — primary defense is allowlisted DTOs.
 */
export function sanitizePublic<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizePublic) as unknown as T;
  if (typeof value === 'object' && !(value instanceof Date) && !(value instanceof Error)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (LEAKY_FIELDS.has(key)) continue;
      out[key] = sanitizePublic(val);
    }
    return out as T;
  }
  return value;
}

/**
 * Canonical public task response. Opaque task_id, no agent/model/internal details.
 */
export function publicTaskResponse(input: {
  requestId: string;
  taskId: string;
  service: string;
  status: PublicTaskResponse['status'];
  result?: PublicTaskResponse['result'];
  usageUnits: number;
  createdAt: string;
  completedAt?: string;
}): PublicTaskResponse {
  return {
    success: true,
    request_id: input.requestId,
    task_id: input.taskId,
    service: input.service,
    status: input.status,
    ...(input.result
      ? {
          result: {
            ...(input.result.summary ? { summary: input.result.summary } : {}),
            ...(input.result.output !== undefined
              ? { output: sanitizePublic(input.result.output) }
              : {}),
            ...(input.result.recommendations
              ? { recommendations: input.result.recommendations }
              : {}),
            ...(input.result.citations ? { citations: input.result.citations } : {}),
          },
        }
      : {}),
    usage: { units: input.usageUnits },
    created_at: input.createdAt,
    ...(input.completedAt ? { completed_at: input.completedAt } : {}),
  };
}

/**
 * Safe error message for public consumers. Never includes stack traces,
 * SQL, file paths, hostnames, or provider exceptions.
 */
export function safePublicError(message?: string): { success: false; error: { code: string; message: string } } {
  const SAFE_MESSAGES: Record<string, string> = {
    UNAUTHORIZED: 'Authentication required.',
    FORBIDDEN: 'You do not have access to this resource.',
    NOT_FOUND: 'The requested resource was not found.',
    RATE_LIMITED: 'Too many requests. Please slow down.',
    QUOTA_EXCEEDED: 'Usage quota exceeded.',
    ENTITLEMENT_REQUIRED: 'This service is not enabled for your account.',
    VALIDATION_ERROR: 'The request was invalid.',
    INTERNAL_ERROR: 'Service temporarily unavailable.',
    CONFLICT: 'The request conflicts with the current state.',
  };
  const code = message && SAFE_MESSAGES[message] ? message : 'INTERNAL_ERROR';
  return {
    success: false,
    error: {
      code,
      message: SAFE_MESSAGES[code] ?? SAFE_MESSAGES.INTERNAL_ERROR,
    },
  };
}

/**
 * Check whether a value would leak internal information if serialized.
 * Used in tests to fuzz public responses.
 */
export function containsLeakyFields(value: unknown, depth = 0): string[] {
  if (depth > 10) return [];
  const found: string[] = [];
  if (value === null || value === undefined) return found;
  if (Array.isArray(value)) {
    for (const item of value) found.push(...containsLeakyFields(item, depth + 1));
    return found;
  }
  if (typeof value === 'object' && !(value instanceof Date) && !(value instanceof Error)) {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (LEAKY_FIELDS.has(key)) found.push(key);
      found.push(...containsLeakyFields(val, depth + 1));
    }
  }
  return found;
}
