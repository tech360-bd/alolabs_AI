#!/usr/bin/env npx tsx
/**
 * AI Chief Architect gate for a build request.
 *
 * Usage:
 *   npx tsx scripts/chief-architect-review.ts <file.json>
 *
 * <file.json> = { "request": BuildRequest, "submission"?: ImplementationSubmission }
 * Without a submission, prints the architecture decision only.
 * Exit codes: 0 = decision printed / change eligible, 1 = change rejected or awaiting approval.
 */
import { readFileSync } from 'node:fs';
import { decideArchitecture, reviewImplementation, type BuildRequest, type ImplementationSubmission } from '../src/lib/chief-architect';

const file = process.argv[2];
if (!file) {
  console.error('usage: chief-architect-review.ts <file.json>');
  process.exit(2);
}

const input = JSON.parse(readFileSync(file, 'utf8')) as { request: BuildRequest; submission?: ImplementationSubmission };
const decision = decideArchitecture(input.request);
const output: Record<string, unknown> = { decision };
let exitCode = 0;
if (input.submission) {
  const review = reviewImplementation(input.submission, decision);
  output.review = review;
  if (review.verdict !== 'eligible') exitCode = 1;
}
console.log(JSON.stringify(output, null, 2));
process.exit(exitCode);
