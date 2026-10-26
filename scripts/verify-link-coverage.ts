#!/usr/bin/env tsx
/**
 * Re-check every reference link in the coverage registry against the working
 * tree, and optionally write a markdown report.
 *
 *   npx tsx scripts/verify-link-coverage.ts
 *   npx tsx scripts/verify-link-coverage.ts --json
 *   npx tsx scripts/verify-link-coverage.ts --write docs/LINK_COVERAGE_VERIFIED.md
 *
 * Exit code is 1 when an evidence path is missing — the registry and the source
 * tree have drifted apart, which is exactly the failure this check exists for.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LINK_COVERAGE } from '../src/lib/link-coverage/registry';
import { actionItems, verifyCoverage } from '../src/lib/link-coverage/verify';
import { createNodeProbe, isWorkingTreeReadable } from '../src/lib/link-coverage/probe.node';
import type { CoverageReport } from '../src/lib/link-coverage/types';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const writeIndex = args.indexOf('--write');
const writePath = writeIndex >= 0 ? args[writeIndex + 1] : null;

const root = process.cwd();
const readable = isWorkingTreeReadable(root);
const probe = readable ? createNodeProbe(root) : null;

const report: CoverageReport = verifyCoverage({
  entries: LINK_COVERAGE,
  probe,
  root: readable ? root : null,
  inventory: probe
    ? {
        srcFiles: probe.countFiles('src') ?? 0,
        docsFiles: probe.countFiles('docs') ?? 0,
      }
    : null,
});

function toMarkdown(data: CoverageReport, scanRoot: string): string {
  const lines: string[] = [];
  const s = data.summary;
  lines.push('# Link coverage — verified against the working tree');
  lines.push('');
  lines.push(`**Generated:** ${data.generatedAt}`);
  lines.push(`**Mode:** ${data.mode}${scanRoot ? ` (root: \`${scanRoot}\`)` : ''}`);
  if (data.inventory) {
    lines.push(
      `**Inventory:** ${data.inventory.srcFiles.toLocaleString()} files under \`src/\`, ${data.inventory.docsFiles.toLocaleString()} under \`docs/\``,
    );
  }
  lines.push('');
  lines.push(
    `**${s.links} links** · ${s.implemented} implemented · ${s.inKind} in-kind · ${s.reference} reference · ${s.gap} gap · ${s.notApplicable} N/A`,
  );
  lines.push(
    `**Evidence:** ${s.evidenceVerified}/${s.evidencePaths} paths found on disk · ${s.missingPaths} missing · ${s.unverifiablePaths} unverifiable`,
  );
  lines.push('');
  lines.push('## Categories');
  lines.push('');
  lines.push('| Category | Links | Gaps |');
  lines.push('|---|---|---|');
  for (const category of data.categories) {
    lines.push(`| ${category.name} | ${category.links} | ${category.gaps} |`);
  }
  lines.push('');
  lines.push('## Every link');
  lines.push('');
  lines.push('| Link | Verdict | Files | Evidence (first three) | Missing |');
  lines.push('|---|---|---|---|---|');
  for (const entry of data.entries) {
    const paths = entry.evidence
      .slice(0, 3)
      .map((item) => `\`${item.path}\``)
      .join('<br>');
    lines.push(
      `| ${entry.url} | ${entry.verdict} | ${entry.verified}/${entry.evidence.length} | ${paths} | ${entry.missing.length ? entry.missing.map((p) => `\`${p}\``).join(', ') : '—'} |`,
    );
  }
  lines.push('');
  const actionable = actionItems(data.entries);
  lines.push(`## Action items (${actionable.length})`);
  lines.push('');
  if (actionable.length === 0) {
    lines.push('None: no declared gap and no evidence path is missing.');
  } else {
    for (const entry of actionable) {
      const why = entry.missing.length
        ? `missing: ${entry.missing.map((p) => `\`${p}\``).join(', ')}`
        : (entry.gap ?? 'declared gap');
      lines.push(`- **${entry.url}** — ${why}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const s = report.summary;
  console.log(`mode: ${report.mode}`);
  console.log(`links: ${s.links} (${s.repositories} repos, ${s.sites} sites)`);
  console.log(
    `verdicts: implemented=${s.implemented} in_kind=${s.inKind} reference=${s.reference} gap=${s.gap} n/a=${s.notApplicable}`,
  );
  console.log(`evidence: ${s.evidenceVerified}/${s.evidencePaths} found, ${s.missingPaths} missing`);
  if (report.inventory) {
    console.log(`inventory: src=${report.inventory.srcFiles} docs=${report.inventory.docsFiles}`);
  }
  const actionable = actionItems(report.entries);
  if (actionable.length) {
    console.log('\naction items:');
    for (const entry of actionable) {
      const why = entry.missing.length ? `missing ${entry.missing.join(', ')}` : (entry.gap ?? 'gap');
      console.log(`  - ${entry.url}: ${why}`);
    }
  }
}

if (writePath) {
  const target = writePath.startsWith('/') ? writePath : join(root, writePath);
  writeFileSync(target, toMarkdown(report, report.root ?? root), 'utf8');
  console.log(`\nwrote ${target}`);
}

if (report.mode === 'baseline') {
  console.error('warning: working tree not readable; nothing was verified.');
  process.exit(2);
}

if (report.summary.missingPaths > 0) {
  console.error(`\nfailed: ${report.summary.missingPaths} evidence path(s) missing.`);
  process.exit(1);
}

process.exit(0);
