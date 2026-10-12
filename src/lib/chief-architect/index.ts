/**
 * AI Chief Architect — deterministic builder-guidance and review gate.
 *
 * This is a rules engine, not a language model. It makes the architecture
 * decision explicit and auditable and it REJECTS implementations that fail
 * mandatory checks. It never deploys anything: an "eligible" verdict only means
 * the change may be put in front of a human approver.
 *
 * Decision order for a build request:
 *   objective → is a model needed? → blockers → approach → approvals →
 *   datasets → mandatory gates
 *
 * Review order for an implementation submission:
 *   tests → type/build → tenant isolation → quality thresholds → rollback plan →
 *   approvals. Any failed mandatory check yields `rejected`.
 */

export type Approach =
  | 'no_model'
  | 'prompting'
  | 'rag'
  | 'fine_tuning'
  | 'distillation'
  | 'new_training';

export interface BuildRequest {
  id: string;
  objective: string;
  /** Existing repository components the builder must reuse before writing new code. */
  existingComponents: string[];
  needsLanguageUnderstanding: boolean;
  needsFreshOrPrivateKnowledge: boolean;
  needsBehaviourOrFormatChange: boolean;
  /** Licensed, deduplicated, privacy-filtered labelled examples available. */
  labelledExamples: number;
  datasetLicenseVerified: boolean;
  partnerDataInvolved: boolean;
  partnerIsolationVerified: boolean;
  computeAvailable: boolean;
  evaluationHarnessAvailable: boolean;
  explicitTrainingApproved: boolean;
  /** The change sends messages, moves money, deletes, publishes or grants access. */
  externalSideEffects: boolean;
}

export interface Gate {
  id: string;
  description: string;
  mandatory: boolean;
}

export interface ArchitectureDecision {
  requestId: string;
  approach: Approach;
  rationale: string[];
  blockers: string[];
  requiredApprovals: string[];
  requiredDatasets: string[];
  reusedComponents: string[];
  gates: Gate[];
  /** Always false: the architect never deploys. */
  autoDeploy: false;
}

export const QUALITY_THRESHOLDS = {
  /** Minimum share of held-out representative tasks completed correctly. */
  taskSuccessRate: 0.8,
  /** Minimum share of factual claims that cite a retrievable source (RAG and reports). */
  citationCoverage: 0.9,
  /** Maximum policy violations on the evaluation set. */
  maxPolicyViolations: 0,
  /** A fine-tuned model must beat the prompted baseline on the held-out set by this margin. */
  minFineTuneUplift: 0.02,
  /** Minimum labelled examples before fine-tuning is considered at all. */
  minLabelledExamplesForFineTuning: 500,
} as const;

const BASE_GATES: Gate[] = [
  { id: 'tests.pass', description: 'All automated tests pass (unit, integration).', mandatory: true },
  { id: 'typecheck.pass', description: 'Typecheck passes with zero errors.', mandatory: true },
  { id: 'build.pass', description: 'Production build succeeds.', mandatory: true },
  { id: 'tenant.isolation', description: 'Cross-tenant and cross-department access tests are denied.', mandatory: true },
  { id: 'rollback.plan', description: 'A rollback plan is written and references the previous version.', mandatory: true },
  { id: 'changes.reviewed', description: 'Diff reviewed; no secrets, credentials or generated artifacts committed.', mandatory: true },
];

// ─── Decision ────────────────────────────────────────────────────────────────

export function decideArchitecture(request: BuildRequest): ArchitectureDecision {
  const rationale: string[] = [];
  const blockers: string[] = [];
  const approvals: string[] = [];
  const datasets: string[] = [];
  const gates: Gate[] = [...BASE_GATES];

  if (request.partnerDataInvolved && !request.partnerIsolationVerified) {
    blockers.push('Partner-company data is involved but tenant isolation for it has not been verified.');
  }

  let approach: Approach;
  if (!request.needsLanguageUnderstanding) {
    approach = 'no_model';
    rationale.push('The task is deterministic or rule-based; a model adds cost and variance without a measured benefit.');
  } else if (request.needsFreshOrPrivateKnowledge) {
    approach = 'rag';
    rationale.push('The answer depends on current or private knowledge; retrieval with citations is cheaper and auditable than training.');
    datasets.push('Department knowledge sources: licensed, versioned, access-controlled documents.');
    gates.push({ id: 'rag.citations', description: `Citation coverage ≥ ${QUALITY_THRESHOLDS.citationCoverage} on the retrieval evaluation set.`, mandatory: true });
    gates.push({ id: 'rag.retrieval', description: 'Retrieval evaluation (recall@5) reported per department scope.', mandatory: true });
  } else if (request.needsBehaviourOrFormatChange) {
    if (request.labelledExamples >= QUALITY_THRESHOLDS.minLabelledExamplesForFineTuning && request.datasetLicenseVerified) {
      approach = 'fine_tuning';
      rationale.push('A consistent behaviour or format change is needed and enough licensed labelled examples exist. Fine-tune an adapter, then compare with the prompted baseline.');
      datasets.push('Labelled train/validation/test split: deduplicated, privacy-filtered, licence recorded.');
      gates.push({ id: 'ft.uplift', description: `Fine-tuned model beats the prompted baseline by ≥ ${QUALITY_THRESHOLDS.minFineTuneUplift} on the held-out set.`, mandatory: true });
      approvals.push('model_owner');
    } else {
      approach = 'prompting';
      rationale.push(
        request.labelledExamples < QUALITY_THRESHOLDS.minLabelledExamplesForFineTuning
          ? `Only ${request.labelledExamples} licensed labelled examples exist (need ${QUALITY_THRESHOLDS.minLabelledExamplesForFineTuning}). Start with prompting and collect examples before considering fine-tuning.`
          : 'Labelled examples exist but their licence is not verified. Prompting first; fine-tuning requires a verified licence.',
      );
    }
  } else {
    approach = 'prompting';
    rationale.push('A general language task with no private data or behaviour change: a well-specified prompt with evaluation is sufficient.');
  }

  if (request.explicitTrainingApproved) {
    if (request.computeAvailable && request.evaluationHarnessAvailable) {
      approach = 'new_training';
      rationale.push('New training was explicitly approved and compute plus an evaluation harness are available.');
      approvals.push('model_owner');
      approvals.push('security_reviewer');
      datasets.push('Full training corpus with documented provenance, licence and privacy review.');
    } else {
      blockers.push('New training was requested but approved compute and an evaluation harness are not both available. Training is not started.');
    }
  }

  if (request.externalSideEffects) approvals.push('human_approval_for_external_actions');
  if (request.partnerDataInvolved) approvals.push('partner_data_owner');

  const reusedComponents = [...request.existingComponents];
  if (reusedComponents.length === 0) {
    rationale.push('No existing repository component was declared as reusable. The builder must inspect the repository before writing new code.');
  }

  return {
    requestId: request.id,
    approach,
    rationale,
    blockers,
    requiredApprovals: [...new Set(approvals)],
    requiredDatasets: datasets,
    reusedComponents,
    gates,
    autoDeploy: false,
  };
}

