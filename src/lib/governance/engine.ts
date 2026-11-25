/**
 * Governance decision engine.
 *
 * Pure and deterministic: no database, no network, no clock unless the caller
 * passes one. The runtime (`./runtime.ts`) supplies the emergency state and
 * persists the decision; this module only decides.
 *
 * Resolution rules:
 *   - the effective risk is the *most severe* of the taxonomy baseline, the
 *     caller's declared risk and (for explicitly approval-gated requests) high;
 *   - emergency controls are evaluated before ordinary policy;
 *   - among matched policies the most restrictive enforcement wins, so a
 *     lower-precedence level can never loosen a higher one;
 *   - a `require_approval` outcome is satisfied only by a *verified* approval
 *     token (`evidence.approvalVerified`), never by a caller-supplied id;
 *   - required evidence that is missing fails the action (deny for critical
 *     operations, approval-pause otherwise).
 */

import { ACTION_CLASSES, ENFORCEMENT_ORDER, POLICY_LEVEL_PRECEDENCE, RISK_ORDER } from './types';
import type {
  ActionClass,
  ActorRole,
  ApproverRole,
  EvidenceKey,
  Enforcement,
  GovernanceDecision,
  GovernanceRequest,
  GovernanceState,
  PolicyDefinition,
  PolicyViolation,
  RiskLevel,
} from './types';
import { POLICY_CATALOG, POLICY_CATALOG_VERSION } from './catalog';

export interface EvaluateOptions {
  state: GovernanceState;
  now?: number;
  catalog?: readonly PolicyDefinition[];
  /** Deterministic decision id for tests; runtime supplies a random one. */
  decisionId?: string;
}

const APPROVER_RANK: Record<ApproverRole, number> = {
  super_admin: 4,
  admin: 3,
  organization_owner: 2,
  project_manager: 1,
};

const APPROVAL_SATISFIED_BY: EvidenceKey = 'approvalVerified';

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/** Baseline risk for a request, never lower than the taxonomy or the caller's declaration. */
export function effectiveRisk(request: GovernanceRequest): { risk: RiskLevel; escalated: boolean } {
  const baseline = ACTION_CLASSES[request.actionClass]?.risk ?? 'critical';
  let risk = baseline;
  if (request.declaredRisk) risk = maxRisk(risk, request.declaredRisk);
  if (request.requiresApproval) risk = maxRisk(risk, 'high');
  return { risk, escalated: RISK_ORDER[risk] > RISK_ORDER[request.declaredRisk ?? baseline] };
}

function matchStatic(policy: PolicyDefinition, request: GovernanceRequest, risk: RiskLevel): boolean {
  const { match } = policy;
  if (match.actionClasses && !match.actionClasses.includes(request.actionClass)) return false;
  if (match.minRisk && RISK_ORDER[risk] < RISK_ORDER[match.minRisk]) return false;
  if (match.minDeclaredRisk) {
    const declared = request.declaredRisk;
    if (!declared || RISK_ORDER[declared] < RISK_ORDER[match.minDeclaredRisk]) return false;
  }
  if (match.providerKinds && (!request.providerKind || !match.providerKinds.includes(request.providerKind))) return false;
  if (match.surfaces && (!request.surface || !match.surfaces.includes(request.surface))) return false;
  if (match.actorRoles) {
    const role = request.actor?.role;
    if (!role || !match.actorRoles.includes(role)) return false;
  }
  return true;
}

/** Contextual checks that the declarative matcher cannot express. */
function runInvariant(policy: PolicyDefinition, request: GovernanceRequest): { fails: boolean; reason: string } {
  switch (policy.invariant) {
    case 'tenant_boundary': {
      const resourceTenant = request.companyId ?? null;
      const callerTenant = request.callerCompanyId ?? request.actor?.companyId ?? null;
      if (resourceTenant && callerTenant && resourceTenant !== callerTenant) {
        return { fails: true, reason: policy.reason };
      }
      return { fails: false, reason: '' };
    }
    case 'project_boundary': {
      const resourceProject = request.projectId ?? null;
      const callerProject = request.actor?.projectId ?? null;
      if (resourceProject && callerProject && resourceProject !== callerProject) {
        return { fails: true, reason: policy.reason };
      }
      return { fails: false, reason: '' };
    }
    case 'member_required': {
      if (request.actor?.role === 'public_visitor' || request.surface === 'public_webchat') {
        return { fails: true, reason: policy.reason };
      }
      return { fails: false, reason: '' };
    }
    default:
      return { fails: false, reason: '' };
  }
}

