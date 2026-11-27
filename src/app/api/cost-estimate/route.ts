import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const costEstimates = await db.costEstimate.findMany({
      where: tenantWhere(tenant),
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json(costEstimates)
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[Cost Estimate List] Error:', error)
    return NextResponse.json(
      { error: 'Failed to list cost estimates' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const body = await request.json()
    const { companyId: requestedCompanyId, provider, modelOrService, estimatedUnits, estimatedCost, reasonNeeded, localAlternative } = body

    if (requestedCompanyId && requestedCompanyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!provider || !modelOrService) {
      return NextResponse.json(
        { error: 'provider and modelOrService are required' },
        { status: 400 }
      )
    }

    const costEstimate = await db.costEstimate.create({
      data: {
        companyId: tenant.companyId,
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
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[Cost Estimate Create] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create cost estimate' },
      { status: 500 }
    )
  }
}
