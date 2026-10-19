import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Guards the Gate that `.github/workflows/deploy.yml` and
 * `.github/workflows/backup.yml` run before they touch the production bridge.
 *
 * The regression being locked down is run 39247113793 on `main`: the deploy job
 * failed on `PRODUCTION_HOST is missing` while the other three secrets were
 * present, and the log showed only the environment block — no statement of
 * where the value belongs or what shape it must have.
 *
 * These assertions also make sure the validator stays safe on a public repo:
 * it may name a secret, never echo its value.
 */

const SCRIPT = join(process.cwd(), '.github', 'scripts', 'validate-production-secrets.sh');

const VALID_KEY = [
  '-----BEGIN OPENSSH PRIVATE KEY-----',
  'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW',
  '-----END OPENSSH PRIVATE KEY-----',
  '',
].join('\n');

const VALID = {
  PRODUCTION_HOST: '203.0.113.10',
  PRODUCTION_USER: 'deploy-bot',
  PRODUCTION_SSH_KEY: VALID_KEY,
  PRODUCTION_PORT: '22',
} as const;

/** Runs the validator with no inherited PRODUCTION_* values. */
function run(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '/usr/bin:/bin' };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) env[key] = value;
  }
  const summaryDir = mkdtempSync(join(tmpdir(), 'alo-secrets-'));
  const summaryPath = join(summaryDir, 'summary.md');
  env.GITHUB_STEP_SUMMARY = summaryPath;
  env.GITHUB_REPOSITORY = 'tech360-bd/alolabs_AI';
  try {
    const result = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8' });
    return {
      status: result.status,
      stderr: result.stderr,
      output: `${result.stdout}${result.stderr}`,
      // GitHub pre-creates $GITHUB_STEP_SUMMARY; outside Actions it only
      // exists when something was written to it.
      summary: existsSync(summaryPath) ? readFileSync(summaryPath, 'utf8') : '',
    };
  } finally {
    rmSync(summaryDir, { recursive: true, force: true });
  }
}

describe('production secret validation', () => {
  it('passes when every value is present and well formed', () => {
    const result = run(VALID);
    expect(result.status).toBe(0);
    expect(result.output).toContain('present and well formed');
    for (const name of Object.keys(VALID)) {
      expect(result.output).not.toContain(VALID[name as keyof typeof VALID]);
    }
  });

  it('reproduces run 39247113793: only PRODUCTION_HOST is empty', () => {
    const result = run({ ...VALID, PRODUCTION_HOST: undefined });
    expect(result.status).toBe(1);
    expect(result.output).toContain('PRODUCTION_HOST');
    expect(result.output).toContain('is not set');
    // The three secrets that did resolve must not be reported as missing.
    for (const name of ['PRODUCTION_USER', 'PRODUCTION_SSH_KEY', 'PRODUCTION_PORT']) {
      expect(result.output).not.toContain(`${name}\` is not set`);
    }
  });

  it('reports every missing value in one run, by name only', () => {
    const result = run();
    expect(result.status).toBe(1);
    for (const name of Object.keys(VALID)) {
      expect(result.output).toContain(name);
    }
    // Each name is reported once; the annotation repeats the list, so count
    // distinct names rather than occurrences.
    const names = new Set(result.output.match(/`(PRODUCTION_[A-Z_]+)` is not set/g));
    expect(names.size).toBe(4);
  });

  it('rejects a host that carries a scheme or a port', () => {
    expect(run({ ...VALID, PRODUCTION_HOST: 'https://srv.example.com' }).status).toBe(1);
    expect(run({ ...VALID, PRODUCTION_HOST: 'srv.example.com' }).status).toBe(0);
    const withPort = run({ ...VALID, PRODUCTION_HOST: 'srv.example.com:2222' });
    expect(withPort.status).toBe(1);
    expect(withPort.output).toContain('put the port in PRODUCTION_PORT');
  });

  it('rejects a value with a trailing newline instead of failing inside SSH', () => {
    const result = run({ ...VALID, PRODUCTION_HOST: `${VALID.PRODUCTION_HOST}\n` });
    expect(result.status).toBe(1);
    expect(result.output).toContain('trailing newline');
  });

  it('rejects a public key, a truncated key and a CRLF key', () => {
    expect(run({ ...VALID, PRODUCTION_SSH_KEY: 'ssh-ed25519 AAAAC3Nza...' }).status).toBe(1);
    expect(run({ ...VALID, PRODUCTION_SSH_KEY: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc' }).output)
      .toContain('truncated');
    const crlf = run({ ...VALID, PRODUCTION_SSH_KEY: VALID_KEY.replace(/\n/g, '\r\n') });
    expect(crlf.status).toBe(1);
    expect(crlf.output).toContain('CR characters');
  });

  it('rejects an out-of-range port', () => {
    expect(run({ ...VALID, PRODUCTION_PORT: '70000' }).status).toBe(1);
    expect(run({ ...VALID, PRODUCTION_PORT: 'twenty-two' }).status).toBe(1);
    expect(run({ ...VALID, PRODUCTION_PORT: '2222' }).status).toBe(0);
  });

  it('writes actionable remediation to the step summary', () => {
    const result = run({ ...VALID, PRODUCTION_HOST: undefined });
    expect(result.summary).toContain('Production deployment configuration is incomplete');
    expect(result.summary).toContain('gh secret set PRODUCTION_HOST');
    expect(result.summary).toContain('--env production');
    expect(result.summary).toContain('Settings → Environments → production');
    // Never the values themselves. The port is excluded: "22" is ordinary
    // prose in static text and carries no secrecy.
    for (const name of ['PRODUCTION_USER', 'PRODUCTION_SSH_KEY'] as const) {
      expect(result.summary).not.toContain(VALID[name]);
    }
  });
});
