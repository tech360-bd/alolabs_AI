import { z } from 'zod';
import { v1Handler, v1Body, V1Error } from '@/lib/v1';
import { enqueueLeadFollowup, listFollowupRuns, CRM_FOLLOWUP_JOB_TYPE } from '@/lib/integrations/workflows/lead-followup';
import { db } from '@/lib/db';
import type { V1Identity } from '@/lib/v1-auth';

/**
 * /api/v1/crm/followup-drafts
 *
 * POST { credentialId } → queues the fixed read-only workflow:
 *   "Read the five most recent test leads from the authorized staging CRM and
 *    create a Bengali follow-up draft for each. Do not send any message."
 * A queued run is NOT completion: the caller must read the run (status,
 * events, artifacts) to establish what actually happened.
 *
 * GET → recent runs for this tenant with their drafts and evidence.
 */

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ credentialId: z.string().min(1).max(200) }).strict();

function requireOperator(identity: V1Identity) {
  if (identity.kind === 'apiKey') return;
  const allowed = identity.role === 'super_admin' || identity.companyRole === 'owner' || identity.companyRole === 'admin';
  if (!allowed) throw new V1Error('CRM workflow execution requires an administrator', 403, 'FORBIDDEN');
}

export const GET = v1Handler(async ({ identity }) => {
  const runs = await listFollowupRuns(identity.companyId, 10);
  return { runs, jobType: CRM_FOLLOWUP_JOB_TYPE };
});

export const POST = v1Handler(async ({ identity }, request) => {
  requireOperator(identity);
  const parsed = BodySchema.safeParse(await v1Body<unknown>(request));
  if (!parsed.success) throw new V1Error('credentialId is required', 400, 'VALIDATION_ERROR');
  try {
    const result = await enqueueLeadFollowup({
      companyId: identity.companyId,
      ...(identity.kind === 'session' ? { userId: identity.userId } : {}),
      credentialId: parsed.data.credentialId,
    });
    const credential = await db.integrationCredential.findFirst({
      where: { id: parsed.data.credentialId, companyId: identity.companyId },
      select: { status: true, lastVerifiedAt: true },
    });
    return {
      runId: result.runId,
      status: result.status,
      eventsUrl: `/api/runs/${result.runId}/events`,
      detailUrl: `/api/v1/runs/${result.runId}`,
      connectionStatus: credential?.status ?? 'configured',
      lastVerifiedAt: credential?.lastVerifiedAt?.toISOString() ?? null,
      note: 'Run accepted and queued. Completion is only established by a terminal status with five persisted drafts.',
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'NOT_FOUND') throw new V1Error('CRM connection not found', 404, 'NOT_FOUND');
    throw error;
  }
});
