/**
 * Tool execution — shared types.
 *
 * Agents are only allowed to call tools that are (a) registered here, (b) in
 * the agent's `allowedTools`, and (c) not in its `forbiddenTools`. Nothing in
 * this package can execute a shell, write to a database, or reach an arbitrary
 * network host; every handler is a fixed, audited read-only operation.
 */

export type ToolRisk = 'low' | 'medium' | 'high';

export interface ToolContext {
  companyId: string;
  agentId?: string;
  /** Database id of the agent row (ToolRun.agentId uses it when present). */
  agentDbId?: string;
  departmentId?: string | null;
  userId?: string;
  taskId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments (passed to the model verbatim). */
  parameters: Record<string, unknown>;
  category: 'knowledge' | 'crm' | 'workforce' | 'utility';
  risk: ToolRisk;
  requiresApproval: boolean;
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}

export interface ToolAuthorisation {
  allowed: boolean;
  reason: string;
}

export interface ToolExecutionResult {
  toolName: string;
  ok: boolean;
  output: string;
  error?: string;
  blocked?: boolean;
  blockReason?: string;
  durationMs: number;
}
