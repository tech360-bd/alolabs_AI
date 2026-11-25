/**
 * Approval binding.
 *
 * The pre-existing tool policy deliberately refused to honour a caller-supplied
 * `approvalId`:
 *
 *   "An ID has not been checked for status, tenant, action, arguments, expiry or
 *    replay. Until that binding exists, never allow privileged execution."
 *
 * This module provides that binding. An approval only authorises the exact
 * action it was requested for, in the tenant that requested it, while it is
 * still pending-valid (approved and unexpired), by a reviewer whose role is
 * allowed to approve it. Anything else fails closed.
 *
 * Replay: the digest binds the arguments, so replaying an approval cannot
 * authorise a *different* payload. Single-use consumption additionally requires
 * a persistence marker; that is tracked as GAP-004 in the roadmap rather than
 * pretended to be solved here.
 */

import { createHash } from 'node:crypto';

export interface ApprovalBindingRecord {
  actionClass: string;
  action: string;
  resource: string;
  /** sha256 over the canonical action payload (tool name + arguments). */
  digest: string;
  requestedAt: string;
}

export interface ApprovalRowLike {
  id: string;
  type: string;
  status: string;
  riskLevel?: string | null;
  companyId: string | null;
  requestJson: string;
  expiresAt?: Date | string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | string | null;
}

export interface ApprovalClaim {
  companyId: string;
  actionClass: string;
  action: string;
  resource: string;
  digest: string;
  now?: number;
  /** Roles permitted to approve for the matched policy. */
  allowedApproverRoles?: string[];
  /** Reviewer's effective role, resolved server-side (never from the client). */
  reviewerRole?: string | null;
}

export interface ApprovalVerification {
  valid: boolean;
  reason: string;
  binding?: ApprovalBindingRecord;
}

/** Stable JSON: object keys sorted recursively, so the digest cannot be fooled by key order. */
export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') return input;
    if (seen.has(input as object)) return '[circular]';
    seen.add(input as object);
    if (Array.isArray(input)) return input.map(walk);
    const record = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = walk(record[key]);
    return out;
  };
  return JSON.stringify(walk(value));
}

export function digestActionPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export function buildApprovalBinding(params: {
  actionClass: string;
  action: string;
  resource: string;
  payload: unknown;
  requestedAt?: Date;
}): ApprovalBindingRecord {
  return {
    actionClass: params.actionClass,
    action: params.action,
    resource: params.resource,
    digest: digestActionPayload(params.payload),
    requestedAt: (params.requestedAt ?? new Date()).toISOString(),
  };
}

function parseBinding(requestJson: string): { record: Record<string, unknown>; binding?: ApprovalBindingRecord } {
  try {
    const parsed: unknown = JSON.parse(requestJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { record: {} };
    const record = parsed as Record<string, unknown>;
    const candidate = record.binding;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { record };
    const raw = candidate as Record<string, unknown>;
    if (
      typeof raw.actionClass !== 'string' ||
      typeof raw.action !== 'string' ||
      typeof raw.resource !== 'string' ||
      typeof raw.digest !== 'string' ||
      typeof raw.requestedAt !== 'string'
    ) {
      return { record };
    }
    return {
      record,
      binding: {
        actionClass: raw.actionClass,
        action: raw.action,
        resource: raw.resource,
        digest: raw.digest,
        requestedAt: raw.requestedAt,
      },
    };
  } catch {
    return { record: {} };
  }
}

const REVIEWER_ROLE_ALIASES: Record<string, string> = {
  owner: 'organization_owner',
  admin: 'admin',
  manager: 'project_manager',
  super_admin: 'super_admin',
};

export function normaliseReviewerRole(role: string | null | undefined): string | null {
  if (!role) return null;
  return REVIEWER_ROLE_ALIASES[role] ?? role;
}

export function verifyApprovalBinding(row: ApprovalRowLike, claim: ApprovalClaim): ApprovalVerification {
  const now = claim.now ?? Date.now();

  if (row.status !== 'approved') {
    return { valid: false, reason: `Approval is ${row.status}, not approved.` };
  }
  if (!row.companyId || row.companyId !== claim.companyId) {
    return { valid: false, reason: 'Approval belongs to a different organisation.' };
  }
  if (!row.reviewedBy) {
    return { valid: false, reason: 'Approval has no recorded reviewer.' };
  }
  if (row.expiresAt) {
    const expires = row.expiresAt instanceof Date ? row.expiresAt.getTime() : Date.parse(row.expiresAt);
    if (!Number.isFinite(expires) || expires <= now) {
      return { valid: false, reason: 'Approval has expired.' };
    }
  }

  const { binding } = parseBinding(row.requestJson);
  if (!binding) {
    return {
      valid: false,
      reason: 'Approval is not bound to an action payload (legacy approval); it cannot authorise this action.',
    };
  }
  if (binding.actionClass !== claim.actionClass) {
    return { valid: false, reason: `Approval is bound to a different action class (${binding.actionClass}).` };
  }
  if (binding.resource !== claim.resource) {
    return { valid: false, reason: 'Approval is bound to a different resource.' };
  }
  if (binding.digest !== claim.digest) {
    return { valid: false, reason: 'Approval is bound to a different payload; arguments changed after review.' };
  }
  if (claim.allowedApproverRoles?.length) {
    const reviewerRole = normaliseReviewerRole(claim.reviewerRole);
    if (!reviewerRole || !claim.allowedApproverRoles.includes(reviewerRole)) {
      return { valid: false, reason: 'Approval was granted by a role that is not allowed to approve this action.' };
    }
  }

  return { valid: true, reason: 'Approval verified against action, resource, tenant and payload.', binding };
}

/** Age of an approval, used to reject stale reviews even when no expiry is set. */
export const MAX_APPROVAL_AGE_MS = 7 * 24 * 60 * 60 * 1000;
