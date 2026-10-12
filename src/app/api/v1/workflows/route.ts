import { z } from 'zod';
import { v1Handler, v1Body, v1Pagination, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/workflows — list workflows (GET) or create one (POST).
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const status = request.nextUrl.searchParams.get('status') ?? undefined;

  const where = {
    ...(status ? { status } : {}),
    workflowPermissions: { some: { companyId: identity.companyId } },
  };

  const [workflows, total] = await Promise.all([
    db.workflow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { workflowSteps: { orderBy: { stepNumber: 'asc' } } },
    }),
    db.workflow.count({ where }),
  ]);
  return { workflows, total, limit, offset };
});

const CreateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  triggers: z.array(z.string()).optional(),
  steps: z.array(z.object({
    stepNumber: z.number().int().positive(),
    action: z.string().trim().min(1).max(300),
    agentId: z.string().min(1).optional(),
    skillId: z.string().min(1).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<unknown>(request);
  const parsed = CreateWorkflowSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  const { randomUUID } = await import('node:crypto');
  const workflow = await db.workflow.create({
    data: {
      id: randomUUID(),
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? '',
      triggers: JSON.stringify(parsed.data.triggers ?? []),
      status: 'active',
      ...(parsed.data.steps
        ? {
            workflowSteps: {
              create: parsed.data.steps.map((step) => ({
                id: randomUUID(),
                stepNumber: step.stepNumber,
                action: step.action,
                ...(step.agentId ? { agentId: step.agentId } : {}),
                ...(step.skillId ? { skillId: step.skillId } : {}),
                config: JSON.stringify(step.config ?? {}),
              })),
            },
          }
        : {}),
    },
    include: { workflowSteps: true },
  });

  await db.workflowPermission.create({
    data: { id: randomUUID(), workflowId: workflow.id, companyId: identity.companyId },
  }).catch(() => { /* may already exist */ });

  return { id: workflow.id, name: workflow.name, slug: workflow.slug, status: workflow.status, steps: workflow.workflowSteps.length };
});
