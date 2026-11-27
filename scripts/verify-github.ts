#!/usr/bin/env npx tsx
/**
 * verify:github — repository intelligence against the real GitHub API.
 *
 * The unit tests inject a `fetch`, which proves the rules but not that the request
 * shape is right. This script calls the live API for three public repositories and
 * prints the verdicts, so "the assessment works" is a fact about the network, not
 * about a mock.
 *
 * Usage:
 *   npx tsx scripts/verify-github.ts                  # default sample set
 *   npx tsx scripts/verify-github.ts owner/repo ...   # your own targets
 *   npx tsx scripts/verify-github.ts --json
 *
 * A token is used when GITHUB_TOKEN is set (higher rate limit + advisories).
 *
 * If every repository reports `metadata.unreadable`, the cause is almost always
 * TLS rather than GitHub: this sandbox terminates TLS with a private CA that Node's
 * bundled roots do not know (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Point Node at the
 * system bundle:
 *
 *   NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npx tsx scripts/verify-github.ts
 *
 * That is a property of the environment, not of the product: a deployed host or CI
 * runner has the public roots and needs no override.
 */

import { assessRepository } from '../src/lib/github/assess';

const DEFAULTS = ['vercel/next.js', 'ripienaar/free-for-dev', 'tech360-bd/alolabs_AI'];

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const json = process.argv.includes('--json');
  const targets = args.length > 0 ? args : DEFAULTS;

  const results = [];
  for (const target of targets) {
    const assessment = await assessRepository(target, {
      ...(process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {}),
    });
    results.push({
      repository: assessment.ref.fullName,
      verdict: assessment.verdict,
      reason: assessment.verdictReason,
      licence: assessment.licence?.spdx ?? null,
      stars: assessment.repository?.stars ?? null,
      lastPush: assessment.repository?.pushedAt ?? null,
      findings: assessment.findings.map((finding) => `${finding.severity}:${finding.id}`),
      unavailable: assessment.unavailable,
      advisories: assessment.advisories,
    });
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const row of results) {
      console.log(`\n${row.repository} — ${row.verdict}`);
      console.log(`  ${row.reason}`);
      console.log(`  licence=${row.licence ?? 'none'} stars=${row.stars ?? '?'} lastPush=${row.lastPush ?? '?'}`);
      if (row.findings.length) console.log(`  findings: ${row.findings.join(', ')}`);
      if (row.unavailable.length) console.log(`  unavailable: ${row.unavailable.map((entry) => entry.section).join(', ')}`);
    }
    console.log(`\nverify:github — ${results.length} repositories assessed live`);
  }

  // A repository that could not be read at all means the request shape is wrong.
  const unreadable = results.filter((row) => row.unavailable.some((entry) => entry.section === 'metadata'));
  if (unreadable.length > 0) {
    console.error(`\nFAILED: ${unreadable.length} repositories could not be read from the API.`);
    const reasons = new Set(unreadable.map((row) => row.unavailable.find((entry) => entry.section === 'metadata')?.reason));
    if ([...reasons].some((reason) => /certificate|SSL|TLS|UNABLE_TO_VERIFY/i.test(reason ?? ''))) {
      console.error('Hint: TLS interception. Re-run with NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt');
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('verify:github failed:', error);
  process.exitCode = 1;
});