function requiredApproversFor(policy: PolicyDefinition): ApproverRole[] {
  return policy.approvers ?? ['super_admin'];
}

function sortApprovers(roles: Iterable<ApproverRole>): ApproverRole[] {
  return [...new Set(roles)].sort((a, b) => APPROVER_RANK[b] - APPROVER_RANK[a]);
}

function missingEvidenceFor(policy: PolicyDefinition, request: GovernanceRequest): EvidenceKey[] {
  if (!policy.requiredEvidence?.length) return [];
  const evidence = request.evidence ?? {};
  return policy.requiredEvidence.filter((key) => {
    if (key === APPROVAL_SATISFIED_BY) return evidence.approvalVerified !== true;
    const value = evidence[key];
    return value !== true && !(typeof value === 'string' && value.trim().length > 0);
  });
}

export interface EmergencyViolation {
  policyId: string;
  reason: string;
}

/** Emergency controls. Evaluated before, and independently of, ordinary policy. */
export function emergencyViolations(
  request: GovernanceRequest,
  state: GovernanceState,
): EmergencyViolation[] {
  const props = ACTION_CLASSES[request.actionClass];
  const violations: EmergencyViolation[] = [];

  if (state.globalStop && !props?.safeRead) {
    violations.push({
      policyId: 'EMERG-GLOBAL-STOP',
      reason: 'Global emergency stop is active: autonomous and state-changing execution is suspended.',
    });
  }
  if (state.readOnly && (props?.mutating || request.actionClass === 'data.export')) {
    violations.push({
      policyId: 'EMERG-READONLY',
      reason: 'Read-only mode is active: state-changing actions are suspended until an operator lifts it.',
    });
  }
  if (state.paidDisabled && request.providerKind === 'paid') {
    violations.push({
      policyId: 'EMERG-PAID-DISABLED',
      reason: 'Paid services are disabled platform-wide; choose an authorised free or local provider.',
    });
  }
  if (state.externalCommsStopped && ((props?.external && props.mutating) || request.actionClass === 'external.communicate' || request.actionClass === 'content.publish')) {
    violations.push({
      policyId: 'EMERG-COMMS-STOP',
      reason: 'External communication is suspended platform-wide.',
    });
  }
  if (state.queuesStopped && request.actionClass === 'queue.dispatch') {
    violations.push({
      policyId: 'EMERG-QUEUE-STOP',
      reason: 'Job queues are stopped; this dispatch cannot be accepted.',
    });
  }
  return violations;
}

