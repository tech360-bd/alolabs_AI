import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { requireAuth, canManageCompany, type AuthenticatedUser } from '@/lib/api-auth';

/**
 * /api/webhooks — webhook config management.
 *
 * P0-A FIX (extended): previously GET listed all companies' webhooks and POST
 * trusted caller-supplied `companyId`. Now: tenant identity is resolved
 * server-side. Non-admins see only their own company's webhooks. Super admins
 * may optionally filter by `?company=<slug>` for support.
 */

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

async function audit(userId: string, action: string, details: Record<string, unknown>, ip: string) {
  try {
    await db.auditLog.create({
      data: { action, resource: 'WebhookConfig', details: JSON.stringify(details), userId, ipAddress: ip },
    });
  } catch {
    /* best-effort */
  }
}

// GET /api/webhooks
export async function GET(request: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const companySlug = searchParams.get('company') || '';
    const isAdmin = user.role === 'super_admin' || user.role === 'admin';
    const targetSlug = isAdmin ? companySlug : undefined;

    const where: Record<string, unknown> = {};
    if (targetSlug) {
      const company = await db.company.findUnique({ where: { slug: targetSlug }, select: { id: true } });
      where.companyId = company?.id ?? '__none__';
    } else {
      where.companyId = user.companyId ?? '__none__';
    }

    const webhooks = await db.webhookConfig.findMany({
      where,
      include: { company: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const data = webhooks.map((w) => ({
      id: w.id,
      name: w.name,
      companyId: w.companyId,
      companyName: w.company?.name ?? '',
      url: w.url,
      events: JSON.parse(w.events || '[]'),
      isActive: w.isActive,
      lastTriggeredAt: w.lastTriggeredAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[webhooks GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/webhooks
export async function POST(request: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, url, events } = body;

    // P0-A: companyId resolved server-side. Caller-supplied companyId ignored.
    const companyId = user.companyId;
    if (!companyId) {
      return NextResponse.json({ error: 'No active company membership' }, { status: 403 });
    }
    if (!name || !url || !events || events.length === 0) {
      return NextResponse.json({ error: 'name, url, and events are required' }, { status: 400 });
    }
    if (!canManageCompany(user) && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const webhook = await db.webhookConfig.create({
      data: {
        companyId,
        name,
        url,
        events: JSON.stringify(events),
        secret: webhookSecret,
        isActive: true,
      },
    });

    await audit(user.userId, 'webhook.create', { webhookId: webhook.id, companyId, name, url }, clientIp(request));

    // secret returned once, never stored in plaintext after this response.
    return NextResponse.json({ id: webhook.id, name: webhook.name, secret: webhookSecret }, { status: 201 });
  } catch (error) {
    console.error('[webhooks POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
