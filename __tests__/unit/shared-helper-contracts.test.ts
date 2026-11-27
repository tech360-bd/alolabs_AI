// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SITE_NAV, SITE_RESOURCE_NAV, SiteHeader } from '@/components/site/chrome';
import { SiteHeader as StudioHeader } from '@/components/site/site-header';
import { filterByField, filterBySearch, filterByStatus, paginate } from '@/lib/hubs/records';
import { isRecord } from '@/lib/is-record';
import { formatCompactNumber, formatShortDate, formatShortDateTime, formatTimeAgo } from '@/lib/display-format';
import { sessionTtlHours } from '@/lib/session-ttl';
import { actionErrorResponse, authFailure, messageErrorResponse, notFoundOrActionError, redactedErrorResponse } from '@/lib/api/route-errors';
import { parseJsonArray, parseJsonOr, parseJsonRecord, parseJsonStringList, parseNonNullJsonOr } from '@/lib/json-values';
import { mapChatFinishReason, mapRouterFinishReason } from '@/lib/ai-router/finish-reason';
import { publicTaskStatus } from '@/lib/api/public-response';

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('shared implementations', () => {
  it('keeps the original navigation imports and metadata without introducing a second header', () => {
    expect(SiteHeader).toBe(StudioHeader);
    expect(SITE_NAV.map(n => n.href)).toEqual(['solutions', 'services', 'how-we-work', 'about', 'careers', 'contact'].map(p => `/site/${p}`));
    // `/site/stack` (the ecosystem stack register) was added after projects: it is
    // a public catalogue page, so it belongs with the resource links, not the pitch.
    expect(SITE_RESOURCE_NAV.map(n => n.href)).toEqual(['/site/projects', '/site/stack', '/portal', '/site/privacy', '/site/terms']);
    expect([...SITE_NAV, ...SITE_RESOURCE_NAV].every(n => n.hint)).toBe(true);
  });
  it('retains hub filtering and pagination edge cases', () => {
    const a = { tags: ['x', 'y'], status: 'approved', title: 'Hello World' }, b = { tags: 'z', status: 'pending', title: 'Another' };
    const rows = [a, b];
    expect(filterByField(rows, 'tags', 'y')).toEqual([a]);
    expect(filterByField(rows, 'tags', 'z')).toEqual([b]);
    expect(filterByStatus(rows, '')).toBe(rows);
    expect(filterBySearch(rows, 'WORLD', ['title'])).toEqual([a]);
    expect(paginate(rows, 2, 1)).toEqual({ data: [b], pagination: { page: 2, limit: 1, total: 2, pages: 2 } });
    expect(paginate([], 1, 20).pagination.pages).toBe(1);
  });
  it('preserves record checks, locale formatting and session TTL defaults', () => {
    expect([{}, [], null, 's', new Date()].map(isRecord)).toEqual([true, false, false, false, true]);
    const timestamp = '2026-11-18T12:00:00';
    vi.useFakeTimers(); vi.setSystemTime(new Date(timestamp).getTime() + 120_000);
    expect(formatTimeAgo(timestamp)).toBe('2m ago');
    expect(formatShortDate(timestamp)).toBe('Nov 18, 2026');
    expect(formatShortDateTime(timestamp)).toContain('Nov 18');
    expect(formatCompactNumber(1250)).toBe('1.3K');
    vi.stubEnv('SESSION_TTL_HOURS', 'invalid'); expect(sessionTtlHours(false)).toBe(24);
    vi.stubEnv('SESSION_TTL_HOURS', '7'); expect(sessionTtlHours(false)).toBe(7);
    expect(sessionTtlHours(true)).toBe(720);
  });
  it('keeps different route error shapes, disclosure policies, and status codes distinct', async () => {
    const missing = Error('Item not found');
    for (const [map, status, body] of [
      [actionErrorResponse, 500, { success: false, error: missing.message }],
      [notFoundOrActionError, 404, { success: false, error: missing.message }],
      [redactedErrorResponse, 500, { error: 'Internal server error' }],
      [messageErrorResponse, 500, { error: missing.message }],
    ] as const) {
      const response = map(missing);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(body);
      expect(map(Error('Forbidden')).status).toBe(403);
      expect(map(Error('Unauthorized')).status).toBe(401);
    }
    expect(authFailure(missing)).toBeNull();
    expect(authFailure(Error('Unauthorized'))?.status).toBe(401);
  });
  it('keeps literal null, non-null fallbacks, records, and string-array parsing distinct', () => {
    expect(parseJsonOr('null', 'fallback')).toBeNull();
    expect(parseNonNullJsonOr('null', 'fallback')).toBe('fallback');
    expect(parseJsonArray('[1,"two"]')).toEqual([1, 'two']);
    expect(parseJsonStringList('[1,"two"]')).toEqual([]);
    expect(parseJsonRecord('[]')).toEqual({});
    expect(parseJsonRecord('{"x":false}')).toEqual({ x: false });
  });
  it('retains each provider family’s finish reasons and the public task-status aliases', () => {
    expect(mapRouterFinishReason('max_tokens')).toBe('length');
    expect(mapChatFinishReason('max_tokens')).toBe('stop');
    expect(mapRouterFinishReason('content_filter')).toBe('content-filter');
    expect(mapChatFinishReason('tool_calls')).toBe('tool-calls');
    expect(['in_progress','succeeded','error','canceled','other'].map(publicTaskStatus)).toEqual(['running','completed','failed','cancelled','pending']);
  });
});
