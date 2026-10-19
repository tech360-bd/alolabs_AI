import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import { writeAuditEvent } from '@/lib/audit-events';

const UpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  domain: z.string().trim().max(253).nullable().optional(),
  status: z.enum(['active', 'suspended', 'archived']).optional(),
  allowedWorkflows: z.union([z.string(), z.array(z.string())]).optional(),
  allowedDepartments: z.union([z.string(), z.array(z.string())]).optional(),
  monthlyUsageLimit: z.number().int().min(0).max(2_000_000_000).optional(),
  smsAllowed: z.boolean().optional(),
  whatsappBulkAllowed: z.boolean().optional(),
  publicPublishAllowed: z.boolean().optional(),
  webCrmConnected: z.boolean().optional(),
}).strict();

function authResponse(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole('super_admin');
    const { id } = await params;
    const parsed = UpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const existing = await db.company.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const { allowedWorkflows, allowedDepartments, ...values } = parsed.data;
    const data = {
      ...values,
      ...(allowedWorkflows !== undefined ? { allowedWorkflows: typeof allowedWorkflows === 'string' ? allowedWorkflows : JSON.stringify(allowedWorkflows) } : {}),
      ...(allowedDepartments !== undefined ? { allowedDepartments: typeof allowedDepartments === 'string' ? allowedDepartments : JSON.stringify(allowedDepartments) } : {}),
    };
    const updated = await db.company.update({ where: { id }, data });
    await writeAuditEvent({ actorUserId: actor.userId, companyId: id, action: 'company.update', resource: 'company', resourceId: id, details: { fields: Object.keys(parsed.data) } });
    return NextResponse.json({ success: true, id: updated.id });
  } catch (error) {
    const response = authResponse(error);
    if (response) return response;
    console.error('[Company] Update failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Archive only. Hard deletion would cascade tenant data and is intentionally unavailable here. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole('super_admin');
    const { id } = await params;
    const existing = await db.company.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    await db.company.update({ where: { id }, data: { status: 'archived' } });
    await writeAuditEvent({ actorUserId: actor.userId, companyId: id, action: 'company.archive', resource: 'company', resourceId: id, details: { previousStatus: existing.status } });
    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    const response = authResponse(error);
    if (response) return response;
    console.error('[Company] Archive failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
