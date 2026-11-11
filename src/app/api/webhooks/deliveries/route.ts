import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, type AuthenticatedUser } from '@/lib/api-auth';

/**
 * GET /api/webhooks/deliveries — delivery logs.
 *
 * F6: Tenant isolation — companyId is derived from the authenticated session,
 * never from the query string. If a caller passes ?webhookId=<id>, the route
 * verifies the webhook belongs to the caller's company before returning any
 * deliveries. Cross-tenant access returns 404 (not 403) to prevent resource
 * enumeration. This applies to list, detail, pagination, filters, and any
 * future replay/export operations.
 *
 * Returns deliveries from BOTH the legacy webhookDelivery table (inbound
 * provider deliveries) and the new webhookDeliveryLog table (outbound
 * customer-facing deliveries), both tenant-filtered.
 */

async function authorizeWebhookOwnership(user: AuthenticatedUser, webhookId: string): Promise<boolean> {
  const webhook = await db.webhookConfig.findUnique({
    where: { id: webhookId },
    select: { companyId: true },
  });
  if (!webhook) return false;
  if (user.role === 'super_admin') return true;
  return webhook.companyId === user.companyId;
}

export async function GET(req: NextRequest) {
  let user: AuthenticatedUser;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;
    const webhookId = searchParams.get('webhookId');
    const eventType = searchParams.get('eventType'); // filter by event type
    const status = searchParams.get('status'); // filter by delivery status

    // F6: companyId from trusted session context. Super admins may optionally
    // inspect another company via ?company=<slug>.
    const isAdmin = user.role === 'super_admin' || user.role === 'admin';
    const companySlug = isAdmin ? searchParams.get('company') : undefined;
    let companyId = user.companyId ?? '__none__';
    if (companySlug) {
      const c = await db.company.findUnique({ where: { slug: companySlug }, select: { id: true } });
      companyId = c?.id ?? '__none__';
    }

    // F6: If webhookId is supplied, verify ownership. Cross-tenant → 404.
    if (webhookId) {
      const owns = await authorizeWebhookOwnership(user, webhookId);
      if (!owns) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
      }
    }

    // Build the where clause — always tenant-scoped.
    const where: Record<string, unknown> = { companyId };
    if (webhookId) where.webhookId = webhookId;
    if (eventType) where.eventType = eventType;
    if (status) where.status = status;

    // Query the new webhookDeliveryLog table (Phase 2 outbound deliveries).
    const [logData, logTotal] = await Promise.all([
      db.webhookDeliveryLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          webhookId: true,
          eventType: true,
          eventId: true,
          targetUrl: true,
          status: true,
          attempts: true,
          lastAttemptAt: true,
          deliveredAt: true,
          lastError: true,
          createdAt: true,
          // NOTE: payload + signature intentionally NOT returned to the list
          // view (they may contain customer-specific data + the HMAC secret
          // material). A dedicated detail endpoint can return them after
          // re-verifying ownership.
        },
      }),
      db.webhookDeliveryLog.count({ where }),
    ]);

    // Also query the legacy webhookDelivery table (inbound provider deliveries)
    // for backward compatibility — same tenant scoping applies.
    const legacyWhere: Record<string, unknown> = {};
    if (webhookId) {
      legacyWhere.webhookId = webhookId;
    } else {
      // No webhookId filter: scope by company through the webhook relation.
      legacyWhere.webhook = { companyId };
    }
    const [legacyData, legacyTotal] = await Promise.all([
      db.webhookDelivery.findMany({
        where: legacyWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { webhook: { select: { id: true, name: true, url: true, companyId: true } } },
      }),
      db.webhookDelivery.count({ where: legacyWhere }),
    ]);

    // F6: Defensive — strip any legacy rows whose webhook.companyId doesn't
    // match (shouldn't happen due to the where clause, but defense in depth).
    const tenantLegacyData = legacyData.filter(
      (d) => isAdmin || d.webhook?.companyId === user.companyId,
    );

    return NextResponse.json({
      data: [
        ...logData.map((d) => ({ ...d, source: 'outbound' })),
        ...tenantLegacyData.map((d) => ({ ...d, source: 'inbound' })),
      ],
      total: logTotal + legacyTotal,
      page,
      limit,
      scoped_to_company: companyId,
    });
  } catch (error) {
    console.error('[webhooks/deliveries GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