export function evaluateGovernance(request: GovernanceRequest, options: EvaluateOptions): GovernanceDecision {
  const now = options.now ?? Date.now();
  const catalog = options.catalog ?? POLICY_CATALOG;
  const state = options.state;
  const { risk, escalated } = effectiveRisk(request);

  const violations: PolicyViolation[] = [];
  const matchedPolicyIds: string[] = [];
  const approvers = new Set<ApproverRole>();
  const missingEvidence = new Set<EvidenceKey>();

  const record = (
    policy: Pick<PolicyDefinition, 'id' | 'version' | 'level' | 'severity'> & { enforcement: Enforcement },
    reason: string,
    missing: EvidenceKey[] = [],
  ) => {
    matchedPolicyIds.push(policy.id);
    violations.push({
      policyId: policy.id,
      policyVersion: policy.version,
      level: policy.level,
      severity: policy.severity,
      enforcement: policy.enforcement,
      reason,
      missingEvidence: missing,
    });
    for (const key of missing) missingEvidence.add(key);
  };

  // 1. Emergency controls.
  for (const emergency of emergencyViolations(request, state)) {
    record(
      { id: emergency.policyId, version: '1.0.0', level: 'platform_security', severity: 'critical', enforcement: 'deny' },
      emergency.reason,
    );
  }

  // 2. Degraded state: the emergency flags could not be read.
  if (state.source === 'unavailable' && RISK_ORDER[risk] >= RISK_ORDER.high) {
    record(
      { id: 'EMERG-STATE-UNVERIFIED', version: '1.0.0', level: 'platform_security', severity: 'critical', enforcement: 'deny' },
      'Emergency controls could not be verified for a high-impact action. Execution is blocked until governance state is readable.',
    );
  }

  // 3. Ordinary policy.
  for (const policy of catalog) {
    // Static match first: an invariant still only applies to the action classes
    // it names, otherwise a project-scope rule would fire on every read.
    if (!matchStatic(policy, request, risk)) continue;
    if (policy.invariant) {
      const outcome = runInvariant(policy, request);
      if (outcome.fails) record(policy, outcome.reason);
      continue;
    }

    const missing = missingEvidenceFor(policy, request);
    const approvalSatisfied = request.evidence?.approvalVerified === true;

    if (missing.length > 0) {
      const enforcement: Enforcement = policy.onMissingEvidence === 'deny' ? 'deny' : 'require_approval';
      record(
        {
          id: policy.id,
          version: policy.version,
          level: policy.level,
          severity: policy.severity,
          enforcement,
        },
        `${policy.reason} Missing: ${missing.join(', ')}.`,
        missing,
      );
      if (enforcement === 'require_approval') requiredApproversFor(policy).forEach((role) => approvers.add(role));
      continue;
    }

    // A policy that declares required evidence is a guard: when the evidence is
    // present the policy's condition is satisfied and it can never deny by
    // itself. (Otherwise `paid provider + costAuthorized` would still be denied.)
    if (policy.requiredEvidence?.length) {
      matchedPolicyIds.push(policy.id);
      if (policy.enforcement === 'require_approval' && !approvalSatisfied) {
        record(policy, policy.reason);
        requiredApproversFor(policy).forEach((role) => approvers.add(role));
      }
      continue;
    }

    if (policy.enforcement === 'require_approval' && !approvalSatisfied) {
      record(policy, policy.reason);
      requiredApproversFor(policy).forEach((role) => approvers.add(role));
      continue;
    }

    // A satisfied approval or an allow rule is recorded for transparency but
    // does not block. Deny rules are recorded as blocking.
    if (policy.enforcement === 'deny') {
      record(policy, policy.reason);
    } else {
      matchedPolicyIds.push(policy.id);
    }
  }

  const blocking = violations.filter((violation) => violation.enforcement !== 'allow');
  const outcome: Enforcement = blocking.some((v) => v.enforcement === 'deny')
    ? 'deny'
    : blocking.some((v) => v.enforcement === 'require_approval')
      ? 'require_approval'
      : 'allow';

  const missingList = [...missingEvidence];
  const explanation = buildExplanation(outcome, request, risk, violations, missingList, state);

  return {
    allowed: outcome === 'allow',
    outcome,
    actionClass: request.actionClass,
    riskLevel: risk,
    escalated,
    decisionId: options.decisionId ?? `gov_${now}_${Math.random().toString(36).slice(2, 10)}`,
    matchedPolicyIds: [...new Set(matchedPolicyIds)],
    violations: violations.filter((violation) => ENFORCEMENT_ORDER[violation.enforcement] > ENFORCEMENT_ORDER.allow),
    requiredApprovers: sortApprovers(approvers),
    missingEvidence: missingList,
    degraded: state.source === 'unavailable',
    explanation,
    catalogVersion: POLICY_CATALOG_VERSION,
    state: {
      globalStop: state.globalStop,
      readOnly: state.readOnly,
      paidDisabled: state.paidDisabled,
      externalCommsStopped: state.externalCommsStopped,
      queuesStopped: state.queuesStopped,
      source: state.source,
    },
    evaluatedAt: now,
  };
}

