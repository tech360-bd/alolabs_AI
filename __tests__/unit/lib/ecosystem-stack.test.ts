import { describe, it, expect } from 'vitest';
import {
  buildStack,
  displayName,
  filterStack,
  findStackEntry,
  gapQueue,
  pillarOf,
  STACK_BRIEFS,
  STACK_PILLARS,
  VERDICT_META,
  VERDICT_ORDER,
  type StackAdapter,
} from '@/lib/ecosystem/stack';
import { LINK_COVERAGE } from '@/lib/link-coverage/registry';
import { commandToolSchemas, getCommandTool, stackRegisterLookup } from '@/lib/command-agent/tools';
import type { CoverageEntry } from '@/lib/link-coverage/types';

/**
 * The stack register is a presentation layer over two catalogues, so the risk is
 * silent drift: a row that renders with no pillar, a brief that points at an id
 * nobody has, a verdict the badges cannot style. These tests pin the joins.
 */

const entry = (over: Partial<CoverageEntry> & Pick<CoverageEntry, 'id' | 'url'>): CoverageEntry => ({
  kind: 'repository',
  category: 'AI & models',
  upstream: 'An upstream system used to test the register.',
  verdict: 'reference',
  claim: 'A claim long enough to satisfy the registry contract.',
  evidence: [{ label: 'Evidence', path: 'package.json', kind: 'config' }],
  upstreamMeta: { checkedAt: '2026-11-27' },
  ...over,
});

const ADAPTERS: StackAdapter[] = [
  {
    id: 'gateway.litellm',
    category: 'gateway',
    strategy: 'API_INTEGRATE',
    licenseClass: 'permissive',
    description: 'LiteLLM proxy',
    upstreamRepo: 'BerriAI/litellm',
  },
];

describe('stack register view model', () => {
  const report = buildStack({ adapters: ADAPTERS });

  it('renders every registry row — nothing is dropped for lack of a category', () => {
    expect(report.entries).toHaveLength(LINK_COVERAGE.length);
    for (const view of report.entries) {
      expect(view.pillar.id, `${view.id} has no pillar`).toBeTruthy();
      expect(STACK_PILLARS.map((pillar) => pillar.id)).toContain(view.pillar.id);
      expect(view.name.trim().length).toBeGreaterThan(0);
      expect(view.claim.length).toBeGreaterThan(20);
      expect(view.evidence.length).toBeGreaterThan(0);
    }
  });

  it('counts verdicts so the totals always add up to the register size', () => {
    const { stats } = report;
    expect(stats.implemented + stats.inKind + stats.reference + stats.gap + stats.notApplicable).toBe(stats.links);
    expect(stats.links).toBe(LINK_COVERAGE.length);
    for (const verdict of report.verdicts) {
      expect(verdict.count).toBe(report.entries.filter((item) => item.verdict === verdict.id).length);
    }
  });

  it('exposes every verdict with a human label and a tone the UI can style', () => {
    expect(report.verdicts.map((item) => item.id)).toEqual(VERDICT_ORDER);
    for (const verdict of report.verdicts) {
      expect(verdict.label.length).toBeGreaterThan(2);
      expect(verdict.meaning.length).toBeGreaterThan(20);
      expect(['green', 'blue', 'slate', 'amber', 'rose']).toContain(verdict.tone);
    }
    expect(Object.keys(VERDICT_META).sort()).toEqual([...VERDICT_ORDER].sort());
  });

  it('joins the registered adapter onto the row it belongs to', () => {
    const litellm = report.entries.find((item) => item.id === 'litellm-org');
    expect(litellm?.adapter).toEqual({
      id: 'gateway.litellm',
      strategy: 'API_INTEGRATE',
      licenseClass: 'permissive',
    });
    // No adapter was injected, so no other row may claim one.
    expect(report.entries.filter((item) => item.adapter)).toHaveLength(1);
  });

  it('carries a brief for every system that has operating knowledge', () => {
    for (const [id, brief] of Object.entries(STACK_BRIEFS)) {
      expect(LINK_COVERAGE.some((item) => item.id === id), `brief for unknown row "${id}"`).toBe(true);
      expect(brief.useWhen.length).toBeGreaterThan(20);
      expect(brief.steps.length).toBeGreaterThan(0);
      expect(brief.risks.length).toBeGreaterThan(0);
    }
    expect(report.stats.briefs).toBe(
      LINK_COVERAGE.filter((item) => STACK_BRIEFS[item.id]).length,
    );
  });

  it('marks the three genuine gaps rather than rounding them up', () => {
    const gaps = gapQueue(report.entries).map((item) => item.id);
    expect(gaps).toContain('signudoc');
    expect(gaps).toContain('floppydata-cloud-browser');
    expect(gaps).toContain('postman');
    for (const view of gapQueue(report.entries)) {
      expect(view.gap, `${view.id} is a gap without a next step`).toBeTruthy();
    }
  });

  it('never publishes a claim without evidence, including through the detail lookup', () => {
    const view = findStackEntry('signudoc', report.entries);
    expect(view).toBeDefined();
    expect(view?.evidence.length).toBeGreaterThan(0);
    expect(findStackEntry('not-a-real-row', report.entries)).toBeUndefined();
  });

  it('summarises pillars without losing rows', () => {
    const total = report.pillars.reduce((sum, pillar) => sum + pillar.total, 0);
    expect(total).toBe(report.entries.length);
    for (const pillar of report.pillars) {
      expect(pillar.total).toBeGreaterThan(0);
      expect(pillar.gaps + pillar.implemented).toBeLessThanOrEqual(pillar.total);
    }
  });
});

