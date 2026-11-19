// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createRealDb, type RealDb } from '../helpers/real-db';
let fixture: RealDb, token: string;
vi.mock('next/headers', () => ({ headers: async () => new Headers({authorization: `Bearer ${token}`}) }));
beforeAll(async () => {
  fixture = await createRealDb('account-link');
  vi.stubEnv('ENCRYPTION_KEY', 'isolated-fixture-key-'.repeat(2));
  vi.stubEnv('TWITTER_CLIENT_ID', 'test-id'); vi.stubEnv('TWITTER_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.test');
  const user = await fixture.db.user.create({ data: { email: 'link@example.test', name: 'Link test', role: 'super_admin', passwordHash: 'unused' } });
  token = await (await import('@/lib/auth')).createSessionToken(user.id);
});
afterAll(async () => { vi.unstubAllEnvs(); await fixture?.cleanup(); });
it('requires an admin, consumes link state only once and persists only ciphertext (provider exchange stubbed)', async () => {
  const { POST, GET } = await import('@/app/api/social/oauth/[provider]/route');
  const { readSocialCredential } = await import('@/lib/social/credentials');
  const args = { params: Promise.resolve({provider: 'twitter'}) }, url = 'https://example.test/api/social/oauth/twitter';
  const start = await POST(new NextRequest(url, {method:'POST'}), args);
  expect(start.status).toBe(200);
  const dest = new URL((await start.json()).authorizationUrl);
  expect(dest.searchParams.get('code_challenge_method')).toBe('S256');
  expect(dest.searchParams.get('state')).toBeTruthy();
  expect(start.headers.get('set-cookie')).toMatch(/HttpOnly/i);
  const redirect = new URL(url); redirect.searchParams.set('state', dest.searchParams.get('state')!); redirect.searchParams.set('code','code-fixture');
  const callback = new NextRequest(redirect); expect((await GET(callback,args)).status).toBe(403);
  callback.cookies.set('alo-social-link',start.cookies.get('alo-social-link')!.value);
  const provider = vi.mocked(fetch).mockResolvedValueOnce(Response.json({ access_token: 'token-fixture', expires_in: 1800 }));
  expect((await GET(callback,args)).status).toBe(307);
  expect(provider).toHaveBeenCalledTimes(1);
  const row = await fixture.db.settings.findUniqueOrThrow({where:{key:'social:twitter:token'}});
  expect(row.type).toBe('encrypted'); expect(row.value).not.toContain('token-fixture');
  expect(JSON.parse(readSocialCredential(row.value)).accessToken).toBe('token-fixture');
  expect((await GET(callback,args)).status).toBe(403); expect(provider).toHaveBeenCalledTimes(1);
  const user = await fixture.db.user.create({data:{email:'reader@example.test',name:'reader',role:'account_manager',passwordHash:'unused'}});
  token = await (await import('@/lib/auth')).createSessionToken(user.id);
  expect((await POST(new NextRequest(url, {method:'POST'}), args)).status).toBe(403);
});
