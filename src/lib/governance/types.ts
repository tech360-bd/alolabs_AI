/**
 * Central Governance & Policy Engine — shared vocabulary.
 *
 * The platform already had *fragments* of policy: `src/lib/tools/policy.ts`
 * authorises tools, `src/lib/multi-tenant-ai/policy.ts` authorises providers,
 * `src/lib/approval-engine` routes risk. What it did not have was one
 * authoritative layer that every consequential action passes through, and
 * nothing at all that enforced the Super Admin emergency toggles (they were
 * stored in `Settings` and rendered in the UI, but no execution path read
 * them).
 *
 * This module defines the vocabulary for that layer. Everything here is
 * serialisable so a decision can be audited, replayed and tested without the
 * database.
 *
 * Precedence (highest first) — a lower level can never loosen a higher one:
 *   1. platform_security   (tenant isolation, secrets, privilege, safety)
 *   2. legal_regulatory    (licensing, likeness/voice consent, regulated advice)
 *   3. global              (ALO Labs-wide operating rules)
 *   4. organization        (tenant policy)
 *   5. project             (project policy)
 *   6. user                (user instructions / preferences)
 *   7. agent               (individual agent execution preferences)
 */

export type RiskLevel = 'low' | 'normal' | 'moderate' | 'high' | 'critical';

/** Numeric ordering used for conflict resolution (higher = more severe). */
export const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  normal: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

export type Enforcement = 'allow' | 'require_approval' | 'deny';

/** Restrictiveness ordering (higher wins when two policies disagree). */
export const ENFORCEMENT_ORDER: Record<Enforcement, number> = {
  allow: 0,
  require_approval: 1,
  deny: 2,
};

export type PolicyLevel =
  | 'platform_security'
  | 'legal_regulatory'
  | 'global'
  | 'organization'
  | 'project'
  | 'user'
  | 'agent';

/** 1 = highest precedence. Policies at a lower level never override a higher deny. */
export const POLICY_LEVEL_PRECEDENCE: Record<PolicyLevel, number> = {
  platform_security: 1,
  legal_regulatory: 2,
  global: 3,
  organization: 4,
  project: 5,
  user: 6,
  agent: 7,
};

export type ActorRole =
  | 'public_visitor'
  | 'standard_user'
  | 'customer_support'
  | 'developer'
  | 'project_manager'
  | 'organization_owner'
  | 'admin'
  | 'super_admin';

/** Roles allowed to grant a human approval for a policy. */
export type ApproverRole = 'organization_owner' | 'project_manager' | 'admin' | 'super_admin';

/**
 * Normalised taxonomy of consequential actions.
 *
 * Callers must state the class explicitly rather than relying on free-text
 * action names — a policy engine that pattern-matches prose is a policy engine
 * that can be talked around.
 */
export type ActionClass =
  | 'status.read'
  | 'audit.read'
  | 'knowledge.read'
  | 'read.public'
  | 'draft.content'
  | 'media.generate'
  | 'agent.execute'
  | 'write.project'
  | 'queue.dispatch'
  | 'external.call'
  | 'external.communicate'
  | 'content.publish'
  | 'data.export'
  | 'data.delete'
  | 'schema.migrate'
  | 'deploy.preview'
  | 'deploy.production'
  | 'dns.change'
  | 'infra.change'
  | 'financial.transact'
  | 'secret.access'
  | 'privilege.change'
  | 'policy.change'
  | 'agent.registry.change'
  | 'code.execute.untrusted';

export interface ActionClassProperties {
  /** Baseline risk when the caller declares nothing lower. */
  risk: RiskLevel;
  /** True when the action changes state (blocked by read-only mode). */
  mutating: boolean;
  /** True when the action leaves the platform boundary. */
  external: boolean;
  /** True when the action is a pure read that remains safe during a global stop. */
  safeRead: boolean;
}

