/**
 * HTTP governance gate for route handlers.
 *
 * Route-local permission checks are exactly what the governance specification
 * forbids, so every consequential route should call this helper instead of
 * inventing its own rule. It returns either an "allowed" result or a ready-to-send
 * `NextResponse`, so a handler cannot forget to block:
 *
 *     const gate = await enforceHttpGovernance({...});
 *     if (!gate.allowed) return gate.response;
 *
 * Behaviour:
 *   - a supplied approval id is verified server-side (tenant, action, payload,
 *     expiry, reviewer role) **before** policy is evaluated;
 *   - a verified approval is consumed atomically before the action proceeds;
 *   - `require_approval` creates a bound approval and returns its id, so the
 *     caller can retry after a human decision;
 *   - `deny` is final: no approval is offered, because a denied policy is not a
 *     "wait for a human" condition.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enforceGovernance, toActorRole } from './runtime';
import {
  consumeApproval,
  createBoundApproval,
  defaultApproversFor,
  extractApprovalId,
  verifyBoundApproval,
} from './approvals';
import type {
  ActionClass,
  ActionEvidence,
  ApproverRole,
  GovernanceDecision,
  ProviderKind,
  RiskLevel,
  Surface,
} from './types';

export interface HttpGovernanceInput {
  companyId: string;
  userId?: string | null;
  /** Tenant role (owner/admin/manager/member/...). */
  companyRole?: string | null;
  /** Platform role (super_admin/admin/user). */
  platformRole?: string | null;
  action: string;
  actionClass: ActionClass;
  resource: string;
  /** Exact payload being authorised. Only its digest is persisted. */
  payload?: unknown;
  approvalId?: string | null;
  evidence?: ActionEvidence;
  declaredRisk?: RiskLevel;
  providerKind?: ProviderKind;
  surface?: Surface;
  metadata?: Record<string, unknown>;
}

export type HttpGovernanceResult =
  | { allowed: true; decision: GovernanceDecision; approvalId: string | null }
  | {
      allowed: false;
      decision: GovernanceDecision;
      approvalId: string | null;
      response: NextResponse;
    };

function actorRoleFor(input: HttpGovernanceInput) {
  if (input.platformRole === 'super_admin') return 'super_admin' as const;
  if (input.platformRole === 'admin') return 'admin' as const;
  return toActorRole(input.companyRole);
}

