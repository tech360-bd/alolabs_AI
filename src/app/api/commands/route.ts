import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { parseBody, parseQuery, paginationQuery, buildWhereClause, buildOrderBy, paginatedResponse } from '@/lib/validators';

const commandCreateSchema = z.object({
  command: z.string().min(1),
  rawCommand: z.string().optional(),
});

const commandUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'blocked']).optional(),
  result: z.string().nullable().optional(),
  parsedIntent: z.string().optional(),
  detectedDept: z.string().nullable().optional(),
});

// GET /api/commands
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const parsed = parseQuery(paginationQuery, new URL(request.url).searchParams);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { page, limit, sort, order, search } = parsed.data;
    const where = buildWhereClause(['rawCommand', 'parsedIntent'], search);
    const orderBy = buildOrderBy(sort, order);

    const [commands, total] = await Promise.all([
      db.command.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.command.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(commands, page, limit, total));
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Commands GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/commands
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const parsed = parseBody(commandCreateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const rawCommand: string = parsed.data.command;
    // Use rawCommand from required 'command' field

    const lowerCmd = rawCommand.toLowerCase().trim();
    let detectedDept = '';
    let matchedWorkflow: string | null = null;
    let matchedWorkflowId: string | null = null;
    let parsedIntent = lowerCmd;

    const workflows = await db.workflow.findMany({
      where: { status: 'active' },
    });

    for (const wf of workflows) {
      let triggers: string[] = [];
      try {
        triggers = JSON.parse(wf.triggers);
      } catch {
        // ignore malformed triggers
      }
      for (const trigger of triggers) {
        if (lowerCmd.includes(trigger.toLowerCase())) {
          matchedWorkflowId = wf.id;
          matchedWorkflow = wf.name;
          parsedIntent = `Execute workflow: ${wf.name}`;
          break;
        }
      }
      if (matchedWorkflowId) break;
    }

    if (!detectedDept) {
      const depts = await db.department.findMany();
      for (const dept of depts) {
        const deptWords = dept.name.toLowerCase().split(/[\s&]+/).filter(Boolean);
        for (const word of deptWords) {
          if (word.length > 3 && lowerCmd.includes(word)) {
            detectedDept = dept.name;
            break;
          }
        }
        if (detectedDept) break;
      }
    }

    const command = await db.command.create({
      data: {
        rawCommand: rawCommand,
        parsedIntent,
        detectedDept: detectedDept || null,
        workflowId: matchedWorkflowId,
        status: 'pending',
        userId: user.userId,
      },
    });

    const task = await db.task.create({
      data: {
        title: `Command: ${rawCommand.substring(0, 100)}`,
        description: `Parsed intent: ${parsedIntent}${detectedDept ? ` | Department: ${detectedDept}` : ''}`,
        status: 'pending',
        priority: 'medium',
        commandId: command.id,
        workflowId: matchedWorkflowId,
        userId: user.userId,
      },
    });

    if (matchedWorkflowId) {
      const workflowSteps = await db.workflowStep.findMany({
        where: { workflowId: matchedWorkflowId },
      });

      if (workflowSteps.length > 0) {
        await db.taskStep.createMany({
          data: workflowSteps.map((ws) => ({
            taskId: task.id,
            stepNumber: ws.stepNumber,
            agentId: ws.agentId,
            skillId: ws.skillId,
            action: ws.action,
            input: ws.config,
            status: 'pending',
          })),
        });
        await db.command.update({
          where: { id: command.id },
          data: { status: 'processing' },
        });
      }
    }

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'commands',
        details: JSON.stringify({
          commandId: command.id,
          taskId: task.id,
          rawCommand: rawCommand.substring(0, 200),
          parsedIntent,
          detectedDept,
          matchedWorkflow,
        }),
      },
    });

    // ── AgentOS: execute the command through the Master Orchestrator ──
    // The run is durable (AgentOSRun + queue job): planning, task
    // decomposition, agent routing, execution, QC/repair and artifact
    // assembly all happen asynchronously. The command record is updated
    // by the run pipeline when it finishes.
    let runId: string | null = null;
    try {
      const { createRunFromCommand } = await import('@/lib/runs');
      const result = await createRunFromCommand(command.id);
      if (!result?.runId) throw new Error('Command could not be converted to an AgentOS run');
      runId = result.runId;
    } catch (execError) {
      // Do not claim success: the command record exists, but execution did
      // not start. Mark it blocked so the user sees the true state.
      console.error('[POST /api/commands] failed to enqueue run:', execError);
      await db.command.update({ where: { id: command.id }, data: { status: 'blocked', result: 'Execution unavailable: unable to enqueue AgentOS run.' } });
      return NextResponse.json({
        error: 'Execution unavailable: command saved but no run was queued.',
        commandId: command.id,
        taskId: task.id,
        status: 'blocked',
      }, { status: 503 });
    }

    return NextResponse.json({
      commandId: command.id,
      taskId: task.id,
      status: 'processing',
      matchedWorkflow,
      runId,
      eventsUrl: runId ? `/api/runs/${runId}/events` : null,
    }, { status: 202 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Commands POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/commands
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = parseBody(commandUpdateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { id, ...updateData } = parsed.data;

    const existing = await db.command.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (updateData.status !== undefined) {
      data.status = updateData.status;
      if (updateData.status === 'completed' || updateData.status === 'failed') {
        data.completedAt = new Date();
      }
    }
    if (updateData.result !== undefined) data.result = updateData.result;
    if (updateData.parsedIntent !== undefined) data.parsedIntent = updateData.parsedIntent;
    if (updateData.detectedDept !== undefined) data.detectedDept = updateData.detectedDept;

    const command = await db.command.update({
      where: { id },
      data,
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'commands',
        details: JSON.stringify({ commandId: id, changes: Object.keys(updateData) }),
      },
    });

    return NextResponse.json({ data: command });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Commands PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/commands
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.command.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }

    await db.command.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'commands',
        details: JSON.stringify({ commandId: id }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Commands DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
