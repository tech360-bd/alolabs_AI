/**
 * Governance policy engine — decision tests.
 *
 * These are the policy test cases named in the catalogue (`tests: [...]`).
 * Every policy in `src/lib/governance/catalog.ts` must have at least one case
 * here; the integrity test at the bottom enforces that contract.
 */

import { describe, expect, it } from 'vitest';
import { POLICY_CATALOG, POLICY_CATALOG_VERSION } from '@/lib/governance/catalog';
import {
  actorRoleAtLeast,
  effectiveRisk,
  evaluateGovernance,
  toApprovalRisk,
  validatePolicyCatalog,
} from '@/lib/governance/engine';
import type { GovernanceRequest, GovernanceState, RiskLevel } from '@/lib/governance/types';

function state(overrides: Partial<GovernanceState> = {}): GovernanceState {
  return {
    globalStop: false,
    readOnly: false,
    paidDisabled: false,
    externalCommsStopped: false,
    queuesStopped: false,
    apiKeysBlocked: false,
    gpuJobsStopped: false,
    sessionsRevokedAt: null,
    source: 'database',
    capturedAt: 0,
    ...overrides,
  };
}

function request(overrides: Partial<GovernanceRequest> = {}): GovernanceRequest {
  return {
    action: 'test action',
    actionClass: 'knowledge.read',
    resource: 'knowledge:doc-1',
    companyId: 'company-a',
    callerCompanyId: 'company-a',
    actor: { userId: 'user-1', role: 'standard_user', companyId: 'company-a' },
    surface: 'customer_workspace',
    ...overrides,
  };
}

const forensic = state({ globalStop: true });

describe('catalogue integrity', () => {
  it('has no structural issues', () => {
    expect(validatePolicyCatalog()).toEqual([]);
  });

  it('exposes a version and frozen catalogue', () => {
    expect(POLICY_CATALOG_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d+$/);
    expect(Object.isFrozen(POLICY_CATALOG)).toBe(true);
    expect(POLICY_CATALOG.length).toBeGreaterThanOrEqual(18);
  });

  it('has a test case for every policy', () => {
    for (const policy of POLICY_CATALOG) {
      expect(policy.tests.length, `${policy.id} must cite a test case`).toBeGreaterThan(0);
    }
  });

  it('rejects a policy that grants allowance at platform level', () => {
    const issues = validatePolicyCatalog([
      ...POLICY_CATALOG,
      {
        ...POLICY_CATALOG[0],
        id: 'BAD-001',
        enforcement: 'allow',
        level: 'platform_security',
      },
    ]);
    expect(issues.some((issue) => issue.includes('BAD-001'))).toBe(true);
  });
});

describe('risk classification', () => {
  it('never lowers the taxonomy baseline below the declared risk', () => {
    expect(effectiveRisk(request({ actionClass: 'status.read' })).risk).toBe('low');
    expect(effectiveRisk(request({ actionClass: 'data.delete' })).risk).toBe('critical');
    expect(effectiveRisk(request({ actionClass: 'data.delete', declaredRisk: 'low' })).risk).toBe('critical');
    expect(effectiveRisk(request({ actionClass: 'status.read', declaredRisk: 'high' })).risk).toBe('high');
  });

  it('treats an explicitly approval-gated request as at least high risk', () => {
    expect(effectiveRisk(request({ actionClass: 'draft.content', requiresApproval: true })).risk).toBe('high');
  });

  it('maps the governance vocabulary onto the approval-engine vocabulary', () => {
    expect(toApprovalRisk('normal')).toBe('medium');
    expect(toApprovalRisk('moderate')).toBe('medium');
    expect(toApprovalRisk('critical')).toBe('critical');
  });
});

