/**
 * Bound approvals: creation, verification and single-use consumption.
 *
 * Phase B shipped verification but no way to *create* a bound approval, and the
 * tool path evaluated governance before verification — so a valid approval could
 * never satisfy a `require_approval` decision. Phase B2 closes that loop:
 *
 *   request → decision `require_approval`
 *           → createBoundApproval() (persisted in the existing `Approval` table)
 *           → an authorised reviewer approves through `PUT /api/approvals`
 *           → the caller retries with the approval id
 *           → verifyBoundApproval() + consumeApproval() (atomic, single use)
 *           → the action executes
 *
 * Nothing here trusts a caller-supplied id: status, tenant, expiry, action class,
 * resource, payload digest and reviewer role are all re-checked server-side.
 */

import { db } from '@/lib/db';
import { writeAuditEvent } from '@/lib/audit-events';
import {
  buildApprovalBinding,
  digestActionPayload,
  normaliseReviewerRole,
  verifyApprovalBinding,
  type ApprovalBindingRecord,
} from './approval-binding';
import { toApprovalRisk } from './engine';
import type { ActionClass, ActorRole, ApproverRole, RiskLevel, Surface } from './types';

/** Default approval lifetime; never longer than 24 hours. */
export const DEFAULT_APPROVAL_TTL_MINUTES = 60;
export const MAX_APPROVAL_TTL_MINUTES = 24 * 60;

/**
 * Map a governance action class onto the existing `Approval.type` vocabulary so
 * reviewers see a familiar category. Unknown classes fall back to `tool_approval`.
 */
export function approvalTypeForAction(actionClass: ActionClass): string {
  switch (actionClass) {
    case 'content.publish':
    case 'external.communicate':
      return 'public_publish';
    case 'deploy.production':
    case 'deploy.preview':
      return 'deployment';
    case 'dns.change':
    case 'infra.change':
      return 'dns_change';
    case 'data.delete':
    case 'schema.migrate':
      return 'file_delete';
    case 'financial.transact':
      return 'financial_final';
    case 'privilege.change':
    case 'policy.change':
    case 'agent.registry.change':
      return 'new_agent';
    case 'secret.access':
      return 'paid_api';
    case 'code.execute.untrusted':
      return 'shell_command';
    default:
      return 'tool_approval';
  }
}

export interface CreateBoundApprovalInput {
  companyId: string;
  requestedBy?: string | null;
  actionClass: ActionClass;
  /** Human-readable action name (also bound into the approval). */
  action: string;
  resource: string;
  /** The exact payload that will be executed. Only its digest is persisted. */
  payload: unknown;
  riskLevel?: RiskLevel;
  description?: string;
  requiredApprovers?: ApproverRole[];
  expiresInMinutes?: number;
  surface?: Surface;
  metadata?: Record<string, unknown>;
}

export interface CreatedApproval {
  id: string;
  expiresAt: Date;
  binding: ApprovalBindingRecord;
}

/**
 * Persist a bound approval request. The review itself still happens through the
 * existing tenant-checked approvals API — this function only records *what* is
 * being requested, for *which exact payload*.
 */
