import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const existing = await db.agent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    await db.agent.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Agent DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const existing = await db.agent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const { name, slug, departmentId, departmentName, purpose, type, role,
      allowedSkills, forbiddenSkills, allowedTools, forbiddenTools,
      inputSchema, outputSchema, workflowSteps, protectionRules,
      approvalRules, handoffRules, qualityChecklist, selfImprovement,
      productivityRules, status, version } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (departmentName !== undefined) updateData.departmentName = departmentName;
    if (purpose !== undefined) updateData.purpose = purpose;
    if (type !== undefined) updateData.type = type;
    if (role !== undefined) updateData.role = role;
    if (allowedSkills !== undefined) updateData.allowedSkills = typeof allowedSkills === 'string' ? allowedSkills : JSON.stringify(allowedSkills);
    if (forbiddenSkills !== undefined) updateData.forbiddenSkills = typeof forbiddenSkills === 'string' ? forbiddenSkills : JSON.stringify(forbiddenSkills);
    if (allowedTools !== undefined) updateData.allowedTools = typeof allowedTools === 'string' ? allowedTools : JSON.stringify(allowedTools);
    if (forbiddenTools !== undefined) updateData.forbiddenTools = typeof forbiddenTools === 'string' ? forbiddenTools : JSON.stringify(forbiddenTools);
    if (inputSchema !== undefined) updateData.inputSchema = typeof inputSchema === 'string' ? inputSchema : JSON.stringify(inputSchema);
    if (outputSchema !== undefined) updateData.outputSchema = typeof outputSchema === 'string' ? outputSchema : JSON.stringify(outputSchema);
    if (workflowSteps !== undefined) updateData.workflowSteps = typeof workflowSteps === 'string' ? workflowSteps : JSON.stringify(workflowSteps);
    if (protectionRules !== undefined) updateData.protectionRules = typeof protectionRules === 'string' ? protectionRules : JSON.stringify(protectionRules);
    if (approvalRules !== undefined) updateData.approvalRules = typeof approvalRules === 'string' ? approvalRules : JSON.stringify(approvalRules);
    if (handoffRules !== undefined) updateData.handoffRules = typeof handoffRules === 'string' ? handoffRules : JSON.stringify(handoffRules);
    if (qualityChecklist !== undefined) updateData.qualityChecklist = typeof qualityChecklist === 'string' ? qualityChecklist : JSON.stringify(qualityChecklist);
    if (selfImprovement !== undefined) updateData.selfImprovement = typeof selfImprovement === 'string' ? selfImprovement : JSON.stringify(selfImprovement);
    if (productivityRules !== undefined) updateData.productivityRules = typeof productivityRules === 'string' ? productivityRules : JSON.stringify(productivityRules);
    if (status !== undefined) updateData.status = status;
    if (version !== undefined) updateData.version = version;

    const updated = await db.agent.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, id: updated.id });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Agent PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
