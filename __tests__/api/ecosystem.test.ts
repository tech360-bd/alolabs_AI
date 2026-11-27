// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/ecosystem/route';
import { GET as GET_ONE } from '@/app/api/ecosystem/[slug]/route';
import { LINK_COVERAGE } from '@/lib/link-coverage/registry';

/**
 * The stack register is public, so its tests are about *what it exposes* rather
 * than who may read it: static catalogue data only, correct filtering, a 404
 * with the real ids when a row does not exist, and per-path evidence that is
 * re-checked rather than trusted.
 */

const get = async (query = '') => {
  const response = await GET(new Request(`http://localhost/api/ecosystem${query}`));
  return { response, body: await response.json() };
};

describe('GET /api/ecosystem', () => {
  it('returns the whole register with computed statistics', async () => {
    const { response, body } = await get();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.total).toBe(LINK_COVERAGE.length);
    expect(body.entries).toHaveLength(LINK_COVERAGE.length);
    expect(body.stats.links).toBe(LINK_COVERAGE.length);
    expect(body.stats.implemented + body.stats.inKind + body.stats.reference + body.stats.gap + body.stats.notApplicable).toBe(
      LINK_COVERAGE.length,
    );
    // 26 adapters are registered under ONE Runtime; the register joins them on.
    expect(body.stats.adapters).toBeGreaterThanOrEqual(26);
    expect(body.notice).toMatch(/enables nothing/i);
  });

  it('is cacheable and carries no tenant fields or credentials', async () => {
    const { response, body } = await get();
    expect(response.headers.get('cache-control')).toContain('public');

    // Free text legitimately mentions `companyId` (the agent briefs tell a
    // reader which field to populate). What must never appear is a *key* that
    // carries one, or anything shaped like a secret.
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          keys.push(key);
          walk(nested);
        }
      }
    };
    walk(body);
    expect(keys.filter((key) => /^(companyId|workspaceId|apiKey|userId|ownerId)$/i.test(key))).toEqual([]);

    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // a JWT
    expect(serialised).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
  });

  it('filters by verdict', async () => {
    const { body } = await get('?verdict=gap');
    expect(body.total).toBeGreaterThan(0);
    expect(body.entries.every((row: { verdict: string }) => row.verdict === 'gap')).toBe(true);
    expect(body.entries.map((row: { id: string }) => row.id)).toContain('signudoc');
  });

  it('ignores an unknown verdict instead of returning nothing', async () => {
    const { body } = await get('?verdict=does-not-exist');
    expect(body.filters.verdict).toBe('all');
    expect(body.total).toBe(LINK_COVERAGE.length);
  });

  it('searches and filters by pillar', async () => {
    const { body } = await get('?q=litellm');
    expect(body.total).toBeGreaterThan(0);
    expect(body.entries[0].id).toBe('litellm-org');

    const byPillar = await get('?pillar=models');
    expect(byPillar.body.entries.every((row: { pillar: { id: string } }) => row.pillar.id === 'models')).toBe(true);
  });

  it('offers a summary format that drops the heavy fields', async () => {
    const { body } = await get('?format=summary');
    expect(body.entries).toHaveLength(LINK_COVERAGE.length);
    const [first] = body.entries;
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('verdict');
    expect(first).not.toHaveProperty('claim');
    expect(first).not.toHaveProperty('evidence');
  });
});

describe('GET /api/ecosystem/[slug]', () => {
  const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

  it('returns one row and re-checks its evidence against the tree', async () => {
    const response = await GET_ONE(new Request('http://localhost/api/ecosystem/signudoc'), params('signudoc'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.entry.id).toBe('signudoc');
    expect(body.entry.verdict).toBe('gap');
    expect(body.entry.gap.length).toBeGreaterThan(20);
    for (const item of body.entry.evidence) {
      // Either verified on disk (working tree) or null (standalone build).
      expect([true, null]).toContain(item.verified);
    }
    expect(body.related.length).toBeGreaterThan(0);
  });

  it('returns a 404 listing the ids that do exist', async () => {
    const response = await GET_ONE(new Request('http://localhost/api/ecosystem/nope'), params('nope'));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('not_found');
    expect(body.available).toContain('vllm');
  });

  it('exposes the agent brief for systems that have one', async () => {
    const response = await GET_ONE(new Request('http://localhost/api/ecosystem/litellm-org'), params('litellm-org'));
    const body = await response.json();
    expect(body.entry.brief.steps.length).toBeGreaterThan(0);
    expect(body.entry.adapter.id).toBe('gateway.litellm');
  });
});
