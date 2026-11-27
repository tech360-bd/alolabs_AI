// @vitest-environment node
/**
 * /api/integrations/catalog — the Wave-2 capability catalog.
 *
 * The auth layer is mocked (the real wrapper is covered elsewhere); the REAL
 * registry is used, so these assertions prove the 20 new systems are actually
 * reachable through the authenticated API surface, with license metadata, and
 * that no credential material is exposed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  principal: {
    userId: 'user-1',
    companyId: 'company-1',
    role: 'admin',
    companyRole: 'owner',
  },
}));

vi.mock('@/lib/api-auth', () => ({ getAuthUser: mocks.auth }));
// The wrapper falls back to company API-key auth when there is no session; that
// path is covered by its own suite, so here it simply declines.
vi.mock('@/lib/v1-auth', () => ({ authenticateV1: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/db', () => ({
  db: {
    securityEvent: { create: vi.fn().mockResolvedValue({ id: 'se-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'al-1' }) },
  },
}));

import { GET } from '@/app/api/integrations/catalog/route';

/**
 * Minimal NextRequest stand-in. `secureRoute` reads `request.nextUrl.searchParams`
 * for query validation, which the plain Fetch `Request` does not provide.
 */
function request(url: string): Request {
  const parsed = new URL(url);
  return {
    url,
    method: 'GET',
    nextUrl: { searchParams: parsed.searchParams },
    headers: new Headers({
      authorization: 'Bearer test-token',
      'x-company-id': 'company-1',
    }),
  } as unknown as Request;
}

async function callRoute(url: string): Promise<{ status: number; body: any }> {
  // secureRoute handlers are called with a NextRequest-like object.
  const res = await GET(request(url) as never);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(mocks.principal);
});

describe('GET /api/integrations/catalog', () => {
  it('returns the full catalog with license + strategy metadata', async () => {
    const { status, body } = await callRoute('https://agentos.test/api/integrations/catalog');
    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const ids: string[] = body.data.map((a: { id: string }) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'gateway.litellm',
        'gateway.omniroute',
        'gateway.free-claude-code',
        'ai-chat.librechat',
        'ai-chat.open-webui',
        'coding-agent.aider',
        'coding-agent.swe-agent',
        'coding-agent.tool-loop',
        'content.directus',
        'content.grapesjs',
        'automation.activepieces',
        'automation.nocobase',
        'automation.temporal',
        'automation.jarvis',
        'deploy.caprover',
        'deploy.dokku',
        'telephony.call-gpt',
        'telephony.ai-native-callcenter',
        'telephony.call-intelligence',
        'media.infinite-talk',
      ]),
    );

    for (const row of body.data) {
      expect(row).toHaveProperty('category');
      expect(row).toHaveProperty('strategy');
      expect(row).toHaveProperty('licenseClass');
      expect(row).toHaveProperty('upstreamRepo');
    }
  });

  it('never leaks credential-shaped fields', async () => {
    const { body } = await callRoute('https://agentos.test/api/integrations/catalog');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/apiKey|bearer|secret|baseUrl/i);
  });

  it('filters by category', async () => {
    const { status, body } = await callRoute('https://agentos.test/api/integrations/catalog?category=gateway');
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((a: { category: string }) => a.category === 'gateway')).toBe(true);
  });

  it('filters by strategy and excludes AVOID', async () => {
    const { body } = await callRoute('https://agentos.test/api/integrations/catalog?strategy=LEARN');
    expect(body.data.every((a: { strategy: string }) => a.strategy === 'LEARN')).toBe(true);
    expect(body.data.map((a: { id: string }) => a.id)).toEqual(
      expect.arrayContaining(['automation.jarvis', 'coding-agent.tool-loop']),
    );
  });

  it('rejects an unknown category with 400 and requires auth', async () => {
    const bad = await callRoute('https://agentos.test/api/integrations/catalog?category=not-a-category');
    expect(bad.status).toBe(400);

    mocks.auth.mockResolvedValue(null);
    const unauth = await GET(request('https://agentos.test/api/integrations/catalog') as never);
    expect([401, 403]).toContain(unauth.status);
  });
});
