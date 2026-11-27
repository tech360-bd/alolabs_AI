import { db } from '@/lib/db'
import { legacyTenant, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const body = await request.json()
    const { companyId: requestedCompanyId, command, input } = body

    if (requestedCompanyId && requestedCompanyId !== tenant.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!command) {
      return NextResponse.json(
        { error: 'command is required' },
        { status: 400 }
      )
    }

    const company = await db.company.findUnique({
      where: { id: tenant.companyId },
    })

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }

    const parsedIntent = parseIntent(command)

    const cmdRecord = await db.command.create({
      data: {
        rawCommand: command,
        parsedIntent,
        userId: tenant.userId,
        status: 'processing',
      },
    })

    const task = await db.task.create({
      data: {
        companyId: company.id,
        commandId: cmdRecord.id,
        title: command.slice(0, 200),
        description: input || null,
        status: 'pending',
        userId: tenant.userId,
      },
    })

    await db.usageLog.create({
      data: {
        companyId: company.id,
        companyName: company.name,
        userId: tenant.userId,
        commandId: cmdRecord.id,
        taskId: task.id,
        status: 'completed',
      },
    })

    return NextResponse.json({
      taskId: task.id,
      status: 'pending',
      message: 'Command received and task created successfully',
    })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[Company Command] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process command' },
      { status: 500 }
    )
  }
}

function parseIntent(command: string): string {
  const lower = command.toLowerCase()
  if (lower.includes('generate') || lower.includes('create') || lower.includes('build')) {
    return 'create'
  }
  if (lower.includes('analyze') || lower.includes('report') || lower.includes('summarize')) {
    return 'analyze'
  }
  if (lower.includes('send') || lower.includes('notify') || lower.includes('alert')) {
    return 'notify'
  }
  if (lower.includes('search') || lower.includes('find') || lower.includes('lookup')) {
    return 'search'
  }
  if (lower.includes('update') || lower.includes('edit') || lower.includes('modify')) {
    return 'update'
  }
  if (lower.includes('delete') || lower.includes('remove')) {
    return 'delete'
  }
  return 'general'
}
