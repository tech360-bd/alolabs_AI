import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/jobs — list jobs (workflow runs + agent runs combined)
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));

    // Fetch workflow runs and agent runs
    const [workflowRuns, agentRuns] = await Promise.all([
      db.workflowRun.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          workflow: { select: { name: true } },
        },
      }),
      db.agentRun.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Normalize into job format
    const wfJobs = workflowRuns.map((r, idx) => ({
      id: r.id,
      jobId: `WF-${String(idx + 1).padStart(5, '0')}`,
      companyId: r.companyId || '',
      companyName: r.companyId ? 'Unknown' : 'ALO Labs',
      agentName: null,
      workflowName: r.workflowName || r.workflow?.name || null,
      status: r.status,
      input: r.input,
      output: r.output,
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }));

    const agJobs = agentRuns.map((r, idx) => ({
      id: r.id,
      jobId: `AG-${String(idx + 1).padStart(5, '0')}`,
      companyId: '',
      companyName: 'ALO Labs',
      agentName: r.agentName,
      workflowName: null,
      status: r.status,
      input: r.input,
      output: r.output,
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }));

    let jobs = [...wfJobs, ...agJobs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Filter by status
    if (status) {
      jobs = jobs.filter((j) => j.status === status);
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.jobId.toLowerCase().includes(q) ||
          (j.agentName || '').toLowerCase().includes(q) ||
          (j.workflowName || '').toLowerCase().includes(q) ||
          j.companyName.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ data: jobs.slice(0, limit) });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}