// ─── Review ──────────────────────────────────────────────────────────────────

export interface ImplementationSubmission {
  requestId: string;
  approach: Approach;
  tests: { passed: number; failed: number };
  typecheckPassed: boolean;
  buildPassed: boolean;
  tenantIsolationTests: { passed: number; failed: number };
  /** Metric values measured on the held-out evaluation set. */
  evals?: { taskSuccessRate?: number; citationCoverage?: number; policyViolations?: number };
  /** Prompted-baseline measurement on the same set (required for fine_tuning). */
  baselineTaskSuccessRate?: number;
  rollbackPlan: string | null;
  changedFiles: string[];
  approvals: Partial<Record<string, boolean>>;
}

export type ReviewVerdict = 'rejected' | 'awaiting_approval' | 'eligible';

export interface ReviewResult {
  requestId: string;
  verdict: ReviewVerdict;
  failures: string[];
  pendingApprovals: string[];
  /** Always false: eligibility is not deployment. */
  autoDeploy: false;
}

const SECRET_PATTERNS: RegExp[] = [/\.env($|\.)/, /(^|\/)db\/.*\.db/, /\.(pem|key)$/, /(^|\/)node_modules\//, /(^|\/)\.next\//];

export function reviewImplementation(
  submission: ImplementationSubmission,
  decision: ArchitectureDecision,
): ReviewResult {
  const failures: string[] = [];

  if (submission.requestId !== decision.requestId) failures.push('submission is for a different request');
  if (submission.approach !== decision.approach) failures.push(`implementation approach ${submission.approach} differs from decided approach ${decision.approach}`);
  if (decision.blockers.length > 0) failures.push(`unresolved blockers: ${decision.blockers.length}`);

  if (!(submission.tests.failed === 0 && submission.tests.passed > 0)) failures.push('automated tests did not all pass');
  if (!submission.typecheckPassed) failures.push('typecheck failed');
  if (!submission.buildPassed) failures.push('production build failed');
  if (!(submission.tenantIsolationTests.failed === 0 && submission.tenantIsolationTests.passed > 0)) {
    failures.push('tenant isolation tests did not all pass');
  }

  const evals = submission.evals ?? {};
  if (evals.taskSuccessRate === undefined) failures.push('task success rate not measured');
  else if (evals.taskSuccessRate < QUALITY_THRESHOLDS.taskSuccessRate) {
    failures.push(`task success rate ${evals.taskSuccessRate} below ${QUALITY_THRESHOLDS.taskSuccessRate}`);
  }
  if (evals.policyViolations === undefined) failures.push('policy violations not measured');
  else if (evals.policyViolations > QUALITY_THRESHOLDS.maxPolicyViolations) {
    failures.push(`policy violations ${evals.policyViolations} exceed ${QUALITY_THRESHOLDS.maxPolicyViolations}`);
  }
  if (decision.approach === 'rag' && (evals.citationCoverage === undefined || evals.citationCoverage < QUALITY_THRESHOLDS.citationCoverage)) {
    failures.push(`citation coverage below ${QUALITY_THRESHOLDS.citationCoverage}`);
  }
  if (decision.approach === 'fine_tuning') {
    if (submission.baselineTaskSuccessRate === undefined || evals.taskSuccessRate === undefined) {
      failures.push('fine-tuned model has no measured prompted baseline');
    } else if (evals.taskSuccessRate - submission.baselineTaskSuccessRate < QUALITY_THRESHOLDS.minFineTuneUplift) {
      failures.push(`fine-tuned model does not beat the prompted baseline by ${QUALITY_THRESHOLDS.minFineTuneUplift}`);
    }
  }

  if (!submission.rollbackPlan || submission.rollbackPlan.trim().length === 0) failures.push('no rollback plan');

  const forbidden = submission.changedFiles.filter((f) => SECRET_PATTERNS.some((p) => p.test(f)));
  if (forbidden.length > 0) failures.push(`forbidden files in change set: ${forbidden.slice(0, 5).join(', ')}`);

  const pendingApprovals = decision.requiredApprovals.filter((a) => submission.approvals[a] !== true);

  let verdict: ReviewVerdict;
  if (failures.length > 0) verdict = 'rejected';
  else if (pendingApprovals.length > 0) verdict = 'awaiting_approval';
  else verdict = 'eligible';

  return { requestId: decision.requestId, verdict, failures, pendingApprovals, autoDeploy: false };
}
