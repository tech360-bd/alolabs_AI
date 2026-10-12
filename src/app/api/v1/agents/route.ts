import { z } from 'zod';
import { v1Handler, v1Body, v1Pagination, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/agents — list agents available to the tenant (GET) or register one (POST).
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const departmentId = request.nextUrl.searchParams.get('departmentId') ?? undefined;
  const status = request.nextUrl.searchParams.get('status') ?? 'active';

  const where = {
    status,
    agentCompanyAccess: { some: { companyId: identity.companyId } },
    ...(departmentId ? { departmentId } : {}),
  };

  const [agents, total] = await Promise.all([
    db.agent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true, agentId: true, name: true, slug: true, role: true, type: true,
        departmentId: true, departmentName: true, purpose: true, status: true,
        version: true, allowedSkills: true, allowedTools: true, createdAt: true, updatedAt: true,
      },
    }),
    db.agent.count({ where }),
  ]);
  return { agents, total, limit, offset };
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
  const body = await v1Body<unknown>(request);
  const parsed = CreateAgentSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  const { randomUUID } = await import('node:crypto');
  const agentId = `AGENT-${randomUUID().slice(0, 4).toUpperCase()}`;
  const agent = await db.agent.create({
    data: {
      id: randomUUID(),
      agentId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      departmentId: parsed.data.departmentId,
      departmentName: parsed.data.departmentName,
      purpose: parsed.data.purpose,
      role: parsed.data.role ?? 'specialist',
      type: parsed.data.type ?? 'specialist',
      allowedSkills: JSON.stringify(parsed.data.allowedSkills ?? []),
      allowedTools: JSON.stringify(parsed.data.allowedTools ?? []),
      status: 'active',
    },
  });

  // Grant the creating company access
  await db.agentCompanyAccess.create({
    data: { id: randomUUID(), agentId: agent.id, companyId: identity.companyId },
  }).catch(() => { /* may already exist */ });

  return { agentId: agent.agentId, id: agent.id, name: agent.name, status: agent.status };
});
