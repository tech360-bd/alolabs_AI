#!/usr/bin/env tsx
/**
 * Run the weekly open-source AI discovery job on demand.
 *
 *   npx tsx scripts/run-model-discovery.ts            # build + persist report
 *   npx tsx scripts/run-model-discovery.ts --dry-run  # report to stdout only
 *   npx tsx scripts/run-model-discovery.ts --json     # machine-readable
 *
 * This is the same code the `weekly-model-discovery` cron job invokes. It is
 * READ-ONLY with respect to configuration: it probes the `/models` endpoint of
 * free providers whose credentials are present, writes a reviewable report to
 * $DISCOVERY_REPORT_DIR (default docs/discovery/) and records observability
 * metrics. It never registers, activates or reroutes a model.
 *
 * With no free-provider credentials configured it reports that limitation
 * explicitly rather than inventing a catalogue.
 */

import { buildWeeklyDiscoveryReport, persistWeeklyDiscoveryReport } from '../src/lib/ai-discovery/weekly-discovery';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const json = process.argv.includes('--json');

  const report = await buildWeeklyDiscoveryReport();

  let persisted: { filePath: string } | null = null;
  if (!dryRun) persisted = await persistWeeklyDiscoveryReport(report);

  if (json) {
    console.log(JSON.stringify({ report, persisted }, null, 2));
    return;
  }

  console.log('\nALO Labs — weekly open-source AI discovery');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Open-weight catalogue size: ${report.catalogueSize}`);
  console.log('');
  if (report.providers.length === 0) {
    console.log('  No free provider credentials are configured, so no live catalogue was queried.');
  }
  for (const provider of report.providers) {
    console.log(`  ${provider.provider}: ${provider.status} — ${provider.models.length} model(s)${provider.error ? ` (${provider.error})` : ''}`);
  }
  console.log('');
  console.log(`  New models observed: ${report.newModels.length}`);
  console.log(`  Configured models no longer advertised: ${report.deprecatedModels.length}`);
  console.log(`  Permissive open-weight entries: ${report.permissiveOpenWeight.length}`);
  console.log('');
  if (report.recommendations.length > 0) {
    console.log('Recommendations (review only — nothing is auto-adopted):');
    for (const recommendation of report.recommendations.slice(0, 20)) {
      console.log(`  [${recommendation.type}] ${recommendation.detail}`);
    }
    console.log('');
  }
  console.log('Limitations:');
  for (const limitation of report.limitations) console.log(`  - ${limitation}`);
  if (persisted) console.log(`\nReport written to ${persisted.filePath}`);
  else console.log('\nDry run: no report written, no metrics recorded.');
}

main().catch((error: unknown) => {
  console.error('discovery failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
