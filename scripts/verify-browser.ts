#!/usr/bin/env npx tsx
/**
 * verify:browser — report whether independent browser verification is available.
 *
 * The Command Center does not pretend it can open a page. This script reports the
 * truth for the deployment and re-asserts the SSRF policy matrix, so a release
 * check can tell "no browser installed" (a capability gap) apart from "the guard
 * let something through" (a security defect).
 *
 * Usage:
 *   npx tsx scripts/verify-browser.ts          (human readable)
 *   npx tsx scripts/verify-browser.ts --json   (machine readable)
 */

import { browserCapability } from '../src/lib/browser/verify';
import { assertNavigableUrl } from '../src/lib/browser/navigation-guard';

const MUST_BLOCK = [
  'http://127.0.0.1/',
  'http://169.254.169.254/latest/meta-data/',
  'http://10.0.0.1/',
  'http://192.168.0.1/',
  'http://2130706433/',
  'http://0177.0.0.1/',
  'http://[::1]/',
  'http://metadata.google.internal/',
  'file:///etc/passwd',
  'javascript:alert(1)',
];

const MUST_ALLOW = ['https://example.com/', 'https://github.com/tech360-bd/alolabs_AI'];

async function main() {
  const capability = await browserCapability();
  const leaks = MUST_BLOCK.filter((url) => assertNavigableUrl(url).ok);
  const falsePositives = MUST_ALLOW.filter((url) => !assertNavigableUrl(url).ok);

  const report = {
    capability,
    policy: { blocked: MUST_BLOCK.length, leaks: leaks.length, allowed: MUST_ALLOW.length, falsePositives: falsePositives.length },
    leaks,
    falsePositives,
    verdict: capability.available
      ? leaks.length === 0 && falsePositives.length === 0
        ? 'runtime-verifiable'
        : 'guard-defect'
      : 'capability-unavailable',
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`browser capability: ${capability.available ? 'available' : 'UNAVAILABLE'} (${capability.reason})`);
    console.log(`ssrf policy: ${MUST_BLOCK.length} destinations blocked, ${leaks.length} leaked; ${MUST_ALLOW.length} allowed, ${falsePositives.length} false positives`);
    console.log(`verdict: ${report.verdict}`);
    if (leaks.length) console.log(`  LEAK: ${leaks.join(', ')}`);
    if (falsePositives.length) console.log(`  FALSE POSITIVE: ${falsePositives.join(', ')}`);
  }

  if (leaks.length > 0 || falsePositives.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('verify:browser failed:', error);
  process.exitCode = 1;
});