export const ACTION_CLASSES: Record<ActionClass, ActionClassProperties> = {
  'status.read': { risk: 'low', mutating: false, external: false, safeRead: true },
  'audit.read': { risk: 'low', mutating: false, external: false, safeRead: true },
  'knowledge.read': { risk: 'low', mutating: false, external: false, safeRead: true },
  'read.public': { risk: 'low', mutating: false, external: true, safeRead: true },
  'draft.content': { risk: 'normal', mutating: true, external: false, safeRead: false },
  'media.generate': { risk: 'normal', mutating: true, external: true, safeRead: false },
  'agent.execute': { risk: 'moderate', mutating: true, external: false, safeRead: false },
  'write.project': { risk: 'moderate', mutating: true, external: false, safeRead: false },
  'queue.dispatch': { risk: 'moderate', mutating: true, external: false, safeRead: false },
  'external.call': { risk: 'normal', mutating: true, external: true, safeRead: false },
  'external.communicate': { risk: 'high', mutating: true, external: true, safeRead: false },
  'content.publish': { risk: 'high', mutating: true, external: true, safeRead: false },
  'data.export': { risk: 'high', mutating: false, external: true, safeRead: false },
  'data.delete': { risk: 'critical', mutating: true, external: false, safeRead: false },
  'schema.migrate': { risk: 'critical', mutating: true, external: false, safeRead: false },
  'deploy.preview': { risk: 'moderate', mutating: true, external: true, safeRead: false },
  'deploy.production': { risk: 'critical', mutating: true, external: true, safeRead: false },
  'dns.change': { risk: 'critical', mutating: true, external: true, safeRead: false },
  'infra.change': { risk: 'high', mutating: true, external: true, safeRead: false },
  'financial.transact': { risk: 'critical', mutating: true, external: true, safeRead: false },
  'secret.access': { risk: 'critical', mutating: false, external: false, safeRead: false },
  'privilege.change': { risk: 'critical', mutating: true, external: false, safeRead: false },
  'policy.change': { risk: 'critical', mutating: true, external: false, safeRead: false },
  'agent.registry.change': { risk: 'critical', mutating: true, external: false, safeRead: false },
  'code.execute.untrusted': { risk: 'critical', mutating: true, external: false, safeRead: false },
};

/**
 * Evidence a consequential action must present. A policy lists the evidence
 * keys it requires; the engine reports exactly what is missing so the caller can
 * ask for it rather than fabricate success.
 */
export interface ActionEvidence {
  testsPassed?: boolean;
  buildPassed?: boolean;
  browserVerified?: boolean;
  backupTaken?: boolean;
  rollbackPlan?: boolean;
  /** Id of a DB `Approval` row verified against this exact action (see approval-binding.ts). */
  approvalId?: string | null;
  /** Set only by the approval-binding verifier, never by an agent. */
  approvalVerified?: boolean;
  costAuthorized?: boolean;
  humanReview?: boolean;
  consentRecorded?: boolean;
}

export type EvidenceKey = keyof ActionEvidence;

export type ProviderKind = 'local' | 'verified_free' | 'paid';

export interface GovernanceActor {
  userId?: string | null;
  role: ActorRole;
  companyId?: string | null;
  projectId?: string | null;
  /** Agent identifier when the action is taken by an agent on a user's behalf. */
  agentId?: string | null;
}

/** Which product surface is asking. Public WebChat has a narrower boundary. */
export type Surface = 'public_webchat' | 'customer_workspace' | 'super_admin' | 'internal_job' | 'system';

export interface GovernanceRequest {
  /** Human-readable description, persisted in the decision trace. */
  action: string;
  actionClass: ActionClass;
  resource: string;
  /** Tenant that owns the resource being touched. */
  companyId?: string | null;
  /** Tenant the caller belongs to. A mismatch is a hard tenant-boundary violation. */
  callerCompanyId?: string | null;
  projectId?: string | null;
  actor?: GovernanceActor;
  surface?: Surface;
  /** Caller-declared risk. The engine never lowers the taxonomy baseline. */
  declaredRisk?: RiskLevel;
  requiresApproval?: boolean;
  providerKind?: ProviderKind;
  evidence?: ActionEvidence;
  /** Extra, non-authoritative context for the audit record. */
  metadata?: Record<string, unknown>;
}

