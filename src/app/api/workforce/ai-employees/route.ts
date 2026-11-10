import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { buildEmployeeWorkforceProfile, type AgentProfileInput, type IdentityProfileInput } from '@/lib/workforce/employee-profile';

const SOP_SAMPLE_SIZE = 5;

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
    const expandProfile = params.get('expand') === 'profile';
    const where = { companyId: user.companyId };
    const [rows, total, statusGroups] = await Promise.all([
      db.aIEmployeeIdentity.findMany({
        where,
        orderBy: { employeeKey: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          department: { select: { id: true, slug: true, name: true, companyId: true } },
          // When expanding, load the full agent record so the 13-category
          // workforce profile can be derived from persisted plan data.
          agent: expandProfile
            ? {
                select: {
                  id: true, agentId: true, name: true, companyId: true, departmentId: true,
                  departmentName: true,
                  purpose: true, role: true, systemInstructions: true,
                  allowedSkills: true, allowedTools: true, forbiddenTools: true,
                  workflowSteps: true, qualityChecklist: true, protectionRules: true,
                  approvalRules: true, handoffRules: true, runtimeProfile: true,
                },
              }
            : { select: { id: true, agentId: true, name: true, companyId: true, departmentId: true } },
        },
      }),
      db.aIEmployeeIdentity.count({ where }),
      db.aIEmployeeIdentity.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);

    // Per-department context for expanded profiles: real KPIs from the
    // department runtimeProfile and a live count of active department SOPs.
    const departmentContext = new Map<string, { kpis: string[]; sop: { activeCount: number; sampleTitles: string[] } | undefined }>();
    if (expandProfile) {
      const departmentIds = [...new Set(rows.map((row) => row.department.id))];
      const [departments, sops] = await Promise.all([
        db.department.findMany({
          where: { id: { in: departmentIds } },
          select: { id: true, runtimeProfile: true },
        }),
        db.enterpriseSOP.findMany({
          where: { isActive: true, status: 'active', departmentId: { in: departmentIds } },
          select: { departmentId: true, title: true },
          orderBy: { title: 'asc' },
        }),
      ]);
      const sopsByDepartment = new Map<string, string[]>();
      for (const sop of sops) {
        if (!sop.departmentId) continue;
        const list = sopsByDepartment.get(sop.departmentId) ?? [];
        list.push(sop.title);
        sopsByDepartment.set(sop.departmentId, list);
      }
      for (const department of departments) {
        let kpis: string[] = [];
        try {
          const profile: unknown = JSON.parse(department.runtimeProfile);
          if (profile && typeof profile === 'object' && Array.isArray((profile as { kpis?: unknown }).kpis)) {
            kpis = ((profile as { kpis: unknown[] }).kpis).filter((k): k is string => typeof k === 'string');
          }
        } catch { /* unparseable profile → no department KPIs */ }
        const titles = sopsByDepartment.get(department.id) ?? [];
        departmentContext.set(department.id, {
          kpis,
          sop: { activeCount: titles.length, sampleTitles: titles.slice(0, SOP_SAMPLE_SIZE) },
        });
      }
    }

    const data = rows.map((row) => {
      const scopedAgent = row.agent?.companyId === user.companyId && row.agent.departmentId === row.departmentId ? row.agent : null;
      const integrity = !scopedAgent || row.department.companyId !== user.companyId ? 'assignment_mismatch' : 'tenant_scoped';
      const base: Record<string, unknown> = {
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
      if (expandProfile) {
        const context = departmentContext.get(row.department.id);
        base.profile = scopedAgent
          ? buildEmployeeWorkforceProfile(
              scopedAgent as unknown as AgentProfileInput,
              row as unknown as IdentityProfileInput,
              { kpis: context?.kpis, sop: context?.sop },
            )
          : null;
      }
      return base;
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
      scope: { companyId: user.companyId, expanded: expandProfile ? 'profile' : null },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
