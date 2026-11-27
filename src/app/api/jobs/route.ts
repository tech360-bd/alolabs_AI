import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session';

// GET /api/jobs — list jobs (workflow runs + agent runs combined, tenant-scoped)
export async function GET(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));

    const company = await db.company.findUnique({
      where: { id: tenant.companyId },
      select: { name: true },
    });
    const companyName = company?.name || 'Company';

    const [workflowRuns, agentRuns] = await Promise.all([
      db.workflowRun.findMany({
        where: tenantWhere(tenant),
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          workflow: { select: { name: true } },
        },
      }),
      db.agentRun.findMany({
        where: tenantWhere(tenant),
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const wfJobs = workflowRuns.map((r, idx) => ({
      id: r.id,
      jobId: `WF-${String(idx + 1).padStart(5, '0')}`,
      companyId: r.companyId || tenant.companyId,
      companyName,
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
      companyId: r.companyId || tenant.companyId,
      companyName,
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

    if (status) {
      jobs = jobs.filter((j) => j.status === status);
    }

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
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
