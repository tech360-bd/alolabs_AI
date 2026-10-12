import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#3B82F6', sortOrder: 0, probability: 10 },
  { name: 'Qualified', color: '#06B6D4', sortOrder: 1, probability: 25 },
  { name: 'Proposal', color: '#F59E0B', sortOrder: 2, probability: 50 },
  { name: 'Negotiation', color: '#F97316', sortOrder: 3, probability: 75 },
  { name: 'Closed Won', color: '#22C55E', sortOrder: 4, probability: 100 },
  { name: 'Closed Lost', color: '#EF4444', sortOrder: 5, probability: 0 },
]

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const pipelines = await db.crmPipeline.findMany({
      where: { status: 'active' },
      include: {
        stages: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { deals: true } },
      },
      orderBy: { sortOrder: 'asc' },
    })

    // Add deal counts per stage and total value
    const enriched = await Promise.all(
      pipelines.map(async (p) => {
        const stageData = await Promise.all(
          p.stages.map(async (s) => {
            const dealCount = await db.crmDeal.count({ where: { pipelineId: p.id, stageId: s.id } })
            const deals = await db.crmDeal.findMany({ where: { pipelineId: p.id, stageId: s.id } })
            const totalValue = deals.reduce((sum, d) => sum + d.value, 0)
            return { ...s, dealCount, totalValue }
          })
        )
        const allDeals = await db.crmDeal.findMany({ where: { pipelineId: p.id, status: 'active' } })
        const totalValue = allDeals.reduce((sum, d) => sum + d.value, 0)
        return { ...p, stages: stageData, totalValue }
      })
    )

    return NextResponse.json({ data: enriched })
  } catch (error) {
    console.error('[CRM Pipelines GET]', error)
    return NextResponse.json({ error: 'Failed to fetch pipelines' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const count = await db.crmPipeline.count()
    const pipeline = await db.crmPipeline.create({
      data: {
        name,
        description: description || null,
        isDefault: count === 0,
        sortOrder: count,
        status: 'active',
      },
    })

    // Create default stages
    await db.crmPipelineStage.createMany({
      data: DEFAULT_STAGES.map((s) => ({
        pipelineId: pipeline.id,
        name: s.name,
        color: s.color,
        sortOrder: s.sortOrder,
        probability: s.probability,
      })),
    })

    const stages = await db.crmPipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ data: { ...pipeline, stages } }, { status: 201 })
  } catch (error) {
    console.error('[CRM Pipelines POST]', error)
    return NextResponse.json({ error: 'Failed to create pipeline' }, { status: 500 })
  }
}