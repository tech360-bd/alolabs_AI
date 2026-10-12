// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  QUALITY_THRESHOLDS,
  decideArchitecture,
  reviewImplementation,
  type BuildRequest,
  type ImplementationSubmission,
} from '@/lib/chief-architect';

function request(overrides: Partial<BuildRequest> = {}): BuildRequest {
  return {
    id: 'REQ-1',
    objective: 'Answer department staff questions from their own knowledge base',
    existingComponents: ['src/lib/rag-engine.ts'],
    needsLanguageUnderstanding: true,
    needsFreshOrPrivateKnowledge: false,
    needsBehaviourOrFormatChange: false,
    labelledExamples: 0,
    datasetLicenseVerified: false,
    partnerDataInvolved: false,
    partnerIsolationVerified: false,
    computeAvailable: false,
    evaluationHarnessAvailable: true,
    explicitTrainingApproved: false,
    externalSideEffects: false,
    ...overrides,
  };
}

function passingSubmission(decisionApproach: ImplementationSubmission['approach'], requestId = 'REQ-1'): ImplementationSubmission {
  return {
    requestId,
    approach: decisionApproach,
    tests: { passed: 40, failed: 0 },
    typecheckPassed: true,
    buildPassed: true,
    tenantIsolationTests: { passed: 6, failed: 0 },
    evals: { taskSuccessRate: 0.9, citationCoverage: 0.95, policyViolations: 0 },
    baselineTaskSuccessRate: 0.85,
    rollbackPlan: 'Revert the merge commit; previous model route remains configured.',
    changedFiles: ['src/lib/example.ts'],
    approvals: {},
  };
}

describe('AI Chief Architect — architecture decision', () => {
  it('chooses no model for deterministic work', () => {
    const d = decideArchitecture(request({ needsLanguageUnderstanding: false }));
    expect(d.approach).toBe('no_model');
    expect(d.autoDeploy).toBe(false);
  });

  it('chooses RAG for private or fresh knowledge, with citation and retrieval gates', () => {
    const d = decideArchitecture(request({ needsFreshOrPrivateKnowledge: true }));
    expect(d.approach).toBe('rag');
    expect(d.gates.map((g) => g.id)).toEqual(expect.arrayContaining(['rag.citations', 'rag.retrieval']));
    expect(d.requiredDatasets.join(' ')).toMatch(/access-controlled/);
  });

  it('defaults to prompting for a general language task', () => {
    expect(decideArchitecture(request()).approach).toBe('prompting');
  });

  it('does not fine-tune with too few labelled examples', () => {
    const d = decideArchitecture(request({ needsBehaviourOrFormatChange: true, labelledExamples: 100, datasetLicenseVerified: true }));
    expect(d.approach).toBe('prompting');
    expect(d.rationale.join(' ')).toMatch(/Only 100 licensed labelled examples/);
  });

  it('does not fine-tune when the dataset licence is unverified', () => {
    const d = decideArchitecture(request({ needsBehaviourOrFormatChange: true, labelledExamples: 5000, datasetLicenseVerified: false }));
    expect(d.approach).toBe('prompting');
  });

  it('fine-tunes only with enough licensed examples, and requires a measured uplift and model-owner approval', () => {
    const d = decideArchitecture(request({ needsBehaviourOrFormatChange: true, labelledExamples: 1200, datasetLicenseVerified: true }));
    expect(d.approach).toBe('fine_tuning');
    expect(d.gates.some((g) => g.id === 'ft.uplift')).toBe(true);
    expect(d.requiredApprovals).toContain('model_owner');
  });

  it('blocks new training unless it is approved AND compute AND an evaluation harness exist', () => {
    const noCompute = decideArchitecture(request({ explicitTrainingApproved: true, computeAvailable: false }));
    expect(noCompute.approach).not.toBe('new_training');
    expect(noCompute.blockers.join(' ')).toMatch(/Training is not started/);

    const ready = decideArchitecture(request({ explicitTrainingApproved: true, computeAvailable: true, evaluationHarnessAvailable: true }));
    expect(ready.approach).toBe('new_training');
    expect(ready.requiredApprovals).toEqual(expect.arrayContaining(['model_owner', 'security_reviewer']));
  });

  it('blocks partner data without verified isolation', () => {
    const d = decideArchitecture(request({ partnerDataInvolved: true, partnerIsolationVerified: false }));
    expect(d.blockers.join(' ')).toMatch(/Partner-company data/);
    const ok = decideArchitecture(request({ partnerDataInvolved: true, partnerIsolationVerified: true }));
    expect(ok.blockers).toHaveLength(0);
    expect(ok.requiredApprovals).toContain('partner_data_owner');
  });

  it('requires human approval for external side effects', () => {
    const d = decideArchitecture(request({ externalSideEffects: true }));
    expect(d.requiredApprovals).toContain('human_approval_for_external_actions');
  });

  it('always carries the mandatory engineering gates', () => {
    const ids = decideArchitecture(request()).gates.filter((g) => g.mandatory).map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(['tests.pass', 'typecheck.pass', 'build.pass', 'tenant.isolation', 'rollback.plan']));
  });

  it('asks the builder to inspect the repository when no reusable component is declared', () => {
    const d = decideArchitecture(request({ existingComponents: [] }));
    expect(d.rationale.join(' ')).toMatch(/inspect the repository/);
  });
});

