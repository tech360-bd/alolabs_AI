// @vitest-environment node
/**
 * Phase 5 integration security suite (real SQLite via createRealDb):
 *   - WhatsApp webhook fail-closed secret & pre-JSON HMAC verification
 *   - WhatsApp numbers/campaigns/send tenant isolation & encrypted tokens
 *   - Social webhooks fail-closed per-platform cryptographic verification
 *   - Social publish SSRF validation on mediaUrls
 *   - Gateway partial/malformed HMAC rejection, cross-tenant verify/tenant-gateway block, and empty-IP allowlist fail-closed
 */

import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;
let tokenA: string;
let tokenB: string;
let apiKeyA: string;
let apiKeyAIpLocked: string;

const A = { companyId: 'co-p5-a', userId: 'u-p5-a' };
const B = { companyId: 'co-p5-b', userId: 'u-p5-b' };

const savedEnv: Record<string, string | undefined> = {};
function setEnv(k: string, v: string | undefined) {
  if (!(k in savedEnv)) savedEnv[k] = process.env[k];
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

function makeReq(
  url: string,
  options: { method?: string; token?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const headers = new Headers(options.headers);
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const body = options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined);
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options.method ?? 'GET',
    headers,
    ...(body !== undefined ? { body } : {}),
  });
}

beforeAll(async () => {
  real = await createRealDb('phase5-webhooks-social-gateway');
  const { db } = real;

  await db.company.create({ data: { id: A.companyId, name: 'Phase5 Alpha', slug: 'p5-alpha', accountType: 'client', status: 'active' } });
  await db.company.create({ data: { id: B.companyId, name: 'Phase5 Beta', slug: 'p5-beta', accountType: 'client', status: 'active' } });

  await db.user.create({ data: { id: A.userId, email: 'p5a@test.local', name: 'P5 Alpha', passwordHash: 'x', role: 'admin', isActive: true } });
  await db.user.create({ data: { id: B.userId, email: 'p5b@test.local', name: 'P5 Beta', passwordHash: 'x', role: 'admin', isActive: true } });

  await db.companyUser.create({ data: { userId: A.userId, companyId: A.companyId, role: 'owner' } });
  await db.companyUser.create({ data: { userId: B.userId, companyId: B.companyId, role: 'owner' } });

  apiKeyA = `alo_p5_${crypto.randomBytes(16).toString('hex')}`;
  apiKeyAIpLocked = `alo_p5_${crypto.randomBytes(16).toString('hex')}`;

  await db.companyApiKey.create({
    data: {
      companyId: A.companyId,
      name: 'Alpha Open Key',
      keyPrefix: apiKeyA.slice(0, 12),
      keyHash: crypto.createHash('sha256').update(apiKeyA).digest('hex'),
      scopes: JSON.stringify(['*']),
      isActive: true,
    },
  });

  await db.companyApiKey.create({
    data: {
      companyId: A.companyId,
      name: 'Alpha IP Locked Key',
      keyPrefix: apiKeyAIpLocked.slice(0, 12),
      keyHash: crypto.createHash('sha256').update(apiKeyAIpLocked).digest('hex'),
      scopes: JSON.stringify(['*']),
      ipAllowlist: JSON.stringify(['203.0.113.0/24']),
      isActive: true,
    },
  });

  const { createSessionToken } = await import('@/lib/auth');
  tokenA = await createSessionToken(A.userId);
  tokenB = await createSessionToken(B.userId);
}, 120_000);

