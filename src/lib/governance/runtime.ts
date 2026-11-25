/**
 * Governance runtime.
 *
 * Bridges the pure engine to the database:
 *   - reads the Super Admin emergency controls (cached for a few seconds so a
 *     tool loop does not hammer `Settings`);
 *   - verifies approval tokens against the exact action they were granted for;
 *   - writes an audit event for every non-allowed decision and for degraded
 *     allowances.
 *
 * Failure policy: if the emergency state cannot be read, the engine still runs
 * with `source: 'unavailable'`. High and critical actions are then denied, and
 * lower-risk actions proceed with `degraded: true` and an audit record. This is
 * deliberate: an unreadable `Settings` table must not silently become "all
 * controls off", but it must not take read-only product surfaces down either.
 */

import { db } from '@/lib/db';
import { writeAuditEvent } from '@/lib/audit-events';
import { evaluateGovernance } from './engine';
import { verifyBoundApproval } from './approvals';
import type {
  ActionClass,
  ActorRole,
  ApproverRole,
  GovernanceDecision,
  GovernanceRequest,
  GovernanceState,
  RiskLevel,
} from './types';

const STATE_CACHE_TTL_MS = 5_000;

/** Keys written by `POST /api/emergency`. Kept in sync with that route. */
export const EMERGENCY_KEYS = {
  globalStop: 'emergency_global_stop',
  readOnly: 'emergency_readonly',
  paidDisabled: 'emergency_disable_paid',
  externalCommsStopped: 'emergency_stop_communication',
  queuesStopped: 'emergency_stop_queues',
  apiKeysBlocked: 'emergency_block_apikeys',
  gpuJobsStopped: 'emergency_stop_gpu',
} as const;

let cache: { state: GovernanceState; expiresAt: number } | null = null;

export function resetGovernanceStateCache(): void {
  cache = null;
}

function readEnabled(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false' || trimmed === '') return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as { enabled?: unknown; active?: unknown };
      // Two historical writers exist: `/api/emergency` stores `{enabled}` and
      // `/api/emergency/action` stores `{active}`. Both must be honoured or a
      // stop set through one console would be invisible to the other.
      return record.enabled === true || record.active === true;
    }
    return parsed === true;
  } catch {
    return false;
  }
}

export async function loadGovernanceState(options: { refresh?: boolean; now?: number } = {}): Promise<GovernanceState> {
  const now = options.now ?? Date.now();
  if (!options.refresh && cache && cache.expiresAt > now) return cache.state;

  try {
    // Settings is a small key/value table. Reading it without a `startsWith`
    // filter keeps this compatible with the in-memory test double and avoids
    // provider-specific LIKE semantics.
    const rows = await db.settings.findMany({ select: { key: true, value: true } });
    const byKey = new Map(
      rows.map((row: { key: string; value: string }) => [row.key, row.value] as const),
    );
    const flag = (...keys: string[]) => keys.some((key) => readEnabled(byKey.get(key)));
    const state: GovernanceState = {
      globalStop: flag(EMERGENCY_KEYS.globalStop, 'emergency:global_stop', 'emergency:stop_all'),
      readOnly: flag(EMERGENCY_KEYS.readOnly, 'emergency:read_only_mode'),
      paidDisabled: flag(EMERGENCY_KEYS.paidDisabled, 'emergency:disable_paid_services'),
      externalCommsStopped: flag(EMERGENCY_KEYS.externalCommsStopped, 'emergency:stop_all_communication'),
      queuesStopped: flag(EMERGENCY_KEYS.queuesStopped, 'emergency:stop_queues'),
      apiKeysBlocked: flag(EMERGENCY_KEYS.apiKeysBlocked, 'emergency:block_api_keys'),
      gpuJobsStopped: flag(EMERGENCY_KEYS.gpuJobsStopped, 'emergency:stop_gpu_jobs'),
      sessionsRevokedAt: null,
      source: 'database',
      capturedAt: now,
    };
    cache = { state, expiresAt: now + STATE_CACHE_TTL_MS };
    return state;
  } catch (error) {
    const state: GovernanceState = {
      globalStop: false,
      readOnly: false,
      paidDisabled: false,
      externalCommsStopped: false,
      queuesStopped: false,
      apiKeysBlocked: false,
      gpuJobsStopped: false,
      sessionsRevokedAt: null,
      source: 'unavailable',
      capturedAt: now,
      detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
    };
    // Do not cache an unavailable read for long — the next call should retry.
    cache = { state, expiresAt: now + 1_000 };
    return state;
  }
}

export interface EnforceOptions {
  /** Skip the audit write (used by the dry-run API and the test suite). */
  audit?: boolean;
  now?: number;
  state?: GovernanceState;
}

/**
 * Evaluate and record a governance decision.
 *
 * Callers must treat anything other than `outcome === 'allow'` as a block. The
 * helper exists so an execution path cannot accidentally invert the check.
 */
