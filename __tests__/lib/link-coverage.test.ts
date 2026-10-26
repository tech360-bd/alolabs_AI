import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COVERAGE_CHECKED_AT, COVERAGE_CATEGORIES, LINK_COVERAGE } from '@/lib/link-coverage/registry';
import { actionItems, filterEntries, groupByCategory, summarize, verifyCoverage } from '@/lib/link-coverage/verify';
import type { CoverageEntry, FileProbe } from '@/lib/link-coverage/types';

/**
 * The registry is a promise: "these files prove this capability". These tests
 * are what stops the promise from rotting — if a route is renamed or deleted,
 * the suite fails rather than the dashboard quietly lying.
 */

const ROOT = process.cwd();

/** Every link in the reference list sent for this round, normalised. */
const EXPECTED_LINKS = [
  'buffer.com',
  'coder.qwen.ai',
  'stackoverflow.com',
  'mureka.ai',
  'astryx.atmeta.com',
  'cline.bot',
  'openrouter.ai',
  'enerpize.com',
  'aipraktor.com',
  'supercool.com',
  'join.supercool.com',
  'hatchable.com',
  'hetrixtools.com',
  'platform.mat3ra.com',
  'mat3ra.com',
  'refine.ink',
  'larksuite.com',
  'github.com/cometchat/cometchat-skills',
  'github.com/ketanyekale/android-java-chat-app',
  'github.com/cometchat/cometchat-uikit-react',
  'github.com/cometchat/cometchat-uikit-android',
  'github.com/cometchat/cometchat-uikit-ios',
  'github.com/cometchat/cometchat-uikit-react-native',
  'github.com/cometchat/docs-mcp',
  'github.com/developerspace-samples/VoIP-Call-Sample',
  'github.com/developerspace-samples/WebRTC-Kotlin-Sample',
  'github.com/cometchat',
  'github.com/domovinatv/sms.domovina.ai',
  'github.com/CALLE-AI/awesome-phone-call-agents',
  'github.com/amulchapla/AI-Powered-Call-Center-Intelligence',
  'github.com/rasonyang/ai-native-callcenter',
  'github.com/video-db/call.md',
  'github.com/microsoft/call-center-ai',
  'github.com/xiaochong/hi-kid',
  'github.com/TheExplainthis/ChatGPT-AI-English-Tutor',
  'github.com/nikmcfly/MiroFish-Offline',
  'github.com/xckevin/magic-english-buddy',
  'github.com/PennyroyalTea/gibberlink',
  'github.com/mattpocock/dictionary-of-ai-coding',
  'github.com/iamakshayshar/AITestCaseGenerator',
  'github.com/BelledonneCommunications/linphone-iphone',
  'github.com/monkscode/Natural-Language-to-Robot-Framework',
  'github.com/graykode/toeicbert',
  'github.com/ioi-labs/molx',
  'github.com/cline/cline',
];

function normalise(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
}

function fakeProbe(missing: string[] = []): FileProbe {
  return {
    stat(relativePath: string) {
      if (missing.includes(relativePath)) return null;
      return { exists: true, isDirectory: false, bytes: 42, lines: 3, sha256Prefix: 'abcdef123456' };
    },
    countFiles() {
      return 10;
    },
  };
}