beforeEach(() => {
  for (const k of Object.keys(savedEnv)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

afterAll(async () => {
  for (const k of Object.keys(savedEnv)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  await real?.cleanup();
});

describe('Phase 5: WhatsApp webhook, numbers & tenant isolation', () => {
  it('fails closed on POST /api/whatsapp/webhook when WHATSAPP_APP_SECRET is unset even with valid JSON', async () => {
    setEnv('WHATSAPP_APP_SECRET', undefined);
    const { POST } = await import('@/app/api/whatsapp/webhook/route');
    const res = await POST(
      makeReq('http://localhost:3000/api/whatsapp/webhook', {
        method: 'POST',
        body: { entry: [] },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('verifies HMAC BEFORE parsing malformed JSON on /api/whatsapp/webhook', async () => {
    setEnv('WHATSAPP_APP_SECRET', 'wa-secret-test');
    const { POST } = await import('@/app/api/whatsapp/webhook/route');
    const res = await POST(
      makeReq('http://localhost:3000/api/whatsapp/webhook', {
        method: 'POST',
        rawBody: '{not-valid-json',
        headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('requires WHATSAPP_VERIFY_TOKEN on GET /api/whatsapp/webhook and validates constant-time', async () => {
    setEnv('WHATSAPP_VERIFY_TOKEN', undefined);
    const { GET } = await import('@/app/api/whatsapp/webhook/route');
    const missing = await GET(
      makeReq('http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=abc'),
    );
    expect(missing.status).toBe(403);

    setEnv('WHATSAPP_VERIFY_TOKEN', 'verify-xyz');
    const ok = await GET(
      makeReq('http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-xyz&hub.challenge=abc'),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('abc');
  });

  it('encrypts stored WhatsApp accessToken and isolates numbers + sends across tenants', async () => {
    setEnv('ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    const numbersRoute = await import('@/app/api/whatsapp/numbers/route');
    const sendRoute = await import('@/app/api/whatsapp/send/route');

    const createRes = await numbersRoute.POST(
      makeReq('http://localhost:3000/api/whatsapp/numbers', {
        method: 'POST',
        token: tokenA,
        body: {
          phoneNumberId: 'wa-num-alpha-1',
          displayName: 'Alpha Support',
          accessToken: 'EAAG-plaintext-secret-token',
          isDefault: true,
        },
      }),
    );
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { number: { id: string; accessToken: string } };
    expect(created.number.accessToken).toBe('***REDACTED***');

    // Stored token in DB must be encrypted, never plaintext
    const row = await real.db.settings.findUniqueOrThrow({ where: { key: 'whatsapp:numbers' } });
    expect(row.value).not.toContain('EAAG-plaintext-secret-token');
    expect(row.value).toMatch(/v[12]:/);

    // Tenant B cannot see, modify, delete, or send from Tenant A's number
    const listB = await numbersRoute.GET(makeReq('http://localhost:3000/api/whatsapp/numbers', { token: tokenB }));
    expect(listB.status).toBe(200);
    expect(((await listB.json()) as { data: unknown[] }).data).toHaveLength(0);

    const putB = await numbersRoute.PUT(
      makeReq('http://localhost:3000/api/whatsapp/numbers', {
        method: 'PUT',
        token: tokenB,
        body: { id: created.number.id, displayName: 'Hijacked' },
      }),
    );
    expect(putB.status).toBe(403);

    const delB = await numbersRoute.DELETE(
      makeReq(`http://localhost:3000/api/whatsapp/numbers?id=${created.number.id}`, {
        method: 'DELETE',
        token: tokenB,
      }),
    );
    expect(delB.status).toBe(403);

    const sendB = await sendRoute.POST(
      makeReq('http://localhost:3000/api/whatsapp/send', {
        method: 'POST',
        token: tokenB,
        body: {
          to: '+15551234567',
          type: 'text',
          text: 'cross-tenant probe',
          phoneNumberId: 'wa-num-alpha-1',
        },
      }),
    );
    expect(sendB.status).toBe(403);
  });
});

describe('Phase 5: Social webhooks & publish SSRF guard', () => {
  it('rejects unsigned and unconfigured social webhooks and verifies real platform HMACs', async () => {
    const { POST } = await import('@/app/api/social/webhooks/[platform]/route');

    // Unconfigured secret -> 401
    setEnv('TWITTER_CLIENT_SECRET', undefined);
    const unconfigured = await POST(
      makeReq('http://localhost:3000/api/social/webhooks/twitter', {
        method: 'POST',
        body: { tweet_create_events: [] },
        headers: { 'x-twitter-webhooks-signature': 'sha256=anything' },
      }),
      { params: Promise.resolve({ platform: 'twitter' }) },
    );
    expect(unconfigured.status).toBe(401);

    // Non-empty bogus signature must NOT pass for twitter / linkedin / youtube
    setEnv('TWITTER_CLIENT_SECRET', 'tw-webhook-secret');
    const bogusTwitter = await POST(
      makeReq('http://localhost:3000/api/social/webhooks/twitter', {
        method: 'POST',
        body: { tweet_create_events: [] },
        headers: { 'x-twitter-webhooks-signature': 'anything-non-empty' },
      }),
      { params: Promise.resolve({ platform: 'twitter' }) },
    );
    expect(bogusTwitter.status).toBe(401);

    // Valid Twitter sha256=<base64> passes
    const twRaw = JSON.stringify({ tweet_create_events: [{ id: 't1', user_screen_name: 'alo', text: 'hi' }] });
    const twSig = 'sha256=' + crypto.createHmac('sha256', 'tw-webhook-secret').update(twRaw).digest('base64');
    const validTwitter = await POST(
      makeReq('http://localhost:3000/api/social/webhooks/twitter', {
        method: 'POST',
        rawBody: twRaw,
        headers: { 'content-type': 'application/json', 'x-twitter-webhooks-signature': twSig },
      }),
      { params: Promise.resolve({ platform: 'twitter' }) },
    );
    expect(validTwitter.status).toBe(200);

    // Valid LinkedIn sha256 hex passes, invalid fails
    setEnv('LINKEDIN_CLIENT_SECRET', 'li-webhook-secret');
    const liRaw = JSON.stringify({ eventHook: { event: 'share', eventId: 'e1', status: 'ok' } });
    const liBad = await POST(
      makeReq('http://localhost:3000/api/social/webhooks/linkedin', {
        method: 'POST',
        rawBody: liRaw,
        headers: { 'content-type': 'application/json', 'x-li-signature': 'deadbeef' },
      }),
      { params: Promise.resolve({ platform: 'linkedin' }) },
    );
    expect(liBad.status).toBe(401);

    const liSig = crypto.createHmac('sha256', 'li-webhook-secret').update(liRaw).digest('hex');
    const liOk = await POST(
      makeReq('http://localhost:3000/api/social/webhooks/linkedin', {
        method: 'POST',
        rawBody: liRaw,
        headers: { 'content-type': 'application/json', 'x-li-signature': liSig },
      }),
      { params: Promise.resolve({ platform: 'linkedin' }) },
    );
    expect(liOk.status).toBe(200);

    // Telegram header check: raw bot token over the wire or bogus secret header rejected; valid X-Telegram-Bot-Api-Secret-Token accepted
    setEnv('TELEGRAM_WEBHOOK_SECRET', 'tg-header-secret');
    const tgRaw = JSON.stringify({ update_id: 99, message: { text: 'hello' } });
    const tgBad = await POST(
      makeReq('http://localhost:3000/api/social/webhooks/telegram', {
        method: 'POST',
        rawBody: tgRaw,
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong' },
      }),
      { params: Promise.resolve({ platform: 'telegram' }) },
    );
    expect(tgBad.status).toBe(401);

    const tgOk = await POST(
      makeReq('http://localhost:3000/api/social/webhooks/telegram', {
        method: 'POST',
        rawBody: tgRaw,
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'tg-header-secret' },
      }),
      { params: Promise.resolve({ platform: 'telegram' }) },
    );
    expect(tgOk.status).toBe(200);
  });

  it('rejects private/metadata/non-https mediaUrls in POST /api/social/publish', async () => {
    const { POST } = await import('@/app/api/social/publish/route');
    const badRes = await POST(
      makeReq('http://localhost:3000/api/social/publish', {
        method: 'POST',
        token: tokenA,
        body: {
          platforms: ['twitter'],
          content: 'test post',
          mediaUrls: ['http://169.254.169.254/latest/meta-data/'],
        },
      }),
    );
    expect(badRes.status).toBe(400);
  });
});

describe('Phase 5: Gateway & tenant-gateway hardening', () => {
  it('rejects partial HMAC headers, malformed hex signatures, and mismatched company header cleanly without 500', async () => {
    const { validateGatewayRequest } = await import('@/lib/api-gateway');

    const partial = await validateGatewayRequest({
      headers: {
        authorization: `Bearer ${apiKeyA}`,
        'x-alo-signature': 'deadbeef',
      },
      method: 'POST',
      url: '/api/test',
    });
    expect(partial.authenticated).toBe(false);
    expect(partial.errorCode).toBe(401);

    const malformedHex = await validateGatewayRequest({
      headers: {
        authorization: `Bearer ${apiKeyA}`,
        'x-alo-timestamp': String(Date.now()),
        'x-alo-signature': 'not-even-64-hex-chars',
      },
      method: 'POST',
      url: '/api/test',
      body: { ping: true },
    });
    expect(malformedHex.authenticated).toBe(false);
    expect(malformedHex.errorCode).toBe(401);

    const wrongCompany = await validateGatewayRequest({
      headers: {
        authorization: `Bearer ${apiKeyA}`,
        'x-alo-company-id': B.companyId,
      },
      method: 'POST',
      url: '/api/test',
    });
    expect(wrongCompany.authenticated).toBe(false);
    expect(wrongCompany.errorCode).toBe(403);
  });

  it('blocks cross-tenant API key oracle in /api/gateway/verify and /api/tenant-gateway', async () => {
    const verifyRoute = await import('@/app/api/gateway/verify/route');
    const tenantGw = await import('@/app/api/tenant-gateway/route');

    const crossVerify = await verifyRoute.POST(
      makeReq('http://localhost:3000/api/gateway/verify', {
        method: 'POST',
        token: tokenB,
        body: {
          headers: { authorization: `Bearer ${apiKeyA}` },
          method: 'POST',
          url: '/api/test',
        },
      }),
    );
    expect(crossVerify.status).toBe(403);

    const crossValidate = await tenantGw.POST(
      makeReq('http://localhost:3000/api/tenant-gateway', {
        method: 'POST',
        token: tokenB,
        body: { action: 'validate', apiKey: apiKeyA },
      }),
    );
    expect(crossValidate.status).toBe(403);

    // IP-locked key must reject requests when client IP is missing (no empty-IP bypass)
    const emptyIp = await tenantGw.POST(
      makeReq('http://localhost:3000/api/tenant-gateway', {
        method: 'POST',
        token: tokenA,
        body: {
          action: 'execute',
          apiKey: apiKeyAIpLocked,
          input: { hello: 'world' },
        },
      }),
    );
    expect(emptyIp.status).toBe(403);
  });
});
