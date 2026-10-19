import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAdmin();
    const params = request.nextUrl.searchParams;
    const requestedPage = Number(params.get('page') ?? 1);
    const requestedLimit = Number(params.get('limit') ?? 50);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 50;
    const where = { companyId: user.companyId };
    const [rows, total, statusGroups] = await Promise.all([
      db.aIEmployeeIdentity.findMany({
        where,
        orderBy: { employeeKey: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: { select: { id: true, slug: true, name: true, companyId: true } },
          agent: { select: { id: true, agentId: true, name: true, companyId: true, departmentId: true } },
        },
      }),
      db.aIEmployeeIdentity.count({ where }),
      db.aIEmployeeIdentity.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);

    const data = rows.map((row) => {
      const scopedAgent = row.agent?.companyId === user.companyId && row.agent.departmentId === row.departmentId ? row.agent : null;
      const integrity = !scopedAgent || row.department.companyId !== user.companyId ? 'assignment_mismatch' : 'tenant_scoped';
      return {
        id: row.id,
        employeeKey: row.employeeKey,
        status: row.status,
        statusReason: row.statusReason,
        roleKey: row.roleKey,
        title: row.title,
        department: { id: row.department.id, slug: row.department.slug, name: row.department.name },
        agent: scopedAgent ? { id: scopedAgent.id, agentKey: scopedAgent.agentId, name: scopedAgent.name } : null,
        allowedTools: parseJson(row.allowedTools),
        permissionProfile: parseJson(row.permissionProfile),
        memoryScope: parseJson(row.memoryScope),
        resourceLimits: parseJson(row.resourceLimits),
        approvalPolicy: parseJson(row.approvalPolicy),
        modelPolicy: row.modelPolicy,
        configurationHash: row.configurationHash,
        lastVerifiedAt: row.lastVerifiedAt,
        lastVerificationExecutionId: row.lastVerificationExecutionId,
        integrity,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    const summary = { provisioned: 0, tested: 0, active: 0, suspended: 0, retired: 0, other: 0 };
    for (const group of statusGroups) {
      if (Object.hasOwn(summary, group.status)) summary[group.status as keyof typeof summary] = group._count._all;
      else summary.other += group._count._all;
    }
    return NextResponse.json({
      data,
      summary,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      scope: { companyId: user.companyId },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
