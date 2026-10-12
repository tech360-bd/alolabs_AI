import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/jobs/[id] — get job details with steps
export async function GET(
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
    const { id } = await params;

    // Try workflow run first, then agent run
    const wfRun = await db.workflowRun.findUnique({
      where: { id },
      include: {
        workflow: {
          include: { workflowSteps: true },
        },
      },
    });

    if (wfRun) {
      const steps = wfRun.workflow?.workflowSteps.map((ws, idx) => ({
        id: ws.id,
        stepNumber: ws.stepNumber || idx + 1,
        action: ws.action,
        status: wfRun.status,
        output: wfRun.output,
        durationMs: wfRun.durationMs,
        createdAt: wfRun.createdAt.toISOString(),
        completedAt: wfRun.completedAt?.toISOString() ?? null,
      })) || [];

      return NextResponse.json({
        ...wfRun,
        createdAt: wfRun.createdAt.toISOString(),
        completedAt: wfRun.completedAt?.toISOString() ?? null,
        steps,
      });
    }

    // Try agent run
    const agRun = await db.agentRun.findUnique({ where: { id } });
    if (agRun) {
      return NextResponse.json({
        ...agRun,
        createdAt: agRun.createdAt.toISOString(),
        completedAt: agRun.completedAt?.toISOString() ?? null,
        steps: [],
      });
    }

    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/jobs/[id] — cancel or retry
export async function PATCH(
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
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === 'cancel') {
      // Try workflow run
      const wfRun = await db.workflowRun.findUnique({ where: { id } });
      if (wfRun && wfRun.status === 'running') {
        await db.workflowRun.update({
          where: { id },
          data: { status: 'cancelled', completedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      // Try agent run
      const agRun = await db.agentRun.findUnique({ where: { id } });
      if (agRun && agRun.status === 'running') {
        await db.agentRun.update({
          where: { id },
          data: { status: 'cancelled', completedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }
    }

    if (action === 'retry') {
      const wfRun = await db.workflowRun.findUnique({ where: { id } });
      if (wfRun && wfRun.status === 'failed') {
        await db.workflowRun.update({
          where: { id },
          data: { status: 'running', completedAt: null },
        });
        return NextResponse.json({ success: true });
      }

      const agRun = await db.agentRun.findUnique({ where: { id } });
      if (agRun && agRun.status === 'failed') {
        await db.agentRun.update({
          where: { id },
          data: { status: 'running', completedAt: null },
        });
        return NextResponse.json({ success: true });
      }
    }

    return NextResponse.json({ error: 'Job not found or action not applicable' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}