export interface PolicyMatch {
  actionClasses?: ActionClass[];
  /** Applies when the effective risk is at least this level. */
  minRisk?: RiskLevel;
  /**
   * Applies only when the caller explicitly declares at least this risk.
   * Used for policies that depend on content the engine cannot inspect (e.g. a
   * regulated document or a voice-clone request): the caller must say so, and
   * declaring a higher risk never lowers the taxonomy baseline either.
   */
  minDeclaredRisk?: RiskLevel;
  providerKinds?: ProviderKind[];
  surfaces?: Surface[];
  /** Applies when any of these actor roles is the caller. */
  actorRoles?: ActorRole[];
}

/**
 * Some rules depend on context the declarative matcher cannot express (the
 * caller's tenant vs the resource's tenant, the project vs the resource's
 * project). Those are engine invariants: they are declared in the catalogue for
 * transparency, and the engine runs the named check itself.
 */
export type EngineInvariant = 'tenant_boundary' | 'project_boundary' | 'member_required';

export interface PolicyDefinition {
  /** Stable identifier, e.g. `SEC-TENANT-001`. Never reused for a different rule. */
  id: string;
  /** Semver of this policy rule. Bumped whenever the rule's behaviour changes. */
  version: string;
  name: string;
  description: string;
  level: PolicyLevel;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  match: PolicyMatch;
  /** When set, the engine runs this contextual check instead of a static match. */
  invariant?: EngineInvariant;
  enforcement: Enforcement;
  /** Roles allowed to approve when `enforcement` is `require_approval`. */
  approvers?: ApproverRole[];
  /** Evidence the action must present before it may proceed. */
  requiredEvidence?: EvidenceKey[];
  /**
   * What happens when required evidence is missing. Critical operations default
   * to `deny`; everything else may pause for approval.
   */
  onMissingEvidence?: 'deny' | 'require_approval';
  /** Human-readable reason shown to the user when the policy fires. */
  reason: string;
  owner: string;
  effectiveDate: string;
  reviewDate: string;
  /** Policy test case ids that must stay green (see governance test suite). */
  tests: string[];
}

/** Runtime snapshot of the emergency controls. Missing keys are treated as off. */
export interface GovernanceState {
  globalStop: boolean;
  readOnly: boolean;
  paidDisabled: boolean;
  externalCommsStopped: boolean;
  queuesStopped: boolean;
  apiKeysBlocked: boolean;
  sessionsRevokedAt: string | null;
  gpuJobsStopped: boolean;
  /** `unavailable` means the state could not be read; the engine degrades safely. */
  source: 'database' | 'unavailable';
  capturedAt: number;
  detail?: string;
}

export interface PolicyViolation {
  policyId: string;
  policyVersion: string;
  level: PolicyLevel;
  severity: PolicyDefinition['severity'];
  enforcement: Enforcement;
  reason: string;
  missingEvidence: EvidenceKey[];
}

export interface GovernanceDecision {
  allowed: boolean;
  outcome: Enforcement;
  actionClass: ActionClass;
  riskLevel: RiskLevel;
  /** True when the decision came out more restrictive than the caller declared. */
  escalated: boolean;
  decisionId: string;
  matchedPolicyIds: string[];
  violations: PolicyViolation[];
  requiredApprovers: ApproverRole[];
  missingEvidence: EvidenceKey[];
  /** True when the emergency-state read failed and the engine degraded. */
  degraded: boolean;
  explanation: string;
  catalogVersion: string;
  state: Pick<GovernanceState, 'globalStop' | 'readOnly' | 'paidDisabled' | 'externalCommsStopped' | 'queuesStopped' | 'source'>;
  evaluatedAt: number;
}
