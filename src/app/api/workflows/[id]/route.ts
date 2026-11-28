import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { legacyTenant, legacyAuthResponse } from '@/lib/api/legacy-session';
import { workflowOwnershipSpec } from '@/lib/api/workflow-ownership';

const workflowScope = workflowOwnershipSpec();

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await legacyTenant(request);
    const { id } = await params;

    const access = await workflowScope.verifyParent?.(id, tenant.companyId, 'write');
    if (access !== true) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    await db.workflow.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('Workflow DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await legacyTenant(request);
    const { id } = await params;
    const body = await request.json();

    const access = await workflowScope.verifyParent?.(id, tenant.companyId, 'write');
    if (access !== true) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const { name, slug, description, triggers, stepConfigs, departmentId, status } = body;

    if (departmentId !== undefined && departmentId !== null) {
      const dept = await db.department.findFirst({
        where: { id: String(departmentId), companyId: tenant.companyId },
        select: { id: true },
      });
      if (!dept) {
        return NextResponse.json({ error: 'Department not found' }, { status: 404 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (description !== undefined) updateData.description = description;
    if (triggers !== undefined) updateData.triggers = typeof triggers === 'string' ? triggers : JSON.stringify(triggers);
    if (stepConfigs !== undefined) updateData.stepConfigs = typeof stepConfigs === 'string' ? stepConfigs : JSON.stringify(stepConfigs);
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (status !== undefined) updateData.status = status;

    const updated = await db.workflow.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, id: updated.id });
  } catch (error: unknown) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('Workflow PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
