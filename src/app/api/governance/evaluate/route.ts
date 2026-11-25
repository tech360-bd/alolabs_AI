import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import {
  ACTION_CLASSES,
  enforceGovernance,
  loadGovernanceState,
} from '@/lib/governance';
import type { ActionClass } from '@/lib/governance';

/**
 * Dry-run evaluator for the governance engine.
 *
 * This is the "policy test" surface required by the governance specification:
 * an administrator can ask what the platform would decide for a given action
 * without performing it. It never executes anything and never writes an audit
 * event for an allowance (a denial while testing is also not an execution, so
 * the audit flag is off).
 */

const ActionClassSchema = z.enum(Object.keys(ACTION_CLASSES) as [ActionClass, ...ActionClass[]]);

const BodySchema = z.object({
  action: z.string().trim().min(1).max(200),
  actionClass: ActionClassSchema,
  resource: z.string().trim().min(1).max(300),
  companyId: z.string().trim().min(1).max(100).optional(),
  callerCompanyId: z.string().trim().min(1).max(100).optional(),
  projectId: z.string().trim().min(1).max(100).optional(),
  actorRole: z
    .enum([
      'public_visitor',
      'standard_user',
      'customer_support',
      'developer',
      'project_manager',
      'organization_owner',
      'admin',
      'super_admin',
    ])
    .optional(),
  surface: z
    .enum(['public_webchat', 'customer_workspace', 'super_admin', 'internal_job', 'system'])
    .optional(),
  declaredRisk: z.enum(['low', 'normal', 'moderate', 'high', 'critical']).optional(),
  requiresApproval: z.boolean().optional(),
  providerKind: z.enum(['local', 'verified_free', 'paid']).optional(),
  evidence: z
    .object({
      testsPassed: z.boolean().optional(),
      buildPassed: z.boolean().optional(),
      browserVerified: z.boolean().optional(),
      backupTaken: z.boolean().optional(),
      rollbackPlan: z.boolean().optional(),
      approvalId: z.string().trim().max(100).nullable().optional(),
      approvalVerified: z.boolean().optional(),
      costAuthorized: z.boolean().optional(),
      humanReview: z.boolean().optional(),
      consentRecorded: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin');
    const json = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const state = await loadGovernanceState({ refresh: true });
    const decision = await enforceGovernance(
      {
        action: body.action,
        actionClass: body.actionClass,
        resource: body.resource,
        companyId: body.companyId ?? null,
        callerCompanyId: body.callerCompanyId ?? null,
        projectId: body.projectId ?? null,
        actor: {
          userId: null,
          role: body.actorRole ?? 'super_admin',
          companyId: body.callerCompanyId ?? body.companyId ?? null,
          projectId: body.projectId ?? null,
        },
        surface: body.surface ?? 'super_admin',
        declaredRisk: body.declaredRisk,
        requiresApproval: body.requiresApproval,
        providerKind: body.providerKind,
        // A caller can never assert `approvalVerified`; the dry-run accepts the
        // field only to show how an already-verified approval would resolve.
        evidence: body.evidence ? { ...body.evidence, approvalVerified: undefined } : undefined,
      },
      { state, audit: false },
    );

    return NextResponse.json({ dryRun: true, decision });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'Forbidden' ? 403 : 401 },
      );
    }
    console.error('Governance evaluate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
