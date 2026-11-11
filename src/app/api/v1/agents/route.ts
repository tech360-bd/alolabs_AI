import { z } from 'zod';
import { v1Handler, v1Body, v1Pagination, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';
import { agentCompanyScope } from '@/lib/agent-access';
import { sanitizePublic } from '@/lib/api/public-response';

/**
 * /api/v1/agents — list agents available to the tenant (GET) or register one (POST).
 *
 * P0-C FIX: GET no longer returns the `total` field (aggregate agent count)
 * and no longer selects internal workforce fields (allowedSkills,
 * allowedTools). Only public-safe descriptive fields are returned. The
 * response is sanitized as a defense-in-depth safety net.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const departmentId = request.nextUrl.searchParams.get('departmentId') ?? undefined;
  const status = request.nextUrl.searchParams.get('status') ?? 'active';

  const where = {
    status,
    ...agentCompanyScope(identity.companyId, 'view'),
    ...(departmentId ? { departmentId } : {}),
  };

  const agents = await db.agent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true, agentId: true, name: true, slug: true, role: true, type: true,
      departmentName: true, purpose: true, status: true,
      version: true, createdAt: true, updatedAt: true,
      // NOTE: allowedSkills, allowedTools, systemInstructions, runtimeProfile
      // are intentionally NOT selected — they are internal workforce config.
    },
  });

  // P0-C: do NOT return `total` (aggregate agent count reveals workforce size).
  // Callers that need pagination use limit/offset + a `hasMore` boolean.
  const hasMore = agents.length === limit;
  return { agents: sanitizePublic(agents), limit, offset, hasMore };
});

const CreateAgentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200),
  departmentId: z.string().min(1),
  departmentName: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(2000),
  role: z.string().trim().min(1).max(100).optional(),
  type: z.string().trim().min(1).max(100).optional(),
  allowedSkills: z.array(z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  // P0-B: Customer API keys must not create internal agents. Agent creation
  // mutates the internal workforce (role, type, allowedSkills, allowedTools,
  // status='active') — this is a control-plane operation, not a service
  // consumption. Only authenticated session users with an internal role may
  // create agents. An API key with `agents:write` scope may still list/run
  // agents, but cannot register new ones.
  if (identity.kind === 'apiKey') {
    throw new V1Error(
      'Agent registration requires an authenticated operator session. API keys may consume agent services but cannot create internal agents.',
      403,
      'FORBIDDEN',
    );
  }

  // Session users must hold an internal operator role (admin/manager/super_admin).
  // A viewer/operator session is not sufficient to register workforce agents.
  const ALLOWED_REGISTRAR_ROLES = new Set(['super_admin', 'admin', 'manager']);
  if (!ALLOWED_REGISTRAR_ROLES.has(identity.role) && !ALLOWED_REGISTRAR_ROLES.has(identity.companyRole ?? '')) {
    throw new V1Error(
      'Insufficient role to register agents. Requires admin or manager session.',
      403,
      'FORBIDDEN',
    );
  }

  const body = await v1Body<unknown>(request);
  const parsed = CreateAgentSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  // P0-B (mass-assignment guard): role/type are server-constrained, not
  // caller-supplied. A caller may suggest a department + purpose, but the
  // agent's execution privileges (role, type, allowedSkills, allowedTools,
  // status) are set by the platform, not by the request body.
  const department = await db.department.findFirst({
    where: { id: parsed.data.departmentId, companyId: identity.companyId },
    select: { id: true, name: true },
  });
  if (!department) throw new V1Error('Department not found for this company', 404, 'NOT_FOUND');

  const { randomUUID } = await import('node:crypto');
  const agentId = `AGENT-${randomUUID().slice(0, 4).toUpperCase()}`;
  const agent = await db.agent.create({
    data: {
      id: randomUUID(),
      agentId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      departmentId: parsed.data.departmentId,
      departmentName: department.name,
      purpose: parsed.data.purpose,
      companyId: identity.companyId,
      // Privilege fields are platform-controlled defaults, NOT caller-supplied.
      // A registered agent starts as 'draft' (not 'active') until reviewed.
      role: 'specialist',
      type: 'specialist',
      allowedSkills: JSON.stringify([]),
      allowedTools: JSON.stringify([]),
      status: 'draft',
    },
  });

  // Grant the creating company access
  await db.agentCompanyAccess.create({
    data: { id: randomUUID(), agentId: agent.id, companyId: identity.companyId },
  }).catch(() => { /* may already exist */ });

  // Audit the privileged workforce change.
  await db.auditLog.create({
    data: {
      action: 'agent.register',
      resource: 'Agent',
      details: JSON.stringify({
        agentId: agent.agentId,
        name: agent.name,
        companyId: identity.companyId,
        registrarUserId: identity.userId,
        registrarRole: identity.role,
      }),
      userId: identity.userId,
    },
  }).catch(() => { /* best-effort */ });

  return { agentId: agent.agentId, id: agent.id, name: agent.name, status: agent.status };
});
