// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWeeklyDiscoveryReport } from '@/lib/ai-discovery/weekly-discovery';
import { isWeeklyDiscoveryWindow } from '@/lib/cron-jobs';
import { FREE_PROVIDER_CATALOGUES } from '@/lib/ai-router/free-provider-specs';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('weekly open-source AI discovery', () => {
  it('reports that nothing could be queried when no credential is configured', async () => {
    const report = await buildWeeklyDiscoveryReport({ env: { NODE_ENV: 'test' } });
    expect(report.providers).toEqual([]);
    expect(report.newModels).toEqual([]);
    expect(report.limitations[0]).toContain('No free provider credentials');
    // It must never claim to have verified anything it did not query.
    expect(report.recommendations).toEqual([]);
  });

  it('reports a provider as unreachable instead of guessing its catalogue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const report = await buildWeeklyDiscoveryReport({
      env: { NODE_ENV: 'test',  GEMINI_API_KEY: 'k' },
      timeoutMs: 50,
    });
    expect(report.providers).toHaveLength(1);
    expect(report.providers[0].status).toBe('unreachable');
    expect(report.providers[0].models).toEqual([]);
    expect(report.recommendations.some((r) => r.type === 'security')).toBe(true);
  });

  it('treats an HTTP error as unreachable, not as an empty catalogue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    const report = await buildWeeklyDiscoveryReport({
      env: { NODE_ENV: 'test',  CEREBRAS_API_KEY: 'k' },
      timeoutMs: 50,
    });
    expect(report.providers[0].status).toBe('unreachable');
    expect(report.providers[0].error).toContain('503');
  });

  it('flags a live model the platform does not route as a review candidate only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'gemini-9.9-experimental', context_length: 2_000_000 }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const report = await buildWeeklyDiscoveryReport({
      env: { NODE_ENV: 'test',  GEMINI_API_KEY: 'k' },
      timeoutMs: 50,
    });
    const newModel = report.newModels.find((model) => model.modelId === 'gemini-9.9-experimental');
    expect(newModel).toBeDefined();
    expect(newModel?.alreadyKnown).toBe(false);
    const review = report.recommendations.find((r) => r.detail.includes('gemini-9.9-experimental'));
    expect(review?.type).toBe('review');
    // Adoption is never automatic.
    expect(review?.detail).toContain('Verify licence');
  });

  it('detects configured models that the provider no longer advertises', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'some-other-model' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const report = await buildWeeklyDiscoveryReport({
      env: { NODE_ENV: 'test',  CEREBRAS_API_KEY: 'k' },
      timeoutMs: 50,
    });
    const configured = FREE_PROVIDER_CATALOGUES.cerebras.map((model) => model.id);
    const retired = report.deprecatedModels.filter((row) => row.provider === 'cerebras').map((row) => row.modelId);
    expect(retired.sort()).toEqual([...configured].sort());
    expect(report.recommendations.some((r) => r.type === 'retire')).toBe(true);
  });

  it('marks live models from quota-metered vendors as quota_based, never verified $0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'gemini-2.5-flash' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const report = await buildWeeklyDiscoveryReport({
      env: { NODE_ENV: 'test',  GEMINI_API_KEY: 'k' },
      timeoutMs: 50,
    });
    expect(report.providers[0].models[0].freeStatus).toBe('quota_based');
    expect(report.providers[0].models[0].alreadyKnown).toBe(true);
  });

  it('lists permissive open-weight catalogue entries from real catalogue data', async () => {
    const report = await buildWeeklyDiscoveryReport({ env: { NODE_ENV: 'test' } });
    expect(report.catalogueSize).toBeGreaterThan(0);
    expect(report.permissiveOpenWeight.length).toBeGreaterThan(0);
    expect(report.permissiveOpenWeight.every((model) => model.license.length > 0)).toBe(true);
  });

  it('declares its limitations explicitly', async () => {
    const report = await buildWeeklyDiscoveryReport({ env: { NODE_ENV: 'test' } });
    expect(report.limitations.length).toBeGreaterThanOrEqual(2);
    expect(report.limitations.join(' ')).toContain('only');
  });
});

describe('weekly discovery schedule gate', () => {
  it('opens only during Monday 03:00 UTC', () => {
    const monday3am = new Date('2026-11-16T03:05:00Z'); // Monday
    expect(isWeeklyDiscoveryWindow(monday3am)).toBe(true);
    expect(isWeeklyDiscoveryWindow(new Date('2026-11-16T04:00:00Z'))).toBe(false);
    expect(isWeeklyDiscoveryWindow(new Date('2026-11-17T03:00:00Z'))).toBe(false); // Tuesday
  });
});
