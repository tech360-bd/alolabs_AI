// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createRealDb, type RealDb } from '../helpers/real-db';

let fixture: RealDb;

beforeAll(async () => {
  fixture = await createRealDb('phase8-ratelimit-tools');
});

afterAll(async () => {
  await fixture?.cleanup();
});

describe('Phase 8 — rate limiters, tool approval loop, and proxy IP hardening', () => {
  it('handles limit <= 0 without NaN resetAt across both security and v1 rate limiters', async () => {
    const { checkLimit, peekLimit, resetLimit } = await import('@/lib/security/rate-limiter');
    const { checkRateLimit: checkV1Limit, _resetRateLimiterForTests } = await import('@/lib/api/rate-limit');
    _resetRateLimiterForTests();

    const zeroSec = await checkLimit('phase8:zero', 0, 60_000);
    expect(zeroSec.allowed).toBe(false);
    expect(zeroSec.remaining).toBe(0);
    expect(Number.isFinite(zeroSec.resetAt)).toBe(true);

    const zeroPeek = await peekLimit('phase8:zero', 0, 60_000);
    expect(zeroPeek.count).toBe(0);
    expect(Number.isFinite(zeroPeek.resetAt)).toBe(true);
    await resetLimit('phase8:zero');

    const zeroV1 = checkV1Limit('key-zero', 0);
    expect(zeroV1.allowed).toBe(false);
    expect(zeroV1.remaining).toBe(0);
  });

  it('peeks usage without consuming slots and resets the actual sliding window bucket', async () => {
    const { checkRateLimit, getRateLimitUsage, resetRateLimit } = await import('@/lib/rate-limiter');
    const key = `phase8:usage:${Date.now()}`;

    await checkRateLimit(key, 3, 60_000);
    await checkRateLimit(key, 3, 60_000);

    const peek1 = await getRateLimitUsage(key, 3, 60_000);
    const peek2 = await getRateLimitUsage(key, 3, 60_000);
    expect(peek1.count).toBe(2);
    expect(peek1.remaining).toBe(1);
    expect(peek2.count).toBe(2);
    expect(peek2.remaining).toBe(1);

    const third = await checkRateLimit(key, 3, 60_000);
    expect(third.allowed).toBe(true);
    const blocked = await checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);

    await resetRateLimit(key);
    const afterReset = await checkRateLimit(key, 3, 60_000);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(2);
  });

  it('verifies and consumes bound approvals even when policy requires approval on low/medium tools', async () => {
    const { createBoundApproval } = await import('@/lib/governance/approvals');
    const governanceModule = await import('@/lib/governance');
    const registryModule = await import('@/lib/tools/registry');
    const { executeTool } = await import('@/lib/tools/execute');

    const company = await fixture.db.company.create({
      data: { name: 'Phase 8 Corp', slug: `phase8-${Date.now()}`, status: 'active' },
    });
    const reviewer = await fixture.db.user.create({
      data: {
        email: `phase8-reviewer-${Date.now()}@example.test`,
        name: 'Reviewer',
        role: 'super_admin',
        passwordHash: 'hash',
      },
    });

    const getToolSpy = vi.spyOn(registryModule, 'getTool').mockReturnValue({
      name: 'medium_draft',
      description: 'Medium risk tool without requiresApproval flag',
      parameters: { type: 'object', properties: { draft: { type: 'string' } } },
      category: 'utility',
      risk: 'medium',
      requiresApproval: false,
      async handler(args) {
        return { drafted: String(args.draft ?? '') };
      },
    });
    const enforceSpy = vi.spyOn(governanceModule, 'enforceGovernance').mockImplementation(async (req) => {
      const allowed = Boolean(req.evidence?.approvalVerified);
      return {
        allowed,
        decisionId: 'dec-phase8',
        actionClass: req.actionClass,
        riskLevel: 'moderate',
        escalated: false,
        outcome: allowed ? 'allow' : 'require_approval',
        explanation: 'Policy requires human sign-off',
        matchedPolicyIds: [],
        violations: [],
        missingEvidence: allowed ? [] : ['approvalVerified'],
        requiredApprovers: ['super_admin'],
        degraded: false,
        catalogVersion: '1',
        state: {
          globalStop: false,
          readOnly: false,
          paidDisabled: false,
          externalCommsStopped: false,
          queuesStopped: false,
          source: 'database',
        },
        evaluatedAt: Date.now(),
      };
    });

    try {
      const args = { draft: 'hello world' };
      const created = await createBoundApproval({
        companyId: company.id,
        requestedBy: reviewer.id,
        actionClass: 'read.public',
        action: 'Execute tool medium_draft',
        resource: 'tool:medium_draft',
        payload: { tool: 'medium_draft', args },
        requiredApprovers: ['super_admin'],
      });
      await fixture.db.approval.update({
        where: { id: created.id },
        data: { status: 'approved', reviewedBy: reviewer.id, reviewedAt: new Date() },
      });

      // Tampered args must be rejected
      const tampered = await executeTool({
        toolName: 'medium_draft',
        args: { draft: 'tampered' },
        context: { companyId: company.id, userId: reviewer.id },
        permissions: { allowedTools: ['medium_draft'], forbiddenTools: [] },
        approvalId: created.id,
      });
      expect(tampered.ok).toBe(false);
      expect(tampered.blocked).toBe(true);

      // Exact bound args succeed and consume the single-use approval
      const approved = await executeTool({
        toolName: 'medium_draft',
        args,
        context: { companyId: company.id, userId: reviewer.id },
        permissions: { allowedTools: ['medium_draft'], forbiddenTools: [] },
        approvalId: created.id,
      });
      expect(approved.ok).toBe(true);
      expect(approved.output).toContain('hello world');

      // Replay of the same approvalId must fail
      const replay = await executeTool({
        toolName: 'medium_draft',
        args,
        context: { companyId: company.id, userId: reviewer.id },
        permissions: { allowedTools: ['medium_draft'], forbiddenTools: [] },
        approvalId: created.id,
      });
      expect(replay.ok).toBe(false);
      expect(replay.blocked).toBe(true);
    } finally {
      enforceSpy.mockRestore();
      getToolSpy.mockRestore();
    }
  });

  it('ignores spoofed X-Forwarded-For on /api/auth/login when TRUST_PROXY is unset', async () => {
    vi.unstubAllEnvs();
    const { POST } = await import('@/app/api/auth/login/route');
    const results: number[] = [];
    for (let i = 0; i < 21; i++) {
      const req = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `198.51.100.${i + 1}`,
        },
        body: JSON.stringify({ email: `spoof-${i}@example.test`, password: 'wrong-password-123' }),
      });
      const res = await POST(req);
      results.push(res.status);
    }
    expect(results[20]).toBe(429);
  });
});