export async function enforceHttpGovernance(input: HttpGovernanceInput): Promise<HttpGovernanceResult> {
  const approvers: ApproverRole[] = defaultApproversFor(input.actionClass);
  let verifiedApproval = false;
  let approvalFailure = '';

  if (input.approvalId) {
    const verification = await verifyBoundApproval({
      approvalId: input.approvalId,
      companyId: input.companyId,
      actionClass: input.actionClass,
      action: input.action,
      resource: input.resource,
      payload: input.payload ?? {},
      allowedApproverRoles: approvers,
    });
    verifiedApproval = verification.verified;
    if (!verification.verified) approvalFailure = verification.reason;
  }

  const decision = await enforceGovernance({
    action: input.action,
    actionClass: input.actionClass,
    resource: input.resource,
    companyId: input.companyId,
    callerCompanyId: input.companyId,
    actor: {
      userId: input.userId ?? null,
      role: actorRoleFor(input),
      companyId: input.companyId,
    },
    surface: input.surface ?? 'customer_workspace',
    declaredRisk: input.declaredRisk,
    providerKind: input.providerKind,
    metadata: input.metadata,
    evidence: {
      ...(input.evidence ?? {}),
      ...(verifiedApproval ? { approvalVerified: true, approvalId: input.approvalId ?? null } : {}),
    },
  });

  if (decision.outcome === 'deny') {
    return {
      allowed: false,
      decision,
      approvalId: null,
      response: NextResponse.json(
        {
          error: 'Blocked by governance policy',
          code: 'GOVERNANCE_DENIED',
          decision: summarise(decision),
        },
        { status: 403 },
      ),
    };
  }

  // A verified approval is single-use even when it *satisfied* a policy (the
  // engine then returns `allow`): consumption must not depend on the outcome, or
  // the same approval could be replayed forever.
  if (verifiedApproval && input.approvalId) {
    const consumption = await consumeApproval(input.approvalId, input.companyId, input.userId ?? null);
    if (!consumption.consumed) {
      return {
        allowed: false,
        decision,
        approvalId: input.approvalId,
        response: NextResponse.json(
          {
            error: `Approval could not be consumed: ${consumption.reason}`,
            code: 'APPROVAL_CONSUMPTION_FAILED',
            decision: summarise(decision),
          },
          { status: 409 },
        ),
      };
    }
    return { allowed: true, decision, approvalId: input.approvalId };
  }

  if (decision.outcome === 'require_approval') {
    if (verifiedApproval && input.approvalId) {
      return { allowed: true, decision, approvalId: input.approvalId };
    }

    const required = (decision.requiredApprovers.length
      ? decision.requiredApprovers
      : approvers) as ApproverRole[];

    let createdId: string | null = null;
    let createError = '';
    try {
      const created = await createBoundApproval({
        companyId: input.companyId,
        requestedBy: input.userId ?? null,
        actionClass: input.actionClass,
        action: input.action,
        resource: input.resource,
        payload: input.payload ?? {},
        riskLevel: decision.riskLevel,
        requiredApprovers: required,
        description: decision.explanation.slice(0, 1000),
        surface: input.surface,
        metadata: input.metadata,
      });
      createdId = created.id;
    } catch (error) {
      createError = error instanceof Error ? error.message : 'Approval could not be created.';
    }

    return {
      allowed: false,
      decision,
      approvalId: createdId,
      response: NextResponse.json(
        {
          error: approvalFailure
            ? `The supplied approval is not valid: ${approvalFailure}`
            : 'Approval required before this action can run',
          code: 'GOVERNANCE_APPROVAL_REQUIRED',
          approvalId: createdId,
          requiredApprovers: required,
          decision: summarise(decision),
          ...(createError ? { approvalError: createError } : {}),
          hint: createdId
            ? 'A reviewer with an allowed role must approve it via PUT /api/approvals?action=approve, then retry with the x-approval-id header.'
            : 'No approval could be created; do not retry until the error is resolved.',
        },
        { status: 403 },
      ),
    };
  }

  return { allowed: true, decision, approvalId: null };
}

function summarise(decision: GovernanceDecision) {
  return {
    outcome: decision.outcome,
    riskLevel: decision.riskLevel,
    explanation: decision.explanation,
    policies: decision.violations.map((violation) => ({
      id: violation.policyId,
      enforcement: violation.enforcement,
      reason: violation.reason,
    })),
    missingEvidence: decision.missingEvidence,
    requiredApprovers: decision.requiredApprovers,
    decisionId: decision.decisionId,
    catalogVersion: decision.catalogVersion,
    degraded: decision.degraded,
  };
}

/** Read an approval id from the `x-approval-id` header, falling back to the body. */
export function approvalIdFromRequest(request: Request, body?: unknown): string | null {
  const header = request.headers.get('x-approval-id');
  const bodyValue =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).approvalId
      : undefined;
  return extractApprovalId(header, bodyValue);
}

/**
 * Resolve the caller's organisation from their user id (never from the body).
 *
 * A user who belongs to more than one organisation must name one with
 * `x-company-id`; the membership is then verified server-side. Picking the first
 * membership silently is how a gate ends up authorising the wrong tenant, so an
 * ambiguous caller is refused instead (`null`).
 */
export async function resolveUserCompanyId(
  userId: string,
  requestedCompanyId?: string | null,
): Promise<string | null> {
  try {
    if (requestedCompanyId) {
      const membership = await db.companyUser.findUnique({
        where: { companyId_userId: { companyId: requestedCompanyId, userId } },
        select: { companyId: true },
      });
      return membership?.companyId ?? null;
    }
    const memberships = await db.companyUser.findMany({
      where: { userId },
      select: { companyId: true },
      take: 2,
    });
    if (memberships.length !== 1) return null;
    return memberships[0].companyId;
  } catch {
    return null;
  }
}