export async function createBoundApproval(input: CreateBoundApprovalInput): Promise<CreatedApproval> {
  const ttlMinutes = Math.min(
    MAX_APPROVAL_TTL_MINUTES,
    Math.max(1, input.expiresInMinutes ?? DEFAULT_APPROVAL_TTL_MINUTES),
  );
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const binding = buildApprovalBinding({
    actionClass: input.actionClass,
    action: input.action,
    resource: input.resource,
    payload: input.payload,
  });

  const requestJson = JSON.stringify({
    binding,
    requiredApprovers: input.requiredApprovers ?? ['super_admin'],
    riskLevel: input.riskLevel ?? 'high',
    surface: input.surface ?? 'customer_workspace',
    metadata: input.metadata ?? {},
  });

  const approval = await db.approval.create({
    data: {
      type: approvalTypeForAction(input.actionClass),
      title: `${input.action} — ${input.resource}`.slice(0, 180),
      description: (input.description ?? `Governance requires approval for ${input.actionClass} on ${input.resource}.`).slice(0, 5000),
      requestJson,
      status: 'pending',
      requestedBy: input.requestedBy ?? null,
      companyId: input.companyId,
      riskLevel: toApprovalRisk(input.riskLevel ?? 'high'),
      expiresAt,
    },
    select: { id: true },
  });

  try {
    await writeAuditEvent({
      actorUserId: input.requestedBy ?? null,
      companyId: input.companyId,
      action: 'governance.approval.requested',
      resource: input.resource,
      resourceId: approval.id,
      details: {
        actionClass: input.actionClass,
        action: input.action,
        riskLevel: input.riskLevel ?? 'high',
        requiredApprovers: input.requiredApprovers ?? ['super_admin'],
        expiresAt: expiresAt.toISOString(),
        digest: binding.digest.slice(0, 16),
      },
    });
  } catch (error) {
    // The approval exists; failing to audit it must not silently continue the
    // caller's action. Callers treat this as a hard failure.
    throw new Error(`Approval ${approval.id} was created but could not be audited: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return { id: approval.id, expiresAt, binding };
}

/**
 * Resolve the reviewer's effective role, server-side only.
 *
 * The tenant membership is authoritative for tenant-scoped approvals: a platform
 * user whose `User.role` is merely `user` must not be treated as a reviewer, and
 * an organisation owner must not be downgraded to their platform role. Platform
 * `super_admin` keeps an override. Roles are never read from the request.
 */
export async function resolveReviewerRole(companyId: string, reviewerId: string): Promise<string | null> {
  let platformRole: string | null = null;
  try {
    const user = await db.user.findUnique({ where: { id: reviewerId }, select: { role: true } });
    platformRole = user?.role ?? null;
  } catch {
    // fall through to the tenant membership
  }
  if (platformRole === 'super_admin') return 'super_admin';

  try {
    const membership = await db.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId: reviewerId } },
      select: { role: true },
    });
    const tenantRole = normaliseReviewerRole(membership?.role ?? null);
    if (tenantRole) return tenantRole;
  } catch {
    // fall through to the platform role
  }
  if (platformRole === 'admin') return 'admin';
  return normaliseReviewerRole(platformRole);
}

export interface VerifyBoundApprovalInput {
  approvalId: string;
  companyId: string;
  actionClass: ActionClass;
  action: string;
  resource: string;
  payload: unknown;
  allowedApproverRoles?: ApproverRole[];
}

export interface VerifiedApproval {
  verified: boolean;
  reason: string;
  binding?: ApprovalBindingRecord;
}

export function approvalDigest(payload: unknown): string {
  return digestActionPayload(payload);
}

/** Verify a bound approval without consuming it (used by dry runs and previews). */
export async function verifyBoundApproval(input: VerifyBoundApprovalInput): Promise<VerifiedApproval> {
  if (!input.approvalId) return { verified: false, reason: 'No approval id supplied.' };
  try {
    const approval = await db.approval.findFirst({
      where: { id: input.approvalId, companyId: input.companyId },
      select: {
        id: true,
        type: true,
        status: true,
        companyId: true,
        requestJson: true,
        expiresAt: true,
        reviewedBy: true,
        reviewedAt: true,
      },
    });
    if (!approval) return { verified: false, reason: 'Approval not found for this organisation.' };

    const reviewerRole = approval.reviewedBy
      ? await resolveReviewerRole(input.companyId, approval.reviewedBy)
      : null;

    const verification = verifyApprovalBinding(approval, {
      companyId: input.companyId,
      actionClass: input.actionClass,
      action: input.action,
      resource: input.resource,
      digest: approvalDigest(input.payload),
      allowedApproverRoles: input.allowedApproverRoles,
      reviewerRole,
    });
    return { verified: verification.valid, reason: verification.reason, binding: verification.binding };
  } catch (error) {
    return {
      verified: false,
      reason: `Approval could not be verified: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

export interface ConsumeApprovalResult {
  consumed: boolean;
  reason: string;
}

/** True when the approval payload already records a consumption marker. */
export function isApprovalConsumed(requestJson: string): boolean {
  try {
    const parsed: unknown = JSON.parse(requestJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    return typeof record.consumedAt === 'string' && record.consumedAt.length > 0;
  } catch {
    return false;
  }
}

/**
 * Atomically mark an approved row as consumed. The compare-and-set is on the
 * exact `requestJson` string that was read, so two concurrent executions cannot
 * both consume the same approval. This closes GAP-004 (approval replay).
 */
export async function consumeApproval(
  approvalId: string,
  companyId: string,
  consumedBy?: string | null,
): Promise<ConsumeApprovalResult> {
  try {
    const approval = await db.approval.findFirst({
      where: { id: approvalId, companyId },
      select: { id: true, status: true, requestJson: true },
    });
    if (!approval) return { consumed: false, reason: 'Approval not found for this organisation.' };
    if (approval.status !== 'approved') {
      return { consumed: false, reason: `Approval is ${approval.status}, not approved.` };
    }
    if (isApprovalConsumed(approval.requestJson)) {
      return { consumed: false, reason: 'Approval has already been used for another action.' };
    }

    const parsed: Record<string, unknown> = (() => {
      try {
        const value: unknown = JSON.parse(approval.requestJson);
        return value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    })();

    const nextJson = JSON.stringify({
      ...parsed,
      consumedAt: new Date().toISOString(),
      consumedBy: consumedBy ?? null,
    });

    const updated = await db.approval.updateMany({
      where: { id: approvalId, companyId, status: 'approved', requestJson: approval.requestJson },
      data: { requestJson: nextJson, updatedAt: new Date() },
    });
    if (updated.count !== 1) {
      return { consumed: false, reason: 'Approval could not be consumed atomically (already used).' };
    }

    try {
      await writeAuditEvent({
        actorUserId: consumedBy ?? null,
        companyId,
        action: 'governance.approval.consumed',
        resource: 'approval',
        resourceId: approvalId,
        details: {},
      });
    } catch (error) {
      console.error('[governance] failed to audit approval consumption:', error);
    }
    return { consumed: true, reason: 'Approval consumed.' };
  } catch (error) {
    return {
      consumed: false,
      reason: `Approval could not be consumed: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

/** Normalise an approval id supplied by a client (header or body). */
export function extractApprovalId(headerValue: string | null | undefined, bodyValue: unknown): string | null {
  if (typeof headerValue === 'string' && headerValue.trim()) return headerValue.trim().slice(0, 100);
  if (typeof bodyValue === 'string' && bodyValue.trim()) return bodyValue.trim().slice(0, 100);
  return null;
}

/** Roles that may approve each action class when no policy narrows it further. */
export function defaultApproversFor(actionClass: ActionClass): ApproverRole[] {
  switch (actionClass) {
    case 'privilege.change':
    case 'policy.change':
    case 'agent.registry.change':
    case 'deploy.production':
    case 'dns.change':
    case 'infra.change':
      return ['super_admin'];
    case 'data.delete':
    case 'schema.migrate':
    case 'financial.transact':
      return ['super_admin', 'organization_owner'];
    case 'content.publish':
    case 'external.communicate':
    case 'data.export':
      return ['super_admin', 'organization_owner', 'project_manager'];
    default:
      return ['super_admin', 'admin', 'organization_owner'];
  }
}

export type { ActorRole };
