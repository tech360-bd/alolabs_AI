export type WorkforceProvisionMode = 'dry-run' | 'apply' | 'verify';

/**
 * Provisioning CLI is non-mutating by default. Writes require an explicit
 * --apply flag; verify and apply are mutually exclusive.
 */
export function workforceProvisionMode(args: readonly string[]): WorkforceProvisionMode {
  const flags = new Set(args);
  const apply = flags.has('--apply');
  const verify = flags.has('--verify');
  if (apply && verify) throw new Error('Choose --apply or --verify, not both');
  if (apply && flags.has('--dry-run')) throw new Error('Choose --apply or --dry-run, not both');
  if (verify) return 'verify';
  if (apply) return 'apply';
  return 'dry-run';
}