function buildExplanation(
  outcome: Enforcement,
  request: GovernanceRequest,
  risk: RiskLevel,
  violations: PolicyViolation[],
  missing: EvidenceKey[],
  state: GovernanceState,
): string {
  const target = `${request.action} (${request.actionClass}, risk=${risk})`;
  if (outcome === 'allow') {
    const suffix = state.source === 'unavailable'
      ? ' Emergency controls could not be read, so this decision is flagged degraded.'
      : '';
    return `Allowed: ${target} matched no restricting policy.${suffix}`;
  }
  const reasons = violations.filter((v) => v.enforcement !== 'allow').map((v) => v.reason);
  const evidence = missing.length ? ` Required evidence missing: ${missing.join(', ')}.` : '';
  const prefix = outcome === 'deny' ? 'Denied' : 'Approval required';
  const deduped = [...new Set(reasons)].slice(0, 4).join(' ');
  return `${prefix}: ${target}. ${deduped}${evidence}`.trim();
}

/**
 * Catalogue integrity checks. Exposed so the API and the test suite can refuse a
 * malformed catalogue rather than silently trusting it.
 */
export function validatePolicyCatalog(catalog: readonly PolicyDefinition[] = POLICY_CATALOG): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();

  for (const policy of catalog) {
    if (ids.has(policy.id)) issues.push(`Duplicate policy id: ${policy.id}`);
    ids.add(policy.id);

    if (!/^[A-Z]+(-[A-Z0-9]+)+$/.test(policy.id)) issues.push(`Malformed policy id: ${policy.id}`);
    if (!/^\d+\.\d+\.\d+$/.test(policy.version)) issues.push(`Policy ${policy.id} has a non-semver version`);
    if (policy.level === 'platform_security' && policy.enforcement === 'allow') {
      issues.push(`Policy ${policy.id} cannot grant allowance at platform_security level`);
    }
    if (policy.enforcement === 'require_approval' && !policy.approvers?.length) {
      issues.push(`Policy ${policy.id} requires approval but names no approvers`);
    }
    if (policy.level === 'platform_security' && policy.approvers?.some((role) => role !== 'super_admin')) {
      issues.push(`Policy ${policy.id} must be approvable only by super_admin`);
    }
    if (!policy.tests.length) issues.push(`Policy ${policy.id} has no test cases`);
    if (!policy.owner) issues.push(`Policy ${policy.id} has no owner`);
    if (!policy.effectiveDate || !policy.reviewDate) issues.push(`Policy ${policy.id} is missing dates`);
    if (policy.reviewDate < policy.effectiveDate) issues.push(`Policy ${policy.id} has reviewDate before effectiveDate`);
    if (policy.onMissingEvidence === 'deny' && !policy.requiredEvidence?.length) {
      issues.push(`Policy ${policy.id} sets onMissingEvidence=deny without requiredEvidence`);
    }
    if (policy.match.providerKinds && !policy.match.actionClasses && policy.invariant === undefined && policy.enforcement === 'deny' && !policy.requiredEvidence?.length) {
      // GLOB-PAID-001 relies on evidence rather than a blanket deny; keep this
      // as a warning-free branch by construction.
    }
  }

  // A policy may never be duplicated at a "lower" level to loosen a higher rule:
  // all policies are code-defined, so this is a structural check only.
  const byLevel = new Map<PolicyDefinition['level'], PolicyDefinition[]>();
  for (const policy of catalog) {
    byLevel.set(policy.level, [...(byLevel.get(policy.level) ?? []), policy]);
  }
  const levels = [...byLevel.keys()].map((level) => POLICY_LEVEL_PRECEDENCE[level]);
  if (levels.some((value) => typeof value !== 'number')) issues.push('Unknown policy level in catalogue');

  return issues;
}

export const APPROVER_ROLE_LABELS: Record<ApproverRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  organization_owner: 'Organization Owner',
  project_manager: 'Project Manager',
};

export function actorRoleAtLeast(role: ActorRole, required: ApproverRole): boolean {
  const rank: Record<string, number> = {
    public_visitor: 0,
    standard_user: 1,
    customer_support: 1,
    developer: 2,
    project_manager: 3,
    organization_owner: 4,
    admin: 5,
    super_admin: 6,
  };
  return (rank[role] ?? 0) >= (rank[required] ?? 99);
}

export function toApprovalRisk(risk: RiskLevel): 'low' | 'medium' | 'high' | 'critical' {
  if (risk === 'normal') return 'medium';
  if (risk === 'moderate') return 'medium';
  return risk;
}

export type { ActionClass };
