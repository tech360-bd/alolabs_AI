// @vitest-environment node
/**
 * The SKIP_PAID_SERVICES policy is a cost control, so its defaults are the
 * product: a wrong default bills real money on every push. These cases pin the
 * default-deny contract and prove the shell resolver used by
 * .github/workflows/* and the TypeScript helper used by the test suite agree
 * on every input, so neither can drift into "paid by accident".
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  guardFetchAgainstPaidHosts,
  isLocalUrl,
  paidServicesEnabled,
  paidServicesSkipped,
} from '../helpers/paid-services';

const RESOLVER = join(process.cwd(), 'scripts/ci-paid-services.sh');

/** Run the real shell resolver and return its verdict: 'true' = skip. */
function shellVerdict(env: Record<string, string | undefined>): string {
  const clean: NodeJS.ProcessEnv = { ...process.env };
  delete clean.CI_RUN_PAID_OVERRIDE;
  delete clean.SKIP_PAID_SERVICES;
  return execFileSync('bash', [RESOLVER], {
    env: { ...clean, ...env },
    encoding: 'utf8',
    timeout: 15_000,
  }).trim();
}

type Case = { name: string; env: Record<string, string | undefined>; skip: boolean };

const CASES: Case[] = [
  { name: 'unset skips (the fork-PR / no-secret case)', env: {}, skip: true },
  { name: 'empty string skips', env: { SKIP_PAID_SERVICES: '' }, skip: true },
  { name: '"true" skips', env: { SKIP_PAID_SERVICES: 'true' }, skip: true },
  { name: '"TRUE" skips (case-insensitive)', env: { SKIP_PAID_SERVICES: 'TRUE' }, skip: true },
  { name: 'typo skips rather than bills', env: { SKIP_PAID_SERVICES: 'flase' }, skip: true },
  { name: 'unrelated value skips', env: { SKIP_PAID_SERVICES: 'maybe' }, skip: true },
  { name: '"false" runs paid', env: { SKIP_PAID_SERVICES: 'false' }, skip: false },
  { name: '"FALSE" runs paid', env: { SKIP_PAID_SERVICES: 'FALSE' }, skip: false },
  { name: '"0" runs paid', env: { SKIP_PAID_SERVICES: '0' }, skip: false },
  { name: '"no" runs paid', env: { SKIP_PAID_SERVICES: 'no' }, skip: false },
  { name: '"off" runs paid', env: { SKIP_PAID_SERVICES: 'off' }, skip: false },
  { name: 'padded "  false  " runs paid', env: { SKIP_PAID_SERVICES: '  false  ' }, skip: false },
  { name: 'quoted "false" runs paid', env: { SKIP_PAID_SERVICES: '"false"' }, skip: false },
];

describe('SKIP_PAID_SERVICES resolver', () => {
  describe('default-deny contract', () => {
    it('skips when nothing is configured', () => {
      expect(paidServicesSkipped({})).toBe(true);
      expect(paidServicesEnabled({})).toBe(false);
    });

    it('skips on a typo instead of silently billing', () => {
      expect(paidServicesSkipped({ SKIP_PAID_SERVICES: 'fals' })).toBe(true);
      expect(paidServicesSkipped({ SKIP_PAID_SERVICES: 'True ' })).toBe(true);
    });

    it('runs paid only on an explicit opt-in', () => {
      expect(paidServicesEnabled({ SKIP_PAID_SERVICES: 'false' })).toBe(true);
    });
  });

  describe.each(CASES)('$name', ({ env, skip }) => {
    it('TypeScript helper resolves as expected', () => {
      expect(paidServicesSkipped(env as NodeJS.ProcessEnv)).toBe(skip);
      expect(paidServicesEnabled(env as NodeJS.ProcessEnv)).toBe(!skip);
    });

    it('shell resolver agrees with the TypeScript helper', () => {
      expect(shellVerdict(env)).toBe(String(skip));
    });
  });

  describe('workflow_dispatch override', () => {
    it('CI_RUN_PAID_OVERRIDE=true forces paid on, even when skipping is set', () => {
      const env = { SKIP_PAID_SERVICES: 'true', CI_RUN_PAID_OVERRIDE: 'true' };
      expect(paidServicesEnabled(env as NodeJS.ProcessEnv)).toBe(true);
      expect(shellVerdict(env)).toBe('false');
    });

    it('a non-true override is ignored and does not enable paid steps', () => {
      const env = { SKIP_PAID_SERVICES: 'true', CI_RUN_PAID_OVERRIDE: 'false' };
      expect(paidServicesEnabled(env as NodeJS.ProcessEnv)).toBe(false);
      expect(shellVerdict(env)).toBe('true');
    });
  });
});

describe('paid-service network guard', () => {
  it('treats loopback and relative targets as local', () => {
    expect(isLocalUrl('http://127.0.0.1:8080/v1/models')).toBe(true);
    expect(isLocalUrl('http://localhost:3011/api/health')).toBe(true);
    expect(isLocalUrl('http://[::1]:9000/x')).toBe(true);
    expect(isLocalUrl('/api/health')).toBe(true);
  });

  it('treats billed third-party hosts as external', () => {
    expect(isLocalUrl('https://api.openai.com/v1/chat/completions')).toBe(false);
    expect(isLocalUrl('https://api.deepseek.com/v1')).toBe(false);
    expect(isLocalUrl('https://openrouter.ai/api/v1')).toBe(false);
    expect(isLocalUrl('https://api.groq.com/openai/v1')).toBe(false);
  });

  it('does not mistake a lookalike hostname for loopback', () => {
    expect(isLocalUrl('https://127.0.0.1.evil.test/v1')).toBe(false);
    expect(isLocalUrl('https://localhost.attacker.test/v1')).toBe(false);
  });

  it('blocks an outbound billed request and never invokes the inner fetch', async () => {
    const inner = vi.fn(async () => new Response('ok'));
    const guarded = guardFetchAgainstPaidHosts(inner as unknown as typeof fetch);

    await expect(guarded('https://api.openai.com/v1/chat/completions')).rejects.toThrow(
      /blocked outbound request/,
    );
    expect(inner).not.toHaveBeenCalled();
  });

  it('passes a loopback request straight through', async () => {
    const inner = vi.fn(async () => new Response('ok'));
    const guarded = guardFetchAgainstPaidHosts(inner as unknown as typeof fetch);

    await expect(guarded('http://127.0.0.1:9/v1/models')).resolves.toBeDefined();
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('the suite-level __realFetch is guarded, not the raw implementation', async () => {
    // __tests__/setup.ts installs the guard only when paid services are
    // skipped, so assert the behaviour that actually shipped rather than the
    // mere presence of a function.
    const g = globalThis as unknown as { __realFetch?: typeof fetch };
    expect(typeof g.__realFetch).toBe('function');
    if (!paidServicesSkipped()) return;
    await expect(g.__realFetch!('https://api.deepseek.com/v1/chat/completions')).rejects.toThrow(
      /blocked outbound request/,
    );
  });
});
