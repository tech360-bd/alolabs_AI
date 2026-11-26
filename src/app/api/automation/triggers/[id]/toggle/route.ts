import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await legacyTenant(_request);
  try {
    const { id } = await params
    const trigger = await db.automationTrigger.findUnique({ where: tenantWhere(tenant, { id }) })
    if (!trigger) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 })
    }

    const newEnabled = !trigger.enabled
    await db.automationTrigger.update({ where: tenantWhere(tenant, { id }),
      data: { enabled: newEnabled },
    })

    return NextResponse.json({
      data: {
        id: trigger.id,
        name: trigger.name,
        enabled: newEnabled,
        previousState: trigger.enabled,
      },
    })
  } catch (error) {
    console.error('[POST /api/automation/triggers/[id]/toggle]', error)
    return NextResponse.json({ error: 'Failed to toggle trigger' }, { status: 500 })
  }
}