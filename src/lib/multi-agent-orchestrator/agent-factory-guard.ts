/**
 * Guard rails for dynamic agent creation.
 *
 * The agent factory route previously accepted any authenticated session and let
 * the caller choose arbitrary `tools`, `skills` and `permissions`, creating a
 * persisted `Agent` row with no owning tenant. That is a privilege-escalation
 * path: a standard user could mint an agent granted tools they cannot call
 * themselves, and the row belonged to nobody.
 *
 * These checks are pure so they can be unit-tested and reused by the route and
 * the factory itself. Anything not listed here is denied by the caller.
 */

import { listToolDefinitions } from '@/lib/tools/registry';

/** Company roles permitted to create an agent inside their own organisation. */
export const AGENT_FACTORY_ROLES = ['owner', 'admin', 'manager'] as const;

export interface AgentFactoryScopeInput {
  /** Effective company role, resolved server-side (never from the request body). */
  companyRole: string | null | undefined;
  /** Platform role, resolved server-side. */
  platformRole: string | null | undefined;
  callerCompanyId: string | null | undefined;
  departmentCompanyId: string | null | undefined;
  requestedTools: string[];
  requestedSkills: string[];
  requestedPermissions: string[];
  expirationMinutes?: number;
  budgetLimit?: number;
}

export interface AgentFactoryScopeResult {
  ok: boolean;
  errors: string[];
  /** Maximum temporary agents a tenant may hold, enforced by the factory too. */
  maxTemporaryAgents: number;
}

export const MAX_TEMPORARY_AGENTS_PER_COMPANY = 25;
export const MAX_TEMPORARY_AGENT_MINUTES = 24 * 60;
export const DEFAULT_TEMPORARY_AGENT_MINUTES = 8 * 60;

export function validateAgentFactoryScope(input: AgentFactoryScopeInput): AgentFactoryScopeResult {
  const errors: string[] = [];
  const registeredTools = new Set(listToolDefinitions().map((tool) => tool.name));
  const isPlatformAdmin = input.platformRole === 'super_admin' || input.platformRole === 'admin';

  if (!input.callerCompanyId && !isPlatformAdmin) {
    errors.push('An organisation context is required to create an agent.');
  }
  if (!isPlatformAdmin && !AGENT_FACTORY_ROLES.includes(input.companyRole as (typeof AGENT_FACTORY_ROLES)[number])) {
    errors.push('Only an organisation owner, admin or manager may create an agent.');
  }
  if (
    input.departmentCompanyId &&
    input.callerCompanyId &&
    input.departmentCompanyId !== input.callerCompanyId &&
    !isPlatformAdmin
  ) {
    errors.push('The department belongs to a different organisation.');
  }

  const unknownTools = input.requestedTools.filter((tool) => !registeredTools.has(tool));
  if (unknownTools.length) {
    errors.push(`Unknown tools requested: ${unknownTools.join(', ')}.`);
  }

  // Permissions are not declarative text: only registered tool names may be
  // granted, so a caller cannot invent a capability with a `permissions` entry.
  const unknownPermissions = input.requestedPermissions.filter((permission) => !registeredTools.has(permission));
  if (unknownPermissions.length) {
    errors.push(`Unknown permission resources: ${unknownPermissions.join(', ')}.`);
  }

  if (input.requestedSkills.length > 50) errors.push('At most 50 skills may be attached to one agent.');
  if (input.budgetLimit !== undefined && (input.budgetLimit < 0 || input.budgetLimit > 1000)) {
    errors.push('budgetLimit must be between 0 and 1000.');
  }
  if (input.expirationMinutes !== undefined) {
    if (input.expirationMinutes < 1) errors.push('expirationMinutes must be at least 1.');
    if (input.expirationMinutes > MAX_TEMPORARY_AGENT_MINUTES) {
      errors.push(`expirationMinutes cannot exceed ${MAX_TEMPORARY_AGENT_MINUTES} (24 hours) for a temporary agent.`);
    }
  }

  return { ok: errors.length === 0, errors, maxTemporaryAgents: MAX_TEMPORARY_AGENTS_PER_COMPANY };
}
