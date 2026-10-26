import { LINK_COVERAGE } from './registry';
import type {
  CoverageEntry,
  CoverageReport,
  CoverageSummary,
  CoverageVerdict,
  EntryCheck,
  EvidenceCheck,
  FileProbe,
} from './types';

/**
 * Pure verification logic for the link-coverage registry.
 *
 * No Node imports live here: the filesystem arrives as a `FileProbe`, so the
 * same code runs in the API route (with the real fs), in the CLI script, and in
 * vitest with a fake probe. A null probe means "cannot read the working tree"
 * (e.g. a standalone production build) and produces an honest `baseline` report
 * instead of pretending every file was checked.
 */

export function summarize(entries: EntryCheck[]): CoverageSummary {
  const summary: CoverageSummary = {
    links: entries.length,
    repositories: 0,
    sites: 0,
    implemented: 0,
    inKind: 0,
    reference: 0,
    gap: 0,
    notApplicable: 0,
    evidencePaths: 0,
    evidenceVerified: 0,
    missingPaths: 0,
    unverifiablePaths: 0,
    entriesFullyVerified: 0,
  };

  const verdictKey: Record<CoverageVerdict, keyof CoverageSummary> = {
    implemented: 'implemented',
    in_kind: 'inKind',
    reference: 'reference',
    gap: 'gap',
    not_applicable: 'notApplicable',
  };

  for (const entry of entries) {
    if (entry.kind === 'repository') summary.repositories += 1;
    else summary.sites += 1;
    const key = verdictKey[entry.verdict];
    summary[key] = (summary[key] as number) + 1;

    let allVerified = entry.evidence.length > 0;
    for (const item of entry.evidence) {
      summary.evidencePaths += 1;
      if (item.status === 'verified') summary.evidenceVerified += 1;
      else if (item.status === 'missing') summary.missingPaths += 1;
      else summary.unverifiablePaths += 1;
      if (item.status !== 'verified') allVerified = false;
    }
    if (allVerified) summary.entriesFullyVerified += 1;
  }

  return summary;
}

export function groupByCategory(entries: EntryCheck[]): CoverageReport['categories'] {
  const map = new Map<string, { links: number; gaps: number }>();
  for (const entry of entries) {
    const current = map.get(entry.category) ?? { links: 0, gaps: 0 };
    current.links += 1;
    if (entry.verdict === 'gap') current.gaps += 1;
    map.set(entry.category, current);
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface VerifyOptions {
  entries?: CoverageEntry[];
  /** null = filesystem not readable, produce a baseline report. */
  probe: FileProbe | null;
  now?: Date;
  root?: string | null;
  inventory?: { srcFiles: number; docsFiles: number } | null;
  warnings?: string[];
}

export function verifyCoverage(options: VerifyOptions): CoverageReport {
  const {
    entries = LINK_COVERAGE,
    probe,
    now = new Date(),
    root = null,
    inventory = null,
    warnings = [],
  } = options;

  const mode: CoverageReport['mode'] = probe ? 'live' : 'baseline';
  const allWarnings = [...warnings];

  const checked: EntryCheck[] = entries.map((entry) => {
    const evidence: EvidenceCheck[] = entry.evidence.map((item) => {
      const base = {
        ...item,
        exists: false,
        isDirectory: false,
        bytes: 0,
        lines: 0,
        sha256Prefix: null as string | null,
      };

      if (!probe) {
        return { ...base, status: 'unverifiable' as const, error: 'filesystem not readable' };
      }

      const stat = probe.stat(item.path);
      if (!stat || !stat.exists) {
        return { ...base, status: 'missing' as const, error: 'path not found in working tree' };
      }

      return {
        ...base,
        exists: true,
        isDirectory: stat.isDirectory,
        bytes: stat.bytes,
        lines: stat.lines,
        sha256Prefix: stat.sha256Prefix,
        status: 'verified' as const,
      };
    });

    const missing = evidence.filter((item) => item.status === 'missing').map((item) => item.path);

    return {
      id: entry.id,
      url: entry.url,
      kind: entry.kind,
      category: entry.category,
      verdict: entry.verdict,
      claim: entry.claim,
      gap: entry.gap,
      verified: evidence.filter((item) => item.status === 'verified').length,
      missing,
      evidence,
    };
  });

  const summary = summarize(checked);

  if (mode === 'baseline') {
    allWarnings.push(
      'The working tree is not readable from this runtime, so evidence files could not be opened. ' +
        'Showing the registry claims only; run the check where the source tree is present.',
    );
  }
  if (summary.missingPaths > 0) {
    allWarnings.push(
      `${summary.missingPaths} evidence path(s) are listed in the registry but absent from the working tree. ` +
        'Either the file moved or the claim is no longer true.',
    );
  }

  return {
    generatedAt: now.toISOString(),
    mode,
    root,
    summary,
    categories: groupByCategory(checked),
    entries: checked,
    inventory,
    warnings: allWarnings,
  };
}

/** Search + filter used by the dashboard. Pure so it is covered by tests. */
export interface CoverageFilter {
  query?: string;
  verdict?: CoverageVerdict | 'all';
  category?: string | 'all';
  onlyGaps?: boolean;
  onlyMissing?: boolean;
}

export function filterEntries(entries: EntryCheck[], filter: CoverageFilter = {}): EntryCheck[] {
  const query = (filter.query ?? '').trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.verdict && filter.verdict !== 'all' && entry.verdict !== filter.verdict) return false;
    if (filter.category && filter.category !== 'all' && entry.category !== filter.category) return false;
    if (filter.onlyGaps && entry.verdict !== 'gap') return false;
    if (filter.onlyMissing && entry.missing.length === 0) return false;
    if (!query) return true;
    const haystack = [
      entry.id,
      entry.url,
      entry.category,
      entry.verdict,
      entry.claim,
      entry.gap ?? '',
      ...entry.evidence.map((item) => `${item.label} ${item.path}`),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

/** Rows a super admin should act on: declared gaps, or claims that no longer hold. */
export function actionItems(entries: EntryCheck[]): EntryCheck[] {
  return entries.filter((entry) => entry.verdict === 'gap' || entry.missing.length > 0);
}