export async function enforceGovernance(
  request: GovernanceRequest,
  options: EnforceOptions = {},
): Promise<GovernanceDecision> {
  const state = options.state ?? (await loadGovernanceState({ now: options.now }));
  const decision = evaluateGovernance(request, { state, now: options.now });

  if (options.audit !== false && (decision.outcome !== 'allow' || decision.degraded)) {
    try {
      await writeAuditEvent({
        actorUserId: request.actor?.userId ?? null,
        companyId: request.companyId ?? request.actor?.companyId ?? null,
        action: `governance.${decision.outcome}`,
        resource: request.resource,
        resourceId: request.actor?.agentId ?? request.projectId ?? null,
        details: {
          decisionId: decision.decisionId,
          actionClass: decision.actionClass,
          action: request.action,
          riskLevel: decision.riskLevel,
          policies: decision.violations.map((violation) => violation.policyId),
          missingEvidence: decision.missingEvidence,
          requiredApprovers: decision.requiredApprovers,
          degraded: decision.degraded,
          catalogVersion: decision.catalogVersion,
          source: request.surface ?? 'internal_job',
        },
      });
    } catch (error) {
      // An audit sink failure must never turn a denial into an allowance.
      console.error('[governance] failed to persist decision audit event:', error);
    }
  }

  return decision;
}

/** Convenience wrapper that throws, for execution paths that expect an exception. */
export async function assertGovernance(request: GovernanceRequest, options: EnforceOptions = {}): Promise<GovernanceDecision> {
  const decision = await enforceGovernance(request, options);
  if (decision.outcome === 'deny') throw new GovernanceBlockedError(decision);
  if (decision.outcome === 'require_approval') throw new GovernanceApprovalRequiredError(decision);
  return decision;
}

export class GovernanceBlockedError extends Error {
  readonly decision: GovernanceDecision;
  constructor(decision: GovernanceDecision) {
    super(decision.explanation);
    this.name = 'GovernanceBlockedError';
    this.decision = decision;
  }
}

export class GovernanceApprovalRequiredError extends Error {
  readonly decision: GovernanceDecision;
  constructor(decision: GovernanceDecision) {
    super(decision.explanation);
    this.name = 'GovernanceApprovalRequiredError';
    this.decision = decision;
  }
}

/* ── Tool integration ────────────────────────────────────────────────────── */

/**
 * Map a registered tool onto the governance taxonomy. Tools carry a risk level,
 * not an action class, so the mapping is explicit and conservative: a
 * high-risk tool is treated as an outbound consequential action.
 */
export function actionClassForTool(tool: {
  name: string;
  category?: string;
  risk: 'low' | 'medium' | 'high';
  requiresApproval?: boolean;
}): ActionClass {
  if (tool.category === 'knowledge' || tool.category === 'crm') return 'knowledge.read';
  if (tool.category === 'utility') return 'read.public';
  if (tool.risk === 'high' || tool.requiresApproval) return 'external.communicate';
  if (tool.risk === 'medium') return 'draft.content';
  return 'knowledge.read';
}

/* ── Approval verification ───────────────────────────────────────────────── */

export interface ToolApprovalCheck {
  approvalId: string;
  companyId: string;
  toolName: string;
  args: Record<string, unknown>;
  actionClass: ActionClass;
  allowedApproverRoles?: ApproverRole[];
}

export interface ToolApprovalResult {
  verified: boolean;
  reason: string;
}

/**
 * Resolve an approval id into a verified authorisation for this exact call.
 * Every failure mode returns `verified: false`; there is no "assume approved".
 */
export async function verifyToolApproval(check: ToolApprovalCheck): Promise<ToolApprovalResult> {
  if (!check.approvalId) return { verified: false, reason: 'No approval id supplied.' };

  // Delegates to the single verification implementation. The tool name and its
  // arguments are the bound payload, so a changed argument set invalidates the
  // approval even if the id and tenant are correct.
  const result = await verifyBoundApproval({
    approvalId: check.approvalId,
    companyId: check.companyId,
    actionClass: check.actionClass,
    action: check.toolName,
    resource: `tool:${check.toolName}`,
    payload: { tool: check.toolName, args: check.args },
    allowedApproverRoles: check.allowedApproverRoles,
  });
  return { verified: result.verified, reason: result.reason };
}

/* ── Agent execution helper ──────────────────────────────────────────────── */

export async function enforceAgentExecution(params: {
  companyId: string;
  userId?: string | null;
  agentId: string;
  task: string;
  companyRole?: string | null;
  surface?: GovernanceRequest['surface'];
  declaredRisk?: RiskLevel;
  providerKind?: GovernanceRequest['providerKind'];
}): Promise<GovernanceDecision> {
  return enforceGovernance({
    action: `Execute agent ${params.agentId}`,
    actionClass: 'agent.execute',
    resource: `agent:${params.agentId}`,
    companyId: params.companyId,
    callerCompanyId: params.companyId,
    actor: {
      userId: params.userId ?? null,
      role: toActorRole(params.companyRole),
      companyId: params.companyId,
      agentId: params.agentId,
    },
    surface: params.surface ?? 'customer_workspace',
    declaredRisk: params.declaredRisk,
    providerKind: params.providerKind,
    metadata: { taskChars: params.task.length },
  });
}

export function toActorRole(companyRole: string | null | undefined): ActorRole {
  switch (companyRole) {
    case 'owner':
      return 'organization_owner';
    case 'admin':
      return 'admin';
    case 'manager':
      return 'project_manager';
    case 'member':
    case 'developer':
      return 'developer';
    case 'support':
      return 'customer_support';
    case 'super_admin':
      return 'super_admin';
    default:
      return 'standard_user';
  }
}