describe('platform security policies', () => {
  it('tenant-boundary-deny: denies cross-tenant access even for a super admin', () => {
    const decision = evaluateGovernance(
      request({
        companyId: 'company-b',
        callerCompanyId: 'company-a',
        actor: { userId: 'admin-1', role: 'super_admin', companyId: 'company-a' },
      }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.violations.map((violation) => violation.policyId)).toContain('SEC-TENANT-001');
  });

  it('secret-access-deny: refusal to read credentials', () => {
    const decision = evaluateGovernance(request({ actionClass: 'secret.access', resource: 'env:OPENAI_API_KEY' }), {
      state: state(),
      now: 1,
    });
    expect(decision.outcome).toBe('deny');
    expect(decision.violations[0].policyId).toBe('SEC-SECRET-001');
  });

  it('untrusted-code-deny: arbitrary execution is blocked', () => {
    const decision = evaluateGovernance(request({ actionClass: 'code.execute.untrusted', resource: 'shell:prod' }), {
      state: state(),
      now: 1,
    });
    expect(decision.outcome).toBe('deny');
    expect(decision.explanation).toMatch(/sandbox/i);
  });

  it('privilege-change-requires-super-admin', () => {
    const decision = evaluateGovernance(request({ actionClass: 'privilege.change', resource: 'user:user-2' }), {
      state: state(),
      now: 1,
    });
    expect(decision.outcome).toBe('require_approval');
    expect(decision.requiredApprovers).toEqual(['super_admin']);
  });

  it('policy-change-requires-super-admin', () => {
    const decision = evaluateGovernance(request({ actionClass: 'policy.change', resource: 'policy:gov' }), {
      state: state(),
      now: 1,
    });
    expect(decision.outcome).toBe('require_approval');
    expect(decision.requiredApprovers).toContain('super_admin');
  });

  it('webchat-internal-boundary-deny: public surface cannot touch internal state', () => {
    const decision = evaluateGovernance(
      request({
        actionClass: 'write.project',
        surface: 'public_webchat',
        actor: { userId: null, role: 'public_visitor' },
      }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.violations.map((v) => v.policyId)).toContain('SEC-WEBCHAT-001');
  });

  it('lets the public surface read public knowledge', () => {
    const decision = evaluateGovernance(
      request({
        actionClass: 'knowledge.read',
        surface: 'public_webchat',
        actor: { userId: null, role: 'public_visitor' },
      }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('allow');
  });

  it('allows public-safe reads on the public surface', () => {
    const decision = evaluateGovernance(
      request({ actionClass: 'read.public', surface: 'public_webchat', actor: { userId: null, role: 'public_visitor' } }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('allow');
  });
});

describe('approval satisfaction', () => {
  it('approval-token-satisfies: a verified approval resolves the requirement', () => {
    const decision = evaluateGovernance(
      request({ actionClass: 'content.publish', evidence: { approvalVerified: true } }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('allow');
    expect(decision.matchedPolicyIds).toContain('GLOB-COMMS-001');
  });

  it('publish-requires-approval: an unapproved publish pauses', () => {
    const decision = evaluateGovernance(request({ actionClass: 'content.publish' }), { state: state(), now: 1 });
    expect(decision.outcome).toBe('require_approval');
    expect(decision.requiredApprovers).toEqual(['organization_owner', 'project_manager']);
  });

  it('an approval id alone (not verified) does not satisfy anything', () => {
    const decision = evaluateGovernance(
      request({ actionClass: 'content.publish', evidence: { approvalId: 'apr_123' } }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('require_approval');
  });
});

describe('destructive and deployment policies', () => {
  it('destructive-missing-backup-deny: no backup means no execution', () => {
    const decision = evaluateGovernance(request({ actionClass: 'data.delete', resource: 'db:prod' }), {
      state: state(),
      now: 1,
    });
    expect(decision.outcome).toBe('deny');
    expect(decision.missingEvidence).toEqual(expect.arrayContaining(['backupTaken', 'rollbackPlan']));
  });

  it('destructive-requires-backup: with evidence it still needs approval', () => {
    const decision = evaluateGovernance(
      request({ actionClass: 'data.delete', evidence: { backupTaken: true, rollbackPlan: true } }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('require_approval');
  });

  it('deploy-requires-evidence: a URL alone cannot deploy', () => {
    const decision = evaluateGovernance(request({ actionClass: 'deploy.production', resource: 'site:customer.com' }), {
      state: state(),
      now: 1,
    });
    expect(decision.outcome).toBe('deny');
    expect(decision.missingEvidence).toContain('testsPassed');
  });

  it('deploy-with-evidence-needs-approval', () => {
    const decision = evaluateGovernance(
      request({
        actionClass: 'deploy.production',
        evidence: { testsPassed: true, buildPassed: true, rollbackPlan: true },
      }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('require_approval');
  });

  it('dns-requires-rollback', () => {
    expect(evaluateGovernance(request({ actionClass: 'dns.change' }), { state: state(), now: 1 }).outcome).toBe('deny');
    expect(
      evaluateGovernance(request({ actionClass: 'dns.change', evidence: { rollbackPlan: true } }), {
        state: state(),
        now: 1,
      }).outcome,
    ).toBe('require_approval');
  });

  it('financial-requires-authorization', () => {
    expect(evaluateGovernance(request({ actionClass: 'financial.transact' }), { state: state(), now: 1 }).outcome).toBe(
      'deny',
    );
    expect(
      evaluateGovernance(request({ actionClass: 'financial.transact', evidence: { costAuthorized: true } }), {
        state: state(),
        now: 1,
      }).outcome,
    ).toBe('require_approval');
  });
});

describe('paid provider policy', () => {
  it('paid-provider-without-authorization-deny', () => {
    const decision = evaluateGovernance(
      request({ actionClass: 'draft.content', providerKind: 'paid', evidence: {} }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.violations.map((v) => v.policyId)).toContain('GLOB-PAID-001');
  });

  it('paid-provider-with-authorization-allow', () => {
    const decision = evaluateGovernance(
      request({ actionClass: 'draft.content', providerKind: 'paid', evidence: { costAuthorized: true } }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('allow');
  });

  it('free and local providers are untouched by the paid policy', () => {
    expect(
      evaluateGovernance(request({ actionClass: 'draft.content', providerKind: 'verified_free' }), {
        state: state(),
        now: 1,
      }).outcome,
    ).toBe('allow');
  });
});

describe('emergency controls', () => {
  it('global stop denies state-changing work but keeps safe reads alive', () => {
    expect(evaluateGovernance(request({ actionClass: 'write.project' }), { state: forensic, now: 1 }).outcome).toBe('deny');
    const read = evaluateGovernance(request({ actionClass: 'status.read' }), { state: forensic, now: 1 });
    expect(read.outcome).toBe('allow');
  });

  it('read-only mode blocks mutation, not reads', () => {
    const readOnly = state({ readOnly: true });
    expect(evaluateGovernance(request({ actionClass: 'data.export' }), { state: readOnly, now: 1 }).outcome).toBe('deny');
    expect(evaluateGovernance(request({ actionClass: 'knowledge.read' }), { state: readOnly, now: 1 }).outcome).toBe(
      'allow',
    );
  });

  it('paid services can be disabled platform-wide', () => {
    const paidOff = state({ paidDisabled: true });
    const decision = evaluateGovernance(
      request({ actionClass: 'draft.content', providerKind: 'paid', evidence: { costAuthorized: true } }),
      { state: paidOff, now: 1 },
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.violations.map((v) => v.policyId)).toContain('EMERG-PAID-DISABLED');
  });

  it('external communication stop blocks publishing but not public research', () => {
    const commsOff = state({ externalCommsStopped: true });
    expect(evaluateGovernance(request({ actionClass: 'content.publish' }), { state: commsOff, now: 1 }).outcome).toBe(
      'deny',
    );
    expect(evaluateGovernance(request({ actionClass: 'read.public' }), { state: commsOff, now: 1 }).outcome).toBe(
      'allow',
    );
  });

  it('queue stop blocks dispatches', () => {
    const queuesOff = state({ queuesStopped: true });
    const decision = evaluateGovernance(request({ actionClass: 'queue.dispatch' }), { state: queuesOff, now: 1 });
    expect(decision.outcome).toBe('deny');
    expect(decision.violations.map((v) => v.policyId)).toContain('EMERG-QUEUE-STOP');
  });
});

describe('degraded governance state', () => {
  const degraded = state({ source: 'unavailable' });

  it('fails closed for high and critical actions', () => {
    const decision = evaluateGovernance(request({ actionClass: 'data.delete' }), { state: degraded, now: 1 });
    expect(decision.outcome).toBe('deny');
    expect(decision.degraded).toBe(true);
    expect(decision.violations.map((v) => v.policyId)).toContain('EMERG-STATE-UNVERIFIED');
  });

  it('still allows low-risk reads, but flags the decision as degraded', () => {
    const decision = evaluateGovernance(request({ actionClass: 'knowledge.read' }), { state: degraded, now: 1 });
    expect(decision.outcome).toBe('allow');
    expect(decision.degraded).toBe(true);
  });
});

describe('tenant and project scope invariants', () => {
  it('project-mismatch-deny', () => {
    const decision = evaluateGovernance(
      request({
        actionClass: 'write.project',
        projectId: 'project-b',
        actor: { userId: 'u', role: 'developer', companyId: 'company-a', projectId: 'project-a' },
      }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.violations.map((v) => v.policyId)).toContain('PROJ-SCOPE-001');
  });

  it('project-write-requires-member: public visitors cannot write', () => {
    const decision = evaluateGovernance(
      request({ actionClass: 'write.project', actor: { userId: null, role: 'public_visitor' } }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('deny');
    expect(decision.violations.map((v) => v.policyId)).toContain('ORG-WRITE-001');
  });

  it('allows a project member to write inside their own project', () => {
    const decision = evaluateGovernance(
      request({
        actionClass: 'write.project',
        projectId: 'project-a',
        actor: { userId: 'u', role: 'developer', companyId: 'company-a', projectId: 'project-a' },
      }),
      { state: state(), now: 1 },
    );
    expect(decision.outcome).toBe('allow');
  });
});

describe('decision record', () => {
  it('is deterministic when a decision id and clock are supplied', () => {
    const a = evaluateGovernance(request({ actionClass: 'content.publish' }), {
      state: state(),
      now: 42,
      decisionId: 'fixed',
    });
    const b = evaluateGovernance(request({ actionClass: 'content.publish' }), {
      state: state(),
      now: 42,
      decisionId: 'fixed',
    });
    expect(a).toEqual(b);
    expect(a.evaluatedAt).toBe(42);
    expect(a.catalogVersion).toBe(POLICY_CATALOG_VERSION);
  });

  it('reports an explanation for every non-allow outcome', () => {
    const decision = evaluateGovernance(request({ actionClass: 'deploy.production' }), { state: state(), now: 1 });
    expect(decision.explanation.length).toBeGreaterThan(20);
    expect(decision.allowed).toBe(false);
  });

  it('orders required approvers from most to least senior', () => {
    const decision = evaluateGovernance(request({ actionClass: 'data.delete' }), {
      state: state(),
      now: 1,
    });
    const ranks = decision.requiredApprovers.map((role) =>
      role === 'super_admin' ? 4 : role === 'admin' ? 3 : role === 'organization_owner' ? 2 : 1,
    );
    expect([...ranks].sort((x, y) => y - x)).toEqual(ranks);
  });
});

describe('role helpers', () => {
  it('compares actor roles against an approver requirement', () => {
    expect(actorRoleAtLeast('super_admin', 'organization_owner')).toBe(true);
    expect(actorRoleAtLeast('standard_user', 'project_manager')).toBe(false);
    expect(actorRoleAtLeast('public_visitor', 'project_manager')).toBe(false);
  });

  it('exposes risk ordering consistently for every level', () => {
    const levels: RiskLevel[] = ['low', 'normal', 'moderate', 'high', 'critical'];
    const decisions = levels.map((declaredRisk) =>
      evaluateGovernance(request({ actionClass: 'status.read', declaredRisk }), { state: state(), now: 1 }),
    );
    expect(decisions.map((decision) => decision.riskLevel)).toEqual(levels);
  });
});
