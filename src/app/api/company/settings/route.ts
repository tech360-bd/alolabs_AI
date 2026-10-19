import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const UpdateSchema = z.object({
  logoUrl: z.string().url().max(1000).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  locale: z.string().trim().min(2).max(20).optional(),
  timezone: z.string().trim().min(2).max(80).optional(),
}).strict();

function canManage(user: { role: string; companyRole?: string }) {
  return user.role === 'super_admin' || ['owner', 'admin'].includes(user.companyRole ?? '');
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status });
}

export async function GET() {
  try {
    const user = await requireCompanyAuth();
    const [company, settings] = await Promise.all([
      db.company.findFirst({ where: { id: user.companyId, status: 'active' }, select: { id: true, name: true, slug: true, domain: true, status: true } }),
      db.companySettings.findUnique({ where: { companyId: user.companyId }, select: { id: true, companyId: true, logoUrl: true, primaryColor: true, locale: true, timezone: true, externalDataProcessingApproved: true, confidentialDataExternalAllowed: true, dataProcessingPolicyUrl: true, createdAt: true, updatedAt: true } }),
    ]);
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    return NextResponse.json({ company, settings });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    if (!canManage(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const parsed = UpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const company = await db.company.findFirst({ where: { id: user.companyId, status: 'active' }, select: { id: true } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const settings = await db.$transaction(async (transaction) => {
      const updated = await transaction.companySettings.upsert({
        where: { companyId: user.companyId },
        create: { companyId: user.companyId, updatedBy: user.userId, ...parsed.data },
        update: { ...parsed.data, updatedBy: user.userId },
        select: { id: true, companyId: true, logoUrl: true, primaryColor: true, locale: true, timezone: true, updatedAt: true },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          companyId: user.companyId,
          action: 'company.settings.update',
          resource: 'company-settings',
          resourceId: updated.id,
          details: JSON.stringify({ fields: Object.keys(parsed.data) }),
        },
      });
      return updated;
    });
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return errorResponse(error);
  }
}
