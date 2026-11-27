import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await legacyTenant(_request)
    const { id } = await params
    const trigger = await db.automationTrigger.findFirst({
      where: tenantWhere(tenant, { id }),
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })

    if (!trigger) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        ...trigger,
        config: JSON.parse(trigger.config || '{}'),
        actions: trigger.actions.map((a) => ({
          ...a,
          config: JSON.parse(a.config || '{}'),
          conditionConfig: JSON.parse(a.conditionConfig || '{}'),
        })),
        logs: trigger.logs.map((l) => ({
          ...l,
          eventData: JSON.parse(l.eventData || '{}'),
          actionResults: JSON.parse(l.actionResults || '[]'),
        })),
      },
    })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error(`[GET /api/automation/triggers]`, error)
    return NextResponse.json({ error: 'Failed to fetch trigger' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await legacyTenant(request)
    const { id } = await params
    const body = await request.json()
    const { name, description, type, config, enabled, companyId: requestedCompanyId, actions } = body

    if (requestedCompanyId && requestedCompanyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const existing = await db.automationTrigger.findFirst({
      where: tenantWhere(tenant, { id }),
    })
    if (!existing) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 })
    }

    const trigger = await db.$transaction(async (tx) => {
      const updated = await tx.automationTrigger.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description: description || null } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(config !== undefined ? { config: JSON.stringify(config) } : {}),
          ...(enabled !== undefined ? { enabled } : {}),
          companyId: tenant.companyId,
        },
      })

      if (actions && Array.isArray(actions)) {
        const validActionTypes = [
          'agent_dispatch', 'send_notification', 'create_task',
          'update_record', 'http_call', 'run_workflow', 'send_email', 'log_message',
        ]

        const incomingIds = actions
          .filter((a: Record<string, unknown>) => a.id)
          .map((a: Record<string, unknown>) => a.id as string)

        if (incomingIds.length > 0) {
          await tx.automationAction.deleteMany({
            where: {
              triggerId: id,
              id: { notIn: incomingIds },
            },
          })
        } else {
          await tx.automationAction.deleteMany({ where: { triggerId: id } })
        }

        for (let i = 0; i < actions.length; i++) {
          const action = actions[i] as Record<string, unknown>
          const actionType = validActionTypes.includes(action.type as string)
            ? action.type as string
            : 'log_message'

          const actionData = {
            name: typeof action.name === 'string' && action.name ? action.name : `Action ${i + 1}`,
            type: actionType,
            config: JSON.stringify(action.config || {}),
            sortOrder: Number.isFinite(Number(action.sortOrder)) ? Number(action.sortOrder) : i,
            conditionType: typeof action.conditionType === 'string' && action.conditionType ? action.conditionType : 'always',
            conditionConfig: JSON.stringify(action.conditionConfig || {}),
            delaySeconds: Number.isFinite(Number(action.delaySeconds)) ? Number(action.delaySeconds) : 0,
            retryCount: Number.isFinite(Number(action.retryCount)) ? Number(action.retryCount) : 0,
            retryDelaySeconds: Number.isFinite(Number(action.retryDelaySeconds)) ? Number(action.retryDelaySeconds) : 30,
          }

          if (action.id) {
            const ownedAction = await tx.automationAction.findFirst({
              where: { id: action.id as string, triggerId: id },
              select: { id: true },
            })
            if (ownedAction) {
              await tx.automationAction.update({
                where: { id: ownedAction.id },
                data: actionData,
              })
            }
          } else {
            await tx.automationAction.create({
              data: {
                triggerId: id,
                ...actionData,
              },
            })
          }
        }
      }

      return updated
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
    })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error(`[PUT /api/automation/triggers]`, error)
    return NextResponse.json({ error: 'Failed to update trigger' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await legacyTenant(_request)
    const { id } = await params
    const existing = await db.automationTrigger.findFirst({
      where: tenantWhere(tenant, { id }),
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 })
    }

    await db.automationTrigger.delete({ where: { id } })

    return NextResponse.json({ data: { id, deleted: true } })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error(`[DELETE /api/automation/triggers]`, error)
    return NextResponse.json({ error: 'Failed to delete trigger' }, { status: 500 })
  }
}
