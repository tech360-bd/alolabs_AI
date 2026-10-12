import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

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
    const { companyId, command, userId, input } = body

    if (!companyId || !command) {
      return NextResponse.json(
        { error: 'companyId and command are required' },
        { status: 400 }
      )
    }

    // Validate company exists
    const company = await db.company.findUnique({
      where: { id: companyId },
    })

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }

    // Parse a simple intent from the command
    const parsedIntent = parseIntent(command)

    // Create Command record
    const cmdRecord = await db.command.create({
      data: {
        rawCommand: command,
        parsedIntent,
        userId: userId || null,
        status: 'processing',
      },
    })

    // Create Task record
    const task = await db.task.create({
      data: {
        commandId: cmdRecord.id,
        title: command.slice(0, 200),
        description: input || null,
        status: 'pending',
        userId: userId || null,
      },
    })

    // Log usage
    await db.usageLog.create({
      data: {
        companyId: company.id,
        companyName: company.name,
        userId: userId || null,
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