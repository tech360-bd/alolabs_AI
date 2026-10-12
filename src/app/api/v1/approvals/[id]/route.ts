import { z } from 'zod';
import { v1Handler, v1Body, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';

/**
 * /api/v1/approvals/:id — approve or reject (POST with action), or read (GET).
 * Approvals are recorded in the audit log; the run waiting on the approval
 * is resumed (re-queued to the durable worker) or failed accordingly.
 * Expired approvals cannot be decided.
 */

const ActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().max(2000).optional(),
});

async function loadApproval(id: string, companyId: string) {
  const approval = await db.approval.findUnique({ where: { id } });
  if (!approval) throw new V1Error('Approval not found', 404, 'NOT_FOUND');
  if (approval.companyId !== companyId) {
    throw new V1Error('Forbidden', 403, 'FORBIDDEN');
  }
  return approval;
}

export const GET = v1Handler(async ({ identity }, request) => {
  const id = decodeURIComponent(request.nextUrl.pathname.split('/').pop()!);
  return loadApproval(id, identity.companyId);
});

export const POST = v1Handler(async ({ identity }, request) => {
  if (identity.kind !== 'session' || !['admin', 'super_admin', 'manager'].includes(identity.role)) {
    throw new V1Error('Human approval requires an authorized administrator session', 403, 'FORBIDDEN');
  }
  const id = decodeURIComponent(request.nextUrl.pathname.split('/').pop()!);
  const approval = await loadApproval(id, identity.companyId);
  if (approval.status !== 'pending') {
    throw new V1Error(`Approval is already ${approval.status}`, 409, 'CONFLICT');
  }
  if (approval.expiresAt && approval.expiresAt.getTime() < Date.now()) {
    await db.approval.updateMany({ where: { id: approval.id, status: 'pending' }, data: { status: 'expired', reviewedAt: new Date() } });
    throw new V1Error('Approval has expired and can no longer be decided', 409, 'EXPIRED');
  }

  const body = await v1Body<unknown>(request);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  const approved = parsed.data.action === 'approve';
  const decided = await db.approval.updateMany({
    where: { id: approval.id, status: 'pending' },
    data: {
      status: approved ? 'approved' : 'rejected',
      reviewedBy: identity.userId,
      reviewedAt: new Date(),
      responseNote: parsed.data.note ?? null,
    },
  });
  if (decided.count !== 1) {
    throw new V1Error('Approval was decided concurrently', 409, 'CONFLICT');
  }
  const updated = await db.approval.findUniqueOrThrow({ where: { id: approval.id } });

  // Resume (approved → re-queued for the durable worker) or fail (rejected)
  // the run that paused for this review. resolveRunApproval is idempotent.
  const { resolveRunApproval } = await import('@/lib/runs');
  const resolution = await resolveRunApproval({
    approvalId: approval.id,
    approved,
    reviewerId: identity.userId,
    note: parsed.data.note,
  });
  const runId = resolution.runId;

  // Audit log
  await db.auditLog.create({
    data: {
      userId: identity.userId,
      action: approved ? 'approve' : 'reject',
      resource: 'approvals',
      details: JSON.stringify({ approvalId: approval.id, note: parsed.data.note ?? null, runId }),
    },
  }).catch(() => {});

  return {
    approval: updated,
    resumedRunId: resolution.resumed ? runId : null,
    runStatus: resolution.status ?? null,
  };
});
