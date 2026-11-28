import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { legacyTenant, legacyAuthResponse } from '@/lib/api/legacy-session';

export async function GET(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request);
    const depts = await db.department.findMany({
      where: { companyId: tenant.companyId },
      select: { id: true },
    });
    const deptIds = depts.map((d) => d.id);

    const workflows = await db.workflow.findMany({
      where: {
        OR: [
          { workflowPermissions: { some: { companyId: tenant.companyId } } },
          ...(deptIds.length > 0 ? [{ departmentId: { in: deptIds } }] : []),
        ],
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { workflowSteps: true } },
      },
    });

    const data = workflows.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      description: w.description,
      triggers: w.triggers,
      stepCount: w._count.workflowSteps,
      departmentId: w.departmentId,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
