import { v1Handler, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';
import { agentCompanyScope } from '@/lib/agent-access';
import { sanitizePublic } from '@/lib/api/public-response';

/**
 * /api/v1/agents/:id — get one agent (by agentId like AGENT-0001 or db id).
 *
 * P0-C FIX: previously returned the FULL Agent row including systemInstructions
 * (the prompt) and runtimeProfile (model config, knowledge scope, memory
 * policy, resource limits). Now returns a sanitized public projection that
 * omits prompts, model routing, tool definitions, and internal config.
 *
 * Internal operators (super_admin/admin session) still receive the full row
 * via the internal control-plane routes (/api/agents/**), not via /v1/*.
 */

// Public-safe fields only. No systemInstructions, no runtimeProfile, no
// allowedSkills/allowedTools (those are internal workforce config), no
// evaluation fields.
const PUBLIC_AGENT_FIELDS = {
  id: true,
  agentId: true,
  name: true,
  slug: true,
  role: true,
  type: true,
  departmentName: true,
  purpose: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const GET = v1Handler(async ({ identity }, request) => {
  const id = decodeURIComponent(request.nextUrl.pathname.split('/').pop()!);
  const agent = await db.agent.findFirst({
    where: {
      AND: [{ OR: [{ agentId: id }, { id }] }, agentCompanyScope(identity.companyId, 'view')],
    },
    select: PUBLIC_AGENT_FIELDS,
  });
  if (!agent) throw new V1Error('Agent not found', 404, 'NOT_FOUND');

  // Defense in depth: sanitize as a safety net even though we used `select`.
  return sanitizePublic(agent);
});
