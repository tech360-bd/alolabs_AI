/**
 * Tool authorisation policy.
 *
 * Pure functions — no database, no I/O — so the decision can be unit-tested
 * exhaustively. The rule is deny-by-default:
 *
 *   1. the tool must exist in the registry;
 *   2. the agent must list it in `allowedTools`;
 *   3. the agent must not list it in `forbiddenTools` (forbidden wins);
 *   4. high-risk tools additionally require an approval reference.
 *
 * `*` and prefix wildcards are deliberately NOT supported: a workforce of 2,000
 * agents should not be able to inherit a blanket grant by accident.
 */

import type { ToolAuthorisation, ToolDefinition } from './types';

export function parseToolList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    }
  } catch {
    // Fall through to the pipe/comma form used by the workforce CSVs.
  }
  return trimmed
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface AgentToolPermissions {
  allowedTools: unknown;
  forbiddenTools: unknown;
}

export function authoriseTool(
  tool: Pick<ToolDefinition, 'name' | 'risk' | 'requiresApproval'> | undefined,
  permissions: AgentToolPermissions,
  options: { approvalId?: string | null } = {},
): ToolAuthorisation {
  if (!tool) {
    return { allowed: false, reason: 'Tool is not registered' };
  }

  const allowed = parseToolList(permissions.allowedTools);
  const forbidden = parseToolList(permissions.forbiddenTools);

  if (forbidden.includes(tool.name)) {
    return { allowed: false, reason: `Tool "${tool.name}" is explicitly forbidden for this agent` };
  }
  if (!allowed.includes(tool.name)) {
    return { allowed: false, reason: `Tool "${tool.name}" is not in this agent's allowed tools` };
  }
  if ((tool.risk === 'high' || tool.requiresApproval) && !options.approvalId) {
    return { allowed: false, reason: `Tool "${tool.name}" requires human approval before execution` };
  }

  return { allowed: true, reason: 'Allowed' };
}
