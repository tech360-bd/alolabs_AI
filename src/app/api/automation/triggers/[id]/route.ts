import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = _request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params
    const trigger = await db.automationTrigger.findUnique({
      where: { id },
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
    console.error(`[GET /api/automation/triggers]`, error)
    return NextResponse.json({ error: 'Failed to fetch trigger' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params
    const body = await request.json()
    const { name, description, type, config, enabled, companyId, actions } = body

    const existing = await db.automationTrigger.findUnique({ where: { id } })
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
          ...(companyId !== undefined ? { companyId: companyId || null } : {}),
        },
      })

      // Upsert actions if provided
      if (actions && Array.isArray(actions)) {
        const validActionTypes = [
          'agent_dispatch', 'send_notification', 'create_task',
          'update_record', 'http_call', 'run_workflow', 'send_email', 'log_message',
        ]

        // Delete existing actions not in the new list
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

          if (action.id) {
            await tx.automationAction.update({
              where: { id: action.id as string },
              data: {
                name: String(action.name) || `Action ${i + 1}`,
                type: actionType,
                config: JSON.stringify(action.config || {}),
                sortOrder: Number(action.sortOrder) ?? i,
                conditionType: String(action.conditionType) || 'always',
                conditionConfig: JSON.stringify(action.conditionConfig || {}),
                delaySeconds: Number(action.delaySeconds) ?? 0,
                retryCount: Number(action.retryCount) ?? 0,
                retryDelaySeconds: Number(action.retryDelaySeconds) ?? 30,
              },
            })
          } else {
            await tx.automationAction.create({
              data: {
                triggerId: id,
                name: String(action.name) || `Action ${i + 1}`,
                type: actionType,
                config: JSON.stringify(action.config || {}),
                sortOrder: Number(action.sortOrder) ?? i,
                conditionType: String(action.conditionType) || 'always',
                conditionConfig: JSON.stringify(action.conditionConfig || {}),
                delaySeconds: Number(action.delaySeconds) ?? 0,
                retryCount: Number(action.retryCount) ?? 0,
                retryDelaySeconds: Number(action.retryDelaySeconds) ?? 30,
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
    console.error(`[PUT /api/automation/triggers/${params}]`, error)
    return NextResponse.json({ error: 'Failed to update trigger' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = _request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params
    const existing = await db.automationTrigger.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 })
    }

    // Cascade delete will handle actions and logs
    await db.automationTrigger.delete({ where: { id } })

    return NextResponse.json({ data: { id, deleted: true } })
  } catch (error) {
    console.error(`[DELETE /api/automation/triggers]`, error)
    return NextResponse.json({ error: 'Failed to delete trigger' }, { status: 500 })
  }
}