// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertApplyClaimable, assertApplyOutcome, EnvironmentError } from '@/lib/environments/apply-state';

/**
 * The apply state machine.
 *
 * These three rules are the ones that decide whether the dashboard can show a
 * configuration as live, so they are tested as pure predicates rather than only
 * through the database path:
 *
 *  1. an apply can be claimed exactly once;
 *  2. a finished apply is finished;
 *  3. `succeeded` without a health check is refused.
 */
describe('assertApplyClaimable', () => {
  it('allows a queued apply to be claimed', () => {
    expect(() => assertApplyClaimable('queued')).not.toThrow();
  });

  it('refuses a second claim while a host is running it', () => {
    expect(() => assertApplyClaimable('running')).toThrow(/already claimed/i);
    try {
      assertApplyClaimable('running');
    } catch (error) {
      expect((error as EnvironmentError).status).toBe(409);
    }
  });

  it('refuses every terminal state', () => {
    for (const status of ['succeeded', 'failed', 'rolled_back']) {
      expect(() => assertApplyClaimable(status)).toThrow(new RegExp(`already ${status}`));
    }
  });
});

describe('assertApplyOutcome', () => {
  it('accepts a verified success', () => {
    expect(() => assertApplyOutcome('succeeded', 'GET /api/health → 200')).not.toThrow();
  });

  it('refuses success without proof', () => {
    expect(() => assertApplyOutcome('succeeded')).toThrow(/health check/i);
    try {
      assertApplyOutcome('succeeded', '');
    } catch (error) {
      expect((error as EnvironmentError).status).toBe(400);
      expect((error as EnvironmentError).code).toBe('invalid');
    }
  });

  it('accepts a failure or rollback without a health check', () => {
    expect(() => assertApplyOutcome('failed')).not.toThrow();
    expect(() => assertApplyOutcome('rolled_back')).not.toThrow();
  });

  it('refuses an outcome it does not know', () => {
    expect(() => assertApplyOutcome('probably')).toThrow(/Unknown apply outcome/);
  });
});