describe('AI Chief Architect — implementation review', () => {
  it('marks a fully passing, approved submission as eligible — never deployed', () => {
    const d = decideArchitecture(request());
    const r = reviewImplementation(passingSubmission('prompting'), d);
    expect(r.verdict).toBe('eligible');
    expect(r.failures).toEqual([]);
    expect(r.autoDeploy).toBe(false);
  });

  it('rejects when tests fail', () => {
    const d = decideArchitecture(request());
    const r = reviewImplementation({ ...passingSubmission('prompting'), tests: { passed: 39, failed: 1 } }, d);
    expect(r.verdict).toBe('rejected');
    expect(r.failures.join(' ')).toMatch(/tests/);
  });

  it('rejects when no tests were actually run', () => {
    const d = decideArchitecture(request());
    const r = reviewImplementation({ ...passingSubmission('prompting'), tests: { passed: 0, failed: 0 } }, d);
    expect(r.verdict).toBe('rejected');
  });

  it('rejects a failing typecheck or build', () => {
    const d = decideArchitecture(request());
    expect(reviewImplementation({ ...passingSubmission('prompting'), typecheckPassed: false }, d).verdict).toBe('rejected');
    expect(reviewImplementation({ ...passingSubmission('prompting'), buildPassed: false }, d).verdict).toBe('rejected');
  });

  it('rejects any tenant isolation failure', () => {
    const d = decideArchitecture(request());
    const r = reviewImplementation({ ...passingSubmission('prompting'), tenantIsolationTests: { passed: 5, failed: 1 } }, d);
    expect(r.verdict).toBe('rejected');
  });

  it('rejects task success below the threshold', () => {
    const d = decideArchitecture(request());
    const r = reviewImplementation(
      { ...passingSubmission('prompting'), evals: { taskSuccessRate: QUALITY_THRESHOLDS.taskSuccessRate - 0.01, policyViolations: 0 } },
      d,
    );
    expect(r.verdict).toBe('rejected');
  });

  it('rejects any policy violation', () => {
    const d = decideArchitecture(request());
    const r = reviewImplementation({ ...passingSubmission('prompting'), evals: { taskSuccessRate: 0.95, policyViolations: 1 } }, d);
    expect(r.verdict).toBe('rejected');
    expect(r.failures.join(' ')).toMatch(/policy violations/);
  });

  it('rejects an unmeasured quality metric rather than assuming it passed', () => {
    const d = decideArchitecture(request());
    const r = reviewImplementation({ ...passingSubmission('prompting'), evals: undefined }, d);
    expect(r.verdict).toBe('rejected');
    expect(r.failures.join(' ')).toMatch(/not measured/);
  });

  it('rejects RAG work whose citation coverage is below threshold', () => {
    const d = decideArchitecture(request({ needsFreshOrPrivateKnowledge: true }));
    const r = reviewImplementation(
      { ...passingSubmission('rag'), evals: { taskSuccessRate: 0.9, citationCoverage: 0.5, policyViolations: 0 } },
      d,
    );
    expect(r.verdict).toBe('rejected');
    expect(r.failures.join(' ')).toMatch(/citation coverage/);
  });

  it('rejects a fine-tune that does not beat the prompted baseline', () => {
    const d = decideArchitecture(request({ needsBehaviourOrFormatChange: true, labelledExamples: 900, datasetLicenseVerified: true }));
    const r = reviewImplementation(
      { ...passingSubmission('fine_tuning'), evals: { taskSuccessRate: 0.86, policyViolations: 0 }, baselineTaskSuccessRate: 0.85, approvals: { model_owner: true } },
      d,
    );
    expect(r.verdict).toBe('rejected');
    expect(r.failures.join(' ')).toMatch(/does not beat the prompted baseline/);
  });

  it('rejects when there is no rollback plan', () => {
    const d = decideArchitecture(request());
    expect(reviewImplementation({ ...passingSubmission('prompting'), rollbackPlan: '   ' }, d).verdict).toBe('rejected');
  });

  it('rejects when secrets, databases or generated artifacts are in the change set', () => {
    const d = decideArchitecture(request());
    const r = reviewImplementation({ ...passingSubmission('prompting'), changedFiles: ['.env', 'db/custom.db', 'node_modules/x.js'] }, d);
    expect(r.verdict).toBe('rejected');
    expect(r.failures.join(' ')).toMatch(/forbidden files/);
  });

  it('rejects a submission for a different request or a different approach', () => {
    const d = decideArchitecture(request());
    expect(reviewImplementation(passingSubmission('prompting', 'REQ-OTHER'), d).verdict).toBe('rejected');
    expect(reviewImplementation(passingSubmission('rag'), d).verdict).toBe('rejected');
  });

  it('holds a passing change for human approval when a required approval is missing', () => {
    const d = decideArchitecture(request({ externalSideEffects: true }));
    const r = reviewImplementation(passingSubmission('prompting'), d);
    expect(r.verdict).toBe('awaiting_approval');
    expect(r.pendingApprovals).toEqual(['human_approval_for_external_actions']);
    const approved = reviewImplementation({ ...passingSubmission('prompting'), approvals: { human_approval_for_external_actions: true } }, d);
    expect(approved.verdict).toBe('eligible');
  });

  it('refuses to review while blockers remain', () => {
    const d = decideArchitecture(request({ partnerDataInvolved: true, partnerIsolationVerified: false }));
    const r = reviewImplementation(passingSubmission('prompting'), d);
    expect(r.verdict).toBe('rejected');
    expect(r.failures.join(' ')).toMatch(/unresolved blockers/);
  });
});
