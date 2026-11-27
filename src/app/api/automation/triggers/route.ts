import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || undefined
    const enabled = searchParams.get('enabled')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    const extra: Record<string, unknown> = {}
    if (type) extra.type = type
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      extra.enabled = enabled === 'true'
    }
    const where = tenantWhere(tenant, extra)

    const [triggers, total] = await Promise.all([
      db.automationTrigger.findMany({
        where,
        include: {
          actions: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              type: true,
              sortOrder: true,
              executionCount: true,
              successCount: true,
              failCount: true,
              lastExecutedAt: true,
            },
          },
          _count: {
            select: { logs: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.automationTrigger.count({ where }),
    ])

    return NextResponse.json({
      data: triggers.map((t) => ({
        ...t,
        config: JSON.parse(t.config || '{}'),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[GET /api/automation/triggers]', error)
    return NextResponse.json({ error: 'Failed to fetch triggers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const body = await request.json()
    const { name, description, type, config, enabled, companyId: requestedCompanyId, actions } = body

    if (requestedCompanyId && requestedCompanyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 })
    }

    const validTypes = ['cron', 'event', 'webhook', 'condition', 'manual']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid trigger type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    const trigger = await db.$transaction(async (tx) => {
      const created = await tx.automationTrigger.create({
        data: {
          name,
          description: description || null,
          type,
          config: JSON.stringify(config || {}),
          enabled: enabled !== false,
          companyId: tenant.companyId,
        },
      })

      if (actions && Array.isArray(actions) && actions.length > 0) {
        const validActionTypes = [
          'agent_dispatch', 'send_notification', 'create_task',
          'update_record', 'http_call', 'run_workflow', 'send_email', 'log_message',
        ]

        await tx.automationAction.createMany({
          data: actions.map((action: Record<string, unknown>, index: number) => ({
            triggerId: created.id,
            name: typeof action.name === 'string' && action.name ? action.name : `Action ${index + 1}`,
            type: validActionTypes.includes(action.type as string) ? (action.type as string) : 'log_message',
            config: JSON.stringify(action.config || {}),
            sortOrder: Number.isFinite(Number(action.sortOrder)) ? Number(action.sortOrder) : index,
            conditionType: typeof action.conditionType === 'string' && action.conditionType ? action.conditionType : 'always',
            conditionConfig: JSON.stringify(action.conditionConfig || {}),
            delaySeconds: Number.isFinite(Number(action.delaySeconds)) ? Number(action.delaySeconds) : 0,
            retryCount: Number.isFinite(Number(action.retryCount)) ? Number(action.retryCount) : 0,
            retryDelaySeconds: Number.isFinite(Number(action.retryDelaySeconds)) ? Number(action.retryDelaySeconds) : 30,
          })),
        })
      }

      return created
    })

    const fullTrigger = await db.automationTrigger.findUnique({
      where: { id: trigger.id },
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { logs: true } },
      },
    })

    return NextResponse.json({
      data: {
        ...fullTrigger,
        config: JSON.parse(fullTrigger?.config || '{}'),
        actions: (fullTrigger?.actions || []).map((a) => ({
          ...a,
          config: JSON.parse(a.config || '{}'),
          conditionConfig: JSON.parse(a.conditionConfig || '{}'),
        })),
      },
    }, { status: 201 })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[POST /api/automation/triggers]', error)
    return NextResponse.json({ error: 'Failed to create trigger' }, { status: 500 })
  }
}
