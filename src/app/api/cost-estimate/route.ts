import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { verifySessionToken } = await import('@/lib/auth');
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    const costEstimates = await db.costEstimate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json(costEstimates)
  } catch (error) {
    console.error('[Cost Estimate List] Error:', error)
    return NextResponse.json(
      { error: 'Failed to list cost estimates' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { verifySessionToken } = await import('@/lib/auth');
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    const body = await request.json()
    const { companyId, provider, modelOrService, estimatedUnits, estimatedCost, reasonNeeded, localAlternative } = body

    if (!provider || !modelOrService) {
      return NextResponse.json(
        { error: 'provider and modelOrService are required' },
        { status: 400 }
      )
    }

    const costEstimate = await db.costEstimate.create({
      data: {
        companyId: companyId || null,
        provider,
        modelOrService,
        estimatedUnits: estimatedUnits ?? 0,
        estimatedCost: estimatedCost ?? 0,
        reasonNeeded: reasonNeeded || null,
        localAlternative: localAlternative || null,
      },
    })

    return NextResponse.json(costEstimate, { status: 201 })
  } catch (error) {
    console.error('[Cost Estimate Create] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create cost estimate' },
      { status: 500 }
    )
  }
}