describe('stack filtering', () => {
  const { entries } = buildStack({ adapters: [] });

  it('filters by verdict', () => {
    const gaps = filterStack(entries, { verdict: 'gap' });
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((item) => item.verdict === 'gap')).toBe(true);
  });

  it('filters by pillar', () => {
    const models = filterStack(entries, { pillar: 'models' });
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((item) => item.pillar.id === 'models')).toBe(true);
  });

  it('searches name, claim, gap and category case-insensitively', () => {
    expect(filterStack(entries, { q: 'LITELLM' }).map((item) => item.id)).toContain('litellm-org');
    expect(filterStack(entries, { q: 'signature' }).map((item) => item.id)).toContain('signudoc');
    expect(filterStack(entries, { q: '   ' })).toHaveLength(entries.length);
    expect(filterStack(entries, { q: 'zzzz-no-such-system' })).toHaveLength(0);
  });

  it('combines filters rather than ignoring them', () => {
    const combined = filterStack(entries, { verdict: 'gap', pillar: 'agents' });
    expect(combined.every((item) => item.verdict === 'gap' && item.pillar.id === 'agents')).toBe(true);
  });
});

describe('display names and pillars', () => {
  it('uses curated names where the URL is ambiguous', () => {
    expect(displayName({ id: 'litellm-org', url: 'https://github.com/orgs/BerriAI/repositories' })).toBe('LiteLLM (BerriAI)');
    expect(displayName({ id: 'signudoc', url: 'https://github.com/NYLLON-SOFTWARE/SignuDoc.git' })).toBe('SignuDoc');
  });

  it('derives a readable name for an uncurated row', () => {
    expect(displayName({ id: 'brand-new', url: 'https://github.com/acme/rocket.git' })).toBe('rocket');
    expect(displayName({ id: 'brand-new-site', url: 'https://example.com/pricing/' })).toBe('example.com');
  });

  it('maps an unknown category to a pillar instead of throwing', () => {
    const pillar = pillarOf({ category: 'Something New' });
    expect(pillar.id).toBe('applied');
  });
});

describe('stack register as an agent tool', () => {
  it('is exposed to the Command Agent with a schema', () => {
    const tool = getCommandTool('stack_register');
    expect(tool).toBeDefined();
    expect(tool?.description).toMatch(/verdict/i);
    expect(commandToolSchemas().map((schema) => schema.function.name)).toContain('stack_register');
  });

  it('answers "do we already support X?" with the honest verdict', async () => {
    const litellm = (await stackRegisterLookup({ query: 'litellm' })) as {
      matches: { id: string; verdict: string; adapter?: string }[];
      guidance: string;
    };
    expect(litellm.matches[0].id).toBe('litellm-org');
    expect(litellm.matches[0].verdict).toBe('implemented');
    expect(litellm.matches[0].adapter).toBe('gateway.litellm');
    expect(litellm.guidance).toMatch(/never claim/i);

    const signature = (await stackRegisterLookup({ query: 'e-signature' })) as {
      matches: { id: string; nextStep?: string }[];
    };
    const signudoc = signature.matches.find((row) => row.id === 'signudoc');
    expect(signudoc?.nextStep).toBeTruthy();
  });

  it('filters by verdict and respects its own limit', async () => {
    const gaps = (await stackRegisterLookup({ verdict: 'gap', limit: 3 })) as {
      matches: { verdict: string }[];
      total: number;
    };
    expect(gaps.matches).toHaveLength(3);
    expect(gaps.matches.every((row) => row.verdict === 'gap')).toBe(true);
    expect(gaps.total).toBeGreaterThan(3);
  });

  it('never returns tenant data and stays offline', async () => {
    const result = (await stackRegisterLookup({ query: 'temporal' })) as Record<string, unknown>;
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(serialised).not.toMatch(/\/home\/|C:\\\\/); // no absolute paths
  });
});
