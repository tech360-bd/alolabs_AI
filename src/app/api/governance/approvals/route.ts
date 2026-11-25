/**
 * POST /api/governance/approvals — request a bound approval.
 *
 * Consequential actions (publishing, outbound mail, deploys, destructive data
 * operations) are blocked until a human with the right role approves *that exact
 * action and payload*. This endpoint creates the request so a client can obtain
 * approval without first triggering a failed action:
 *
 *   1. POST here with the action, class, resource and payload → `{ approvalId }`
 *   2. A reviewer approves via `PUT /api/approvals?action=approve`
 *   3. The caller performs the action with `x-approval-id: <approvalId>`
 *
 * The payload is never stored: only a SHA-256 digest is persisted inside the
 * binding, so the approval cannot be replayed against different content and the
 * database does not accumulate customer message bodies.
 *
 * Requester role is not the authorising role — the reviewer's role is what the
 * engine checks, server-side, at both approval and execution time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { defaultApproversFor, DEFAULT_APPROVAL_TTL_MINUTES, MAX_APPROVAL_TTL_MINUTES, createBoundApproval } from '@/lib/governance/approvals';
import { ACTION_CLASSES } from '@/lib/governance/types';
import type { ActionClass } from '@/lib/governance/types';

const REQUESTER_ROLES = new Set(['owner', 'admin', 'manager', 'super_admin']);

const BodySchema = z.object({
  action: z.string().trim().min(3).max(200),
  actionClass: z.string().trim().min(1).max(64),
  resource: z.string().trim().min(1).max(200),
  payload: z.record(z.string(), z.unknown()).optional(),
  description: z.string().trim().max(1000).optional(),
  expiresInMinutes: z.number().int().positive().max(MAX_APPROVAL_TTL_MINUTES).optional(),
  riskLevel: z.enum(['low', 'normal', 'moderate', 'high', 'critical']).optional(),
});

const KNOWN_CLASSES = new Set<string>(Object.keys(ACTION_CLASSES));

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const isPlatformAdmin = user.role === 'super_admin' || user.role === 'admin';
    if (!isPlatformAdmin && !REQUESTER_ROLES.has(user.companyRole ?? '')) {
      return NextResponse.json(
        { error: 'Forbidden: only organisation owners, admins or project managers can request approvals' },
        { status: 403 },
      );
    }

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 });
    }

    const { action, actionClass, resource, payload, description, expiresInMinutes, riskLevel } = parsed.data;
    if (!KNOWN_CLASSES.has(actionClass)) {
      return NextResponse.json(
        { error: `Unknown action class: ${actionClass}`, knownClasses: [...KNOWN_CLASSES] },
        { status: 400 },
      );
    }

    const created = await createBoundApproval({
      companyId: user.companyId,
      requestedBy: user.userId,
      actionClass: actionClass as ActionClass,
      action,
      resource,
      payload: payload ?? {},
      description,
      riskLevel,
      expiresInMinutes: expiresInMinutes ?? DEFAULT_APPROVAL_TTL_MINUTES,
      requiredApprovers: defaultApproversFor(actionClass as ActionClass),
      surface: 'customer_workspace',
      metadata: { requestedVia: 'api.governance.approvals' },
    });

    return NextResponse.json(
      {
        success: true,
        approvalId: created.id,
        status: 'pending',
        expiresAt: created.expiresAt.toISOString(),
        digest: created.binding.digest.slice(0, 16),
        requiredApprovers: defaultApproversFor(actionClass as ActionClass),
        next: 'A reviewer approves it via PUT /api/approvals?action=approve, then the action is retried with the x-approval-id header.',
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[governance] approval request failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create approval' },
      { status: 500 },
    );
  }
}
