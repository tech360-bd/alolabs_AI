import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { ADMIN_ROLES } from '@/lib/api/secure-route';

/**
 * /api/dashboard/cost — cost dashboard.
 *
 * Replaces an inline-verify handler that returned global cost/payment-guard
 * aggregates to any authenticated user, including blocked-payment logs and a
 * `costByCompany` breakdown that enumerates every tenant. Cost data is now
 * scoped to the caller's company; only platform admins (super_admin / admin)
 * see the cross-tenant aggregates (they are the audience the panel is built
 * for). A non-admin from a single company gets a tenant-filtered view that
 * omits `costByCompany` entirely.
 */
export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number]);
  const companyScope = user.role === 'super_admin' || isAdmin
    ? {}
    : { companyId: user.companyId ?? null };

  try {
    // PaymentGuardLog is a global platform table (no companyId column); it
    // records every blocked paid-API call across tenants. Restrict the entire
    // log + its derived counts to admins. Non-admins see only their tenant's
    // costEstimates and usageLogs above.
    const paymentGuardLogs = isAdmin
      ? await db.paymentGuardLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
      : [];
    const blockedPayments = isAdmin ? await db.paymentGuardLog.count({ where: { blocked: true } }) : 0;
    const allowedPayments = isAdmin ? await db.paymentGuardLog.count({ where: { blocked: false } }) : 0;
    const replacementsUsed = isAdmin ? await db.paymentGuardLog.count({ where: { replacementUsed: true } }) : 0;

    const [costEstimates, paidApiUsageLogs] = await Promise.all([
      db.costEstimate.findMany({ where: companyScope, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.usageLog.findMany({
        where: { ...companyScope, paidApiUsed: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const totalEstimatedCost = await db.costEstimate.aggregate({
      where: companyScope,
      _sum: { estimatedCost: true },
    });

    const totalActualCost = await db.costEstimate.aggregate({
      where: { ...companyScope, actualCost: { not: null } },
      _sum: { actualCost: true },
    });
    const approvedCosts = await db.costEstimate.aggregate({
      where: { ...companyScope, status: 'approved' },
      _sum: { estimatedCost: true, actualCost: true },
      _count: { id: true },
    });
    const rejectedCosts = await db.costEstimate.aggregate({
      where: { ...companyScope, status: 'rejected' },
      _sum: { estimatedCost: true },
      _count: { id: true },
    });
    const pendingCosts = await db.costEstimate.aggregate({
      where: { ...companyScope, status: 'pending' },
      _sum: { estimatedCost: true },
      _count: { id: true },
    });
    const costByProvider = await db.costEstimate.groupBy({
      by: ['provider'],
      where: companyScope,
      _sum: { estimatedCost: true, actualCost: true },
      _count: { id: true },
      orderBy: { _sum: { estimatedCost: 'desc' } },
    });
    const paidApiTotalTokens = await db.usageLog.aggregate({
      where: { ...companyScope, paidApiUsed: true },
      _sum: { tokensOrLocalUsed: true },
      _count: { id: true },
    });

    // costByCompany is a cross-tenant breakdown — admins only.
    const costByCompany = isAdmin
      ? await db.costEstimate.groupBy({
          by: ['companyId'],
          _sum: { estimatedCost: true, actualCost: true },
          _count: { id: true },
          orderBy: { _sum: { estimatedCost: 'desc' } },
        })
      : [];

    return NextResponse.json({
      costEstimates,
      paymentGuardLogs,
      paidApiUsageLogs,
      summary: {
        totalEstimatedCost: totalEstimatedCost._sum.estimatedCost ?? 0,
        totalActualCost: totalActualCost._sum.actualCost ?? 0,
        approved: {
          count: approvedCosts._count.id,
          estimatedCost: approvedCosts._sum.estimatedCost ?? 0,
          actualCost: approvedCosts._sum.actualCost ?? 0,
        },
        rejected: { count: rejectedCosts._count.id, estimatedCost: rejectedCosts._sum.estimatedCost ?? 0 },
        pending: { count: pendingCosts._count.id, estimatedCost: pendingCosts._sum.estimatedCost ?? 0 },
        paymentGuard: { blocked: blockedPayments, allowed: allowedPayments, replacementsUsed },
        paidApi: { totalRequests: paidApiTotalTokens._count.id, totalTokens: paidApiTotalTokens._sum.tokensOrLocalUsed ?? 0 },
      },
      costByProvider,
      costByCompany,
    });
  } catch (error) {
    console.error('[Cost Dashboard] Error:', error);
    return NextResponse.json({ error: 'Failed to load cost dashboard' }, { status: 500 });
  }
}
