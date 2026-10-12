import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const existing = await db.skill.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const {
      name, slug, category, categorySlug, title, version, status,
      riskLevel, requiresApproval, description, runtime, allowedTools,
      forbiddenTools, inputs, outputs, purpose, validationRules,
      securityRules, costPolicy, requiredPermissions, safetyRules,
      approvalRules, failureHandling, content,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (category !== undefined) updateData.category = category;
    if (categorySlug !== undefined) updateData.categorySlug = categorySlug;
    if (title !== undefined) updateData.title = title;
    if (version !== undefined) updateData.version = version;
    if (status !== undefined) updateData.status = status;
    if (riskLevel !== undefined) updateData.riskLevel = riskLevel;
    if (requiresApproval !== undefined) updateData.requiresApproval = requiresApproval;
    if (description !== undefined) updateData.description = description;
    if (runtime !== undefined) updateData.runtime = runtime;
    if (allowedTools !== undefined) updateData.allowedTools = typeof allowedTools === 'string' ? allowedTools : JSON.stringify(allowedTools);
    if (forbiddenTools !== undefined) updateData.forbiddenTools = typeof forbiddenTools === 'string' ? forbiddenTools : JSON.stringify(forbiddenTools);
    if (inputs !== undefined) updateData.inputs = typeof inputs === 'string' ? inputs : JSON.stringify(inputs);
    if (outputs !== undefined) updateData.outputs = typeof outputs === 'string' ? outputs : JSON.stringify(outputs);
    if (purpose !== undefined) updateData.purpose = purpose;
    if (validationRules !== undefined) updateData.validationRules = typeof validationRules === 'string' ? validationRules : JSON.stringify(validationRules);
    if (securityRules !== undefined) updateData.securityRules = typeof securityRules === 'string' ? securityRules : JSON.stringify(securityRules);
    if (costPolicy !== undefined) updateData.costPolicy = typeof costPolicy === 'string' ? costPolicy : JSON.stringify(costPolicy);
    if (requiredPermissions !== undefined) updateData.requiredPermissions = typeof requiredPermissions === 'string' ? requiredPermissions : JSON.stringify(requiredPermissions);
    if (safetyRules !== undefined) updateData.safetyRules = typeof safetyRules === 'string' ? safetyRules : JSON.stringify(safetyRules);
    if (approvalRules !== undefined) updateData.approvalRules = approvalRules;
    if (failureHandling !== undefined) updateData.failureHandling = failureHandling;
    if (content !== undefined) updateData.content = content;

    const updated = await db.skill.update({
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
    console.error('Skill PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const existing = await db.skill.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    await db.skill.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Skill DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
