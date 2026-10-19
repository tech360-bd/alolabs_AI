import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/api-auth';

function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

const CreateCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  domain: z.string().trim().max(253).optional().nullable(),
  ownerUserId: z.string().min(1).optional(),
});

function authError(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET() {
  try {
    const user = await requireAuth();
    const companies = await db.company.findMany({
      where: user.role === 'super_admin' ? {} : { users: { some: { userId: user.userId } } },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { usageLogs: true, users: true } } },
    });

    return NextResponse.json({ data: companies.map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      domain: company.domain,
      status: company.status,
      webCrmConnected: company.webCrmConnected,
      monthlyUsageLimit: company.monthlyUsageLimit,
      usageCount: company._count.usageLogs,
      userCount: company._count.users,
    })) });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    console.error('[Companies] Failed to list companies:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Company provisioning is a Super Admin action; defaults prohibit paid usage. */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole('super_admin');
    const parsed = CreateCompanySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const slug = parsed.data.slug || slugify(parsed.data.name);
    if (slug.length < 2) return NextResponse.json({ error: 'Company name must produce a valid slug' }, { status: 400 });
    const duplicate = await db.company.findUnique({ where: { slug }, select: { id: true } });
    if (duplicate) return NextResponse.json({ error: 'Company with this slug already exists' }, { status: 409 });
    if (parsed.data.ownerUserId) {
      const owner = await db.user.findUnique({ where: { id: parsed.data.ownerUserId }, select: { id: true, isActive: true } });
      if (!owner || !owner.isActive) return NextResponse.json({ error: 'Active owner account not found' }, { status: 404 });
    }

    const company = await db.$transaction(async (transaction) => {
      const created = await transaction.company.create({
        data: {
          name: parsed.data.name,
          slug,
          domain: parsed.data.domain || null,
          status: 'active',
          paidApiAllowed: false,
          settings: { create: {} },
          budget: { create: { maxPaidBudgetUsd: 0, paidApiAllowed: false, autoBillingEnabled: false } },
          customRoles: { create: [
            { name: 'owner', description: 'Full company administration', isSystem: true, permissions: JSON.stringify(['company:*', 'members:*', 'providers:*', 'routing:*', 'usage:read']) },
            { name: 'admin', description: 'Company administration', isSystem: true, permissions: JSON.stringify(['company:read', 'members:*', 'providers:*', 'routing:*', 'usage:read']) },
            { name: 'manager', description: 'Company operations', isSystem: true, permissions: JSON.stringify(['company:read', 'usage:read']) },
            { name: 'operator', description: 'Standard company access', isSystem: true, permissions: JSON.stringify(['company:read']) },
            { name: 'employee', description: 'Limited company access', isSystem: true, permissions: JSON.stringify(['company:read']) },
          ] },
          ...(parsed.data.ownerUserId ? { users: { create: { userId: parsed.data.ownerUserId, role: 'owner' } } } : {}),
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          companyId: created.id,
          action: 'company.create',
          resource: 'company',
          resourceId: created.id,
          details: JSON.stringify({ slug, ownerAssigned: Boolean(parsed.data.ownerUserId), paidApiAllowed: false }),
        },
      });
      return created;
    });

    return NextResponse.json({
      data: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        domain: company.domain,
        status: company.status,
        paidApiAllowed: company.paidApiAllowed,
      },
    }, { status: 201 });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    console.error('[Companies] Failed to create company:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
