export {
  ACTION_CLASSES,
  ENFORCEMENT_ORDER,
  POLICY_LEVEL_PRECEDENCE,
  RISK_ORDER,
} from './types';
export type {
  ActionClass,
  ActionEvidence,
  ActorRole,
  ApproverRole,
  Enforcement,
  EvidenceKey,
  GovernanceActor,
  GovernanceDecision,
  GovernanceRequest,
  GovernanceState,
  PolicyDefinition,
  PolicyLevel,
  PolicyViolation,
  ProviderKind,
  RiskLevel,
  Surface,
} from './types';

export { POLICY_CATALOG, POLICY_CATALOG_BY_ID, POLICY_CATALOG_VERSION } from './catalog';
export {
  actorRoleAtLeast,
  APPROVER_ROLE_LABELS,
  effectiveRisk,
  emergencyViolations,
  evaluateGovernance,
  toApprovalRisk,
  validatePolicyCatalog,
} from './engine';
export type { EvaluateOptions } from './engine';

export {
  approvalDigest,
  approvalTypeForAction,
  consumeApproval,
  createBoundApproval,
  DEFAULT_APPROVAL_TTL_MINUTES,
  defaultApproversFor,
  extractApprovalId,
  isApprovalConsumed,
  MAX_APPROVAL_TTL_MINUTES,
  resolveReviewerRole,
  verifyBoundApproval,
} from './approvals';
export type {
  ConsumeApprovalResult,
  CreateBoundApprovalInput,
  CreatedApproval,
  VerifiedApproval,
  VerifyBoundApprovalInput,
} from './approvals';

export {
  assertGovernance,
  actionClassForTool,
  EMERGENCY_KEYS,
  enforceAgentExecution,
  enforceGovernance,
  GovernanceApprovalRequiredError,
  GovernanceBlockedError,
  loadGovernanceState,
  resetGovernanceStateCache,
  toActorRole,
  verifyToolApproval,
} from './runtime';
export type { EnforceOptions, ToolApprovalCheck, ToolApprovalResult } from './runtime';

export {
  buildApprovalBinding,
  canonicalJson,
  digestActionPayload,
  MAX_APPROVAL_AGE_MS,
  normaliseReviewerRole,
  verifyApprovalBinding,
} from './approval-binding';
export type { ApprovalBindingRecord, ApprovalClaim, ApprovalRowLike, ApprovalVerification } from './approval-binding';