describe('link coverage registry', () => {
  it('covers every link in the reference list, deduplicated', () => {
    const actual = LINK_COVERAGE.map((entry) => normalise(entry.url));
    expect(actual).toHaveLength(EXPECTED_LINKS.length);
    expect(new Set(actual).size).toBe(actual.length);
    for (const expected of EXPECTED_LINKS) {
      expect(actual, `missing registry row for ${expected}`).toContain(expected);
    }
  });

  it('uses a stable slug per row', () => {
    const ids = LINK_COVERAGE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('has a claim and at least one evidence path per link', () => {
    for (const entry of LINK_COVERAGE) {
      expect(entry.claim.length, `${entry.id} needs a claim`).toBeGreaterThan(20);
      expect(entry.evidence.length, `${entry.id} needs evidence`).toBeGreaterThan(0);
      expect(COVERAGE_CATEGORIES).toContain(entry.category);
      expect(entry.upstream.length).toBeGreaterThan(5);
    }
  });

  it('names the next step for every declared gap', () => {
    for (const entry of LINK_COVERAGE.filter((item) => item.verdict === 'gap')) {
      expect(entry.gap, `${entry.id} is a gap without a next step`).toBeTruthy();
      expect((entry.gap ?? '').length).toBeGreaterThan(20);
    }
  });

  it('keeps evidence paths repository-relative and free of traversal', () => {
    for (const entry of LINK_COVERAGE) {
      for (const item of entry.evidence) {
        expect(item.path.startsWith('/'), `${entry.id}: ${item.path}`).toBe(false);
        expect(item.path.includes('..'), `${entry.id}: ${item.path}`).toBe(false);
        expect(item.path).not.toMatch(/^[a-zA-Z]:/);
        expect(item.label.length).toBeGreaterThan(2);
      }
    }
  });

  it('every claimed evidence file exists on disk', () => {
    const missing: string[] = [];
    for (const entry of LINK_COVERAGE) {
      for (const item of entry.evidence) {
        const absolute = join(ROOT, item.path);
        if (!existsSync(absolute)) missing.push(`${entry.id} -> ${item.path}`);
        else if (!statSync(absolute).isDirectory() && statSync(absolute).size === 0)
          missing.push(`${entry.id} -> ${item.path} (empty file)`);
      }
    }
    expect(missing, `evidence drifted from the source tree:\n${missing.join('\n')}`).toEqual([]);
  });

  it('records upstream metadata with a real check date', () => {
    expect(COVERAGE_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const entry of LINK_COVERAGE) {
      expect(entry.upstreamMeta?.checkedAt, `${entry.id} needs a check date`).toBe(COVERAGE_CHECKED_AT);
    }
    const cline = LINK_COVERAGE.find((entry) => entry.id === 'cline-repo');
    expect(cline?.upstreamMeta?.stars).toBeGreaterThan(0);
    expect(cline?.upstreamMeta?.language).toBe('TypeScript');
  });

  it('does not claim telephony, ERP or crawler parity', () => {
    // These three were checked and are genuinely absent; a future change that
    // adds them should update both the code and this registry deliberately.
    const gapIds = LINK_COVERAGE.filter((entry) => entry.verdict === 'gap').map((entry) => entry.id);
    expect(gapIds).toEqual(
      expect.arrayContaining(['enerpize', 'molx', 'ai-native-callcenter', 'microsoft-call-center-ai']),
    );
  });
});

describe('verifyCoverage', () => {
  it('verifies every path when the probe can read the tree', () => {
    const report = verifyCoverage({ probe: fakeProbe(), root: '/repo', now: new Date('2026-10-26T00:00:00Z') });
    expect(report.mode).toBe('live');
    expect(report.generatedAt).toBe('2026-10-26T00:00:00.000Z');
    expect(report.summary.links).toBe(LINK_COVERAGE.length);
    expect(report.summary.missingPaths).toBe(0);
    expect(report.summary.evidenceVerified).toBe(report.summary.evidencePaths);
    expect(report.summary.entriesFullyVerified).toBe(LINK_COVERAGE.length);
    expect(report.warnings).toEqual([]);
    expect(report.entries.every((entry) => entry.evidence.every((item) => item.status === 'verified'))).toBe(true);
  });

  it('reports a drifted claim as missing instead of hiding it', () => {
    const victim = LINK_COVERAGE[0];
    const broken = victim.evidence[0].path;
    const report = verifyCoverage({ entries: [victim], probe: fakeProbe([broken]) });
    expect(report.summary.missingPaths).toBe(1);
    expect(report.entries[0].missing).toEqual([broken]);
    expect(report.entries[0].evidence[0].status).toBe('missing');
    expect(report.warnings.join(' ')).toContain('1 evidence path');
    expect(report.summary.entriesFullyVerified).toBe(0);
  });

  it('degrades to baseline when the filesystem is not readable', () => {
    const report = verifyCoverage({ probe: null });
    expect(report.mode).toBe('baseline');
    expect(report.summary.unverifiablePaths).toBe(report.summary.evidencePaths);
    expect(report.summary.evidenceVerified).toBe(0);
    expect(report.summary.entriesFullyVerified).toBe(0);
    expect(report.warnings.length).toBeGreaterThan(0);
    // Verdicts stay truthful: the registry is still reported, just unverified.
    expect(report.summary.gap).toBe(LINK_COVERAGE.filter((entry) => entry.verdict === 'gap').length);
  });

  it('sums verdict counts to the number of links', () => {
    const report = verifyCoverage({ probe: fakeProbe() });
    const s = report.summary;
    expect(s.implemented + s.inKind + s.reference + s.gap + s.notApplicable).toBe(s.links);
    expect(s.repositories + s.sites).toBe(s.links);
    expect(report.categories.reduce((sum, category) => sum + category.links, 0)).toBe(s.links);
  });

  it('summarize() accepts hand-built entries', () => {
    const entry: CoverageEntry = {
      id: 'x',
      url: 'https://example.com',
      kind: 'site',
      category: 'Test',
      upstream: 'example',
      verdict: 'in_kind',
      claim: 'a claim long enough to be checked by a reader',
      evidence: [{ label: 'Package manifest', path: 'package.json', kind: 'config' }],
    };
    const report = verifyCoverage({ entries: [entry], probe: fakeProbe() });
    const summary = summarize(report.entries);
    expect(summary.links).toBe(1);
    expect(summary.inKind).toBe(1);
    expect(summary.evidencePaths).toBe(1);
    expect(groupByCategory(report.entries)).toEqual([{ name: 'Test', links: 1, gaps: 0 }]);
  });
});

describe('dashboard filters', () => {
  const report = verifyCoverage({ entries: LINK_COVERAGE, probe: fakeProbe([LINK_COVERAGE[1].evidence[0].path]) });

  it('filters by verdict, category and free text', () => {
    const gaps = filterEntries(report.entries, { verdict: 'gap' });
    expect(gaps.every((entry) => entry.verdict === 'gap')).toBe(true);

    const category = report.entries[0].category;
    const byCategory = filterEntries(report.entries, { category });
    expect(byCategory.length).toBeGreaterThan(0);
    expect(byCategory.every((entry) => entry.category === category)).toBe(true);

    const searched = filterEntries(report.entries, { query: 'openrouter' });
    expect(searched.map((entry) => entry.id)).toContain('openrouter');
  });

  it('searches evidence paths as well as claims', () => {
    const target = report.entries[0].evidence[0].path;
    const found = filterEntries(report.entries, { query: target });
    expect(found.map((entry) => entry.id)).toContain(report.entries[0].id);
  });

  it('surfaces gaps and missing files as action items', () => {
    const items = actionItems(report.entries);
    expect(items.some((entry) => entry.verdict === 'gap')).toBe(true);
    expect(items.some((entry) => entry.missing.length > 0)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(report.entries.length);
    for (const entry of items) expect(entry.verdict === 'gap' || entry.missing.length > 0).toBe(true);
  });

  it('onlyMissing keeps just the drifted rows', () => {
    const missing = filterEntries(report.entries, { onlyMissing: true });
    expect(missing).toHaveLength(1);
    expect(missing[0].missing.length).toBeGreaterThan(0);
  });
});
