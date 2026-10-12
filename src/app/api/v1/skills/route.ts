import { z } from 'zod';
import { v1Handler, v1Body, v1Pagination, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/skills — list skills (GET) or register one (POST).
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const { limit, offset } = v1Pagination(request);
  const category = request.nextUrl.searchParams.get('category') ?? undefined;
  const status = request.nextUrl.searchParams.get('status') ?? undefined;

  const where = {
    ...(status ? { status } : { status: { in: ['approved', 'active'] } }),
    skillCompanyAccess: { some: { companyId: identity.companyId } },
    ...(category ? { category } : {}),
  };

  const [skills, total] = await Promise.all([
    db.skill.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit,
      skip: offset,
    }),
    db.skill.count({ where }),
  ]);
  return { skills, total, limit, offset };
});

const CreateSkillSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  category: z.string().trim().min(1).max(100),
  instructions: z.string().max(20000).optional(),
  inputs: z.array(z.record(z.string(), z.unknown())).optional(),
  outputs: z.array(z.record(z.string(), z.unknown())).optional(),
  allowedTools: z.array(z.string()).optional(),
});

export const POST = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<unknown>(request);
  const parsed = CreateSkillSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  const { randomUUID } = await import('node:crypto');
  const categorySlug = parsed.data.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const skill = await db.skill.create({
    data: {
      id: randomUUID(),
      name: parsed.data.name,
      slug: parsed.data.slug,
      title: parsed.data.title ?? parsed.data.name,
      category: parsed.data.category,
      categorySlug,
      description: parsed.data.description ?? '',
      purpose: parsed.data.instructions ?? '',
      inputs: JSON.stringify(parsed.data.inputs ?? []),
      outputs: JSON.stringify(parsed.data.outputs ?? []),
      allowedTools: JSON.stringify(parsed.data.allowedTools ?? []),
      status: 'approved',
      version: '1.0.0',
      requiresApproval: false,
    },
  });

  await db.skillCompanyAccess.create({
    data: { id: randomUUID(), skillId: skill.id, companyId: identity.companyId },
  }).catch(() => { /* may already exist */ });

  return { id: skill.id, name: skill.name, slug: skill.slug, status: skill.status };
});
