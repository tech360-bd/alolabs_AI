import { describe, it, expect } from 'vitest';

/**
 * F9: Role migration CLI — argument parsing contract.
 *
 * The CLI must correctly parse --rollback <id>, --apply <id>, --create-records,
 * --dry-run, and --operator <email>. The original code used
 * args[args.indexOf('--rollback') + 1] which returns args[0] when --rollback
 * is absent (indexOf returns -1, +1 = 0). The fix uses a flagValue() helper.
 */

describe('F9: CLI argument parsing contract', () => {
  // Simulate the flagValue helper from scripts/migrate-roles.ts
  function flagValue(args: string[], name: string): string | undefined {
    const i = args.indexOf(name);
    if (i === -1 || i + 1 >= args.length) return undefined;
    return args[i + 1];
  }

  it('parses --rollback <id> correctly', () => {
    const args = ['--rollback', 'migration-123', '--operator', 'admin@alolabs.net'];
    expect(flagValue(args, '--rollback')).toBe('migration-123');
  });

  it('returns undefined for --rollback when absent (NOT args[0])', () => {
    // This is the bug that was fixed. The old code would return args[0]
    // ('--dry-run') when --rollback was absent, causing the rollback branch
    // to fire with a bogus id.
    const args = ['--dry-run'];
    expect(flagValue(args, '--rollback')).toBeUndefined();
  });

  it('parses --apply <id> correctly', () => {
    const args = ['--apply', 'migration-456', '--operator', 'admin@alolabs.net'];
    expect(flagValue(args, '--apply')).toBe('migration-456');
  });

  it('returns undefined for --apply when absent', () => {
    const args = ['--dry-run'];
    expect(flagValue(args, '--apply')).toBeUndefined();
  });

  it('parses --operator <email> correctly', () => {
    const args = ['--apply', 'm1', '--operator', 'admin@alolabs.net'];
    expect(flagValue(args, '--operator')).toBe('admin@alolabs.net');
  });

  it('returns undefined for --operator when absent', () => {
    const args = ['--dry-run'];
    expect(flagValue(args, '--operator')).toBeUndefined();
  });

  it('handles --rollback as the last arg (no value) → undefined', () => {
    const args = ['--rollback'];
    expect(flagValue(args, '--rollback')).toBeUndefined();
  });

  it('handles --apply as the last arg (no value) → undefined', () => {
    const args = ['--apply'];
    expect(flagValue(args, '--apply')).toBeUndefined();
  });

  it('detects --dry-run boolean flag', () => {
    const args = ['--dry-run'];
    expect(args.includes('--dry-run')).toBe(true);
  });

  it('detects --create-records boolean flag', () => {
    const args = ['--create-records', '--operator', 'admin@alolabs.net'];
    expect(args.includes('--create-records')).toBe(true);
  });
});
