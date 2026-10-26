/**
 * Paid / external-service policy for the test suite.
 *
 * Mirrors `scripts/ci-paid-services.sh` — that script is the workflow-side
 * source of truth and is unit-tested against these same rules, so the two
 * implementations cannot drift.
 *
 * POLICY — default deny. Tests that reach a billed third-party API run only on
 * an explicit opt-in (`SKIP_PAID_SERVICES=false`). Unset, empty, "true", typos
 * and unrecognised values all SKIP, so a fork pull request — where repository
 * secrets are not delivered to the runner — skips instead of billing.
 *
 * Usage in a spec that would otherwise spend money:
 *
 *   import { describePaid, itPaid } from '../helpers/paid-services';
 *
 *   describePaid('DeepSeek live completions', () => {
 *     itPaid('returns a completion', async () => { ... });
 *   });
 */
import { describe, it } from 'vitest';

const RUN_PAID_VALUES = new Set(['false', '0', 'no', 'off']);

function normalize(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
}

/**
 * True when billed / external-API steps are allowed to run.
 * Only an explicit opt-in enables them.
 */
export function paidServicesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (normalize(env.CI_RUN_PAID_OVERRIDE) === 'true') return true;
  return RUN_PAID_VALUES.has(normalize(env.SKIP_PAID_SERVICES));
}

/** True when paid / external-API steps must be skipped. */
export function paidServicesSkipped(env: NodeJS.ProcessEnv = process.env): boolean {
  return !paidServicesEnabled(env);
}

/**
 * `it` that is skipped unless paid services are explicitly enabled.
 * Reported as skipped (not passed), so a green run never hides an untested path.
 */
export const itPaid = paidServicesEnabled() ? it : it.skip;

/** `describe` companion to {@link itPaid}. */
export const describePaid = paidServicesEnabled() ? describe : describe.skip;

/** `test` alias for suites written with `test(...)` rather than `it(...)`. */
export const testPaid = itPaid;

/**
 * Hosts that are never billed: loopback, link-local and relative URLs. The
 * provider/webhook tests stand up a real `http.createServer` on 127.0.0.1, so
 * the guard below must let those through.
 */
const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  '0.0.0.0',
  '[::]',
]);

export function isLocalUrl(raw: string | URL | Request): boolean {
  let url: URL;
  try {
    if (raw instanceof Request) url = new URL(raw.url);
    else url = new URL(String(raw), 'http://localhost');
  } catch {
    // Unparseable URLs cannot be proven local, so treat them as external.
    return false;
  }
  if (!url.host) return true; // relative URL
  return LOCAL_HOSTNAMES.has(url.hostname.toLowerCase());
}

/**
 * Wrap a fetch implementation so any request to a non-loopback host throws.
 *
 * Installed by `__tests__/setup.ts` when paid services are skipped. This turns
 * "no test happens to call a paid API today" into an enforced invariant: the
 * day someone adds a live call, the suite fails loudly instead of spending
 * money on a runner.
 */
export function guardFetchAgainstPaidHosts(
  realFetch: typeof fetch,
  label = 'paid-service guard',
): typeof fetch {
  const guarded: typeof fetch = (input, init) => {
    const target =
      typeof input === 'string' || input instanceof URL
        ? input
        : (input as Request).url;
    if (!isLocalUrl(target as string | URL | Request)) {
      return Promise.reject(
        new Error(
          `${label}: blocked outbound request to ${String(target)}. ` +
            'Non-loopback hosts are not reachable while SKIP_PAID_SERVICES is ' +
            'active. Set SKIP_PAID_SERVICES=false (or run the workflow_dispatch ' +
            'input run_paid_services=true) to allow billed calls, or stub this ' +
            'endpoint against a local server as ' +
            '__tests__/integration/ai-provider-config.test.ts does.',
        ),
      );
    }
    return realFetch(input as never, init);
  };
  return guarded;
}
