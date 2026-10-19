/**
 * Builds the tenant ownership/sharing filter for an agent lookup.
 *
 * Ownership grants access in the owning company. A shared agent must have an
 * explicit AgentCompanyAccess row, and only executable grants can authorize a
 * run; read-only sharing is deliberately insufficient for execution.
 */
export const AGENT_EXECUTION_ACCESS_LEVELS = ['execute', 'full'] as const;

export function agentCompanyScope(companyId: string, mode: 'view' | 'execute' = 'execute') {
  const accessLevels = mode === 'execute'
    ? [...AGENT_EXECUTION_ACCESS_LEVELS]
    : ['read', 'write', ...AGENT_EXECUTION_ACCESS_LEVELS];

  return {
    OR: [
      { companyId },
      {
        agentCompanyAccess: {
          some: {
            companyId,
            accessLevel: { in: accessLevels },
          },
        },
      },
    ],
  };
}
