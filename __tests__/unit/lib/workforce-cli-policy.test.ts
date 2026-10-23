import { describe, expect, it } from 'vitest';
import { workforceProvisionMode } from '@/lib/workforce/cli-policy';

describe('workforce provision CLI mode', () => {
  it('defaults to a non-mutating dry-run', () => {
    expect(workforceProvisionMode([])).toBe('dry-run');
    expect(workforceProvisionMode(['--dry-run'])).toBe('dry-run');
  });

  it('requires an explicit apply flag for writes', () => {
    expect(workforceProvisionMode(['--apply'])).toBe('apply');
  });

  it('supports read-only verification', () => {
    expect(workforceProvisionMode(['--verify'])).toBe('verify');
  });

  it('rejects ambiguous apply modes', () => {
    expect(() => workforceProvisionMode(['--apply', '--dry-run'])).toThrow(/Choose --apply or --dry-run/);
    expect(() => workforceProvisionMode(['--apply', '--verify'])).toThrow(/Choose --apply or --verify/);
  });
});
