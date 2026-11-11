import { z } from 'zod';
import { db } from '@/lib/db';
import { jsonResponse, secureRoute } from '@/lib/api/secure-route';

/**
 * crm.pipelines — authenticated, authorised, tenant-scoped, audited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope: any authenticated user could
 * read every company's pipelines and create pipelines with global
 * "isDefault" semantics. Pipelines with stages/enrichment are hand-assembled
 * on `secureRoute` (plain `secureCrud` cannot express the create side
 * effects); the guard is identical.
 */

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#3B82F6', sortOrder: 0, probability: 10 },
  { name: 'Qualified', color: '#06B6D4', sortOrder: 1, probability: 25 },
  { name: 'Proposal', color: '#F59E0B', sortOrder: 2, probability: 50 },
  { name: 'Negotiation', color: '#F97316', sortOrder: 3, probability: 75 },
  { name: 'Closed Won', color: '#22C55E', sortOrder: 4, probability: 100 },
  { name: 'Closed Lost', color: '#EF4444', sortOrder: 5, probability: 0 },
];

const createSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
});

const WRITE_ROLES = ['super_admin', 'admin', 'manager', 'operator'] as const;

export const GET = secureRoute(
  { resource: 'crm.pipelines', action: 'read' },
  async (context) => {
    const pipelines = await db.crmPipeline.findMany({
      where: context.tenantWhere({ status: 'active' }),
      include: {
        stages: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { deals: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Add deal counts per stage and total value (deals of this tenant's
    // pipelines are themselves tenant-scoped at write time).
    const enriched = await Promise.all(
      pipelines.map(async (p) => {
        const stageData = await Promise.all(
          p.stages.map(async (s) => {
            const dealCount = await db.crmDeal.count({ where: { pipelineId: p.id, stageId: s.id } });
            const deals = await db.crmDeal.findMany({ where: { pipelineId: p.id, stageId: s.id } });
            const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
            return { ...s, dealCount, totalValue };
          }),
        );
        const allDeals = await db.crmDeal.findMany({ where: { pipelineId: p.id, status: 'active' } });
        const totalValue = allDeals.reduce((sum, d) => sum + d.value, 0);
        return { ...p, stages: stageData, totalValue };
      }),
    );

    return jsonResponse({ data: enriched }, context.requestId);
  },
);

export const POST = secureRoute(
  { resource: 'crm.pipelines', action: 'create', roles: WRITE_ROLES, body: createSchema },
  async (context) => {
    const { name, description } = context.body;

    // "First pipeline becomes default" — per tenant, not global.
    const count = await db.crmPipeline.count({ where: context.tenantWhere() });
    const pipeline = await db.crmPipeline.create({
      data: {
        name,
        description: description || null,
        isDefault: count === 0,
        sortOrder: count,
        status: 'active',
        companyId: context.companyId,
      },
    });

    await db.crmPipelineStage.createMany({
      data: DEFAULT_STAGES.map((s) => ({
        pipelineId: pipeline.id,
        name: s.name,
        color: s.color,
        sortOrder: s.sortOrder,
        probability: s.probability,
      })),
    });

    const stages = await db.crmPipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { sortOrder: 'asc' },
    });

    return jsonResponse({ data: { ...pipeline, stages } }, context.requestId, 201);
  },
);

// PUT/DELETE on the collection route were never part of the contract; exported
// as explicit 405s so nothing silently treats them as authenticated endpoints.
import { NextResponse } from 'next/server';
async function methodNotAllowed() {
  return NextResponse.json({ error: 'Method not allowed on /api/crm/pipelines' }, { status: 405 });
}
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
