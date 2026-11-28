// @vitest-environment node
/**
 * Phase 6 integration security suite (real SQLite via createRealDb):
 *   - SSRF validator (IPv4/IPv6/IPv4-mapped/octal/hex/decimal/credentials/metadata)
 *   - db/migrate super_admin-only + customMigrations blocked
 *   - db/restore super_admin-only + strict .sql filename sanitization (local + s3)
 *   - api-keys / webhooks / webhooks/deliveries block admin ?company=<slug> bypass & webhook SSRF URLs
 *   - users/invite tenant isolation + token omission on GET + invitee email binding on accept
 *   - infra/* & deploy restricted to super_admin; storage folder & minio key traversal blocked
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

const headerStorage = new AsyncLocalStorage<Headers>();

vi.mock('next/headers', () => ({
  headers: async () => headerStorage.getStore() ?? new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));

let real: RealDb;
let tokenAdminA: string;
let tokenAdminB: string;
let tokenSuper: string;

const A = { companyId: 'co-p6-a', userId: 'u-p6-a', slug: 'p6-alpha' };
const B = { companyId: 'co-p6-b', userId: 'u-p6-b', slug: 'p6-beta' };
const SUPER = { userId: 'u-p6-super' };

function makeReq(
  url: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  const headers = new Headers(options.headers);
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function runWithReq<T>(req: NextRequest, fn: (r: NextRequest) => Promise<T>): Promise<T> {
  return headerStorage.run(req.headers, () => fn(req));
}

beforeAll(async () => {
  real = await createRealDb('phase6-ops-ssrf-tenant');
  const { db } = real;

  await db.company.create({ data: { id: A.companyId, name: 'Phase6 Alpha', slug: A.slug, accountType: 'internal', status: 'active' } });
  await db.company.create({ data: { id: B.companyId, name: 'Phase6 Beta', slug: B.slug, accountType: 'internal', status: 'active' } });

  await db.user.create({ data: { id: A.userId, email: 'p6a@test.local', name: 'P6 Alpha Admin', passwordHash: 'x', role: 'admin', isActive: true } });
  await db.user.create({ data: { id: B.userId, email: 'p6b@test.local', name: 'P6 Beta Admin', passwordHash: 'x', role: 'admin', isActive: true } });
  await db.user.create({ data: { id: SUPER.userId, email: 'p6super@test.local', name: 'P6 Super', passwordHash: 'x', role: 'super_admin', isActive: true } });

  await db.companyUser.create({ data: { userId: A.userId, companyId: A.companyId, role: 'owner' } });
  await db.companyUser.create({ data: { userId: B.userId, companyId: B.companyId, role: 'owner' } });

  const { createSessionToken } = await import('@/lib/auth');
  tokenAdminA = await createSessionToken(A.userId);
  tokenAdminB = await createSessionToken(B.userId);
  tokenSuper = await createSessionToken(SUPER.userId);
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

describe('Phase 6: SSRF guard, webhooks & automation', () => {
  it('blocks private, metadata, IPv6-mapped, octal, hex, integer, and credential URLs', async () => {
    const { validateExternalUrlSyntax } = await import('@/lib/security/ssrf');
    const badUrls = [
      'http://169.254.169.254/latest/meta-data/',
      'https://127.0.0.1:8080/admin',
      'https://[::1]/status',
      'https://[::ffff:127.0.0.1]/admin',
      'https://[::ffff:7f00:1]/admin',
      'https://[fc00::1]/internal',
      'https://[fe80::1]/link',
      'https://10.0.0.5/secret',
      'https://172.16.5.4/secret',
      'https://192.168.1.1/router',
      'https://0x7f000001/hex',
      'https://2130706433/int',
      'https://0177.0.0.1/octal',
      'https://user:pass@hooks.example.com/hook',
      'https://metadata.google.internal/computeMetadata/v1/',
      'file:///etc/passwd',
    ];
    for (const url of badUrls) {
      expect(() => validateExternalUrlSyntax(url, { allowHttp: true })).toThrow();
    }

    expect(() =>
      validateExternalUrlSyntax('https://hooks.example.com/webhook', { allowHttp: false }),
    ).not.toThrow();
  });

  it('prevents admin ?company=<slug> cross-tenant read on api-keys, webhooks, deliveries, and rejects webhook SSRF URLs', async () => {
    const apiKeysRoute = await import('@/app/api/api-keys/route');
    const webhooksRoute = await import('@/app/api/webhooks/route');
    const deliveriesRoute = await import('@/app/api/webhooks/deliveries/route');
    const webhookIdRoute = await import('@/app/api/webhooks/[id]/route');

    await real.db.companyApiKey.create({
      data: {
        companyId: A.companyId,
        name: 'Alpha Secret Key',
        keyHash: 'hash-p6-' + Date.now(),
        keyPrefix: 'alo_p6_alpha',
        keySuffix: '9999',
        scopes: '["read"]',
      },
    });

    const hookA = await real.db.webhookConfig.create({
      data: {
        companyId: A.companyId,
        name: 'Alpha Hook',
        url: 'https://hooks.example.com/alpha',
        events: '["run.completed"]',
        secret: 'sec-alpha',
      },
    });

    await real.db.webhookDeliveryLog.create({
      data: {
        companyId: A.companyId,
        webhookId: hookA.id,
        eventType: 'run.completed',
        eventId: 'evt-p6-1',
        targetUrl: 'https://hooks.example.com/alpha',
        payload: '{}',
        signature: 'sig-p6-1',
        status: 'delivered',
      },
    });

    // Admin in Company B trying ?company=p6-alpha gets ONLY their own (empty) data, NEVER Company A's
    const keysB = await runWithReq(
      makeReq(`http://localhost:3000/api/api-keys?company=${A.slug}`, { token: tokenAdminB }),
      apiKeysRoute.GET,
    );
    expect(keysB.status).toBe(200);
    expect(((await keysB.json()) as { data: unknown[] }).data).toHaveLength(0);

    const hooksB = await runWithReq(
      makeReq(`http://localhost:3000/api/webhooks?company=${A.slug}`, { token: tokenAdminB }),
      webhooksRoute.GET,
    );
    expect(hooksB.status).toBe(200);
    expect(((await hooksB.json()) as { data: unknown[] }).data).toHaveLength(0);

    const delivB = await runWithReq(
      makeReq(`http://localhost:3000/api/webhooks/deliveries?company=${A.slug}`, { token: tokenAdminB }),
      deliveriesRoute.GET,
    );
    expect(delivB.status).toBe(200);
    const delivJson = (await delivB.json()) as { data: unknown[] };
    expect(delivJson.data).toHaveLength(0);

    // Webhook POST & PATCH reject internal/SSRF URLs
    const badHook = await runWithReq(
      makeReq('http://localhost:3000/api/webhooks', {
        method: 'POST',
        token: tokenAdminA,
        body: { name: 'SSRF Hook', url: 'http://169.254.169.254/latest/meta-data/', events: ['run.completed'] },
      }),
      webhooksRoute.POST,
    );
    expect(badHook.status).toBe(400);

    const badPatch = await runWithReq(
      makeReq(`http://localhost:3000/api/webhooks/${hookA.id}`, {
        method: 'PATCH',
        token: tokenAdminA,
        body: { url: 'https://[::ffff:127.0.0.1]/admin' },
      }),
      (r) => webhookIdRoute.PATCH(r, { params: Promise.resolve({ id: hookA.id }) }),
    );
    expect(badPatch.status).toBe(400);
  });

  it('blocks IPv4-mapped SSRF inside POST /api/automation/execute', async () => {
    const trigger = await real.db.automationTrigger.create({
      data: {
        companyId: A.companyId,
        name: 'SSRF Probe Trigger',
        type: 'manual',
        config: '{}',
        enabled: true,
      },
    });
    await real.db.automationAction.create({
      data: {
        triggerId: trigger.id,
        name: 'Evil Metadata Call',
        type: 'http_call',
        config: JSON.stringify({ url: 'https://[::ffff:169.254.169.254]/latest/meta-data/' }),
      },
    });

    const { POST } = await import('@/app/api/automation/execute/route');
    const res = await POST(
      makeReq('http://localhost:3000/api/automation/execute', {
        method: 'POST',
        token: tokenAdminA,
        body: { triggerId: trigger.id },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { status: string; actionResults: Array<{ status: string; result: { message?: string } }> };
    };
    expect(json.data.status).toBe('failed');
    expect(json.data.actionResults[0]?.result?.message).toMatch(/private|loopback|reserved|internal/i);
  });
});

describe('Phase 6: db/migrate, db/restore, infra/*, deploy & storage', () => {
  it('restricts db/migrate to super_admin and blocks customMigrations SQL from HTTP body', async () => {
    const { POST } = await import('@/app/api/db/migrate/route');

    const adminDenied = await runWithReq(
      makeReq('http://localhost:3000/api/db/migrate', {
        method: 'POST',
        token: tokenAdminA,
        body: { adapterName: 'primary' },
      }),
      POST,
    );
    expect(adminDenied.status).toBe(403);

    const customBlocked = await runWithReq(
      makeReq('http://localhost:3000/api/db/migrate', {
        method: 'POST',
        token: tokenSuper,
        body: {
          migrations: [{ version: '999', name: 'pwn', up: 'DROP TABLE User;', down: '' }],
        },
      }),
      POST,
    );
    expect(customBlocked.status).toBe(403);
  });

  it('rejects path traversal on db/restore (local & s3) while validating safe .sql names', async () => {
    const { POST } = await import('@/app/api/db/restore/route');

    const adminDenied = await runWithReq(
      makeReq('http://localhost:3000/api/db/restore', {
        method: 'POST',
        token: tokenAdminA,
        body: { filename: 'backup-2026.sql', verifyOnly: true },
      }),
      POST,
    );
    expect(adminDenied.status).toBe(403);

    for (const badName of ['../etc/passwd', '../../secret.sql', '/tmp/evil.sql', 'backup.txt', 'a/b.sql']) {
      for (const storage of ['local', 's3'] as const) {
        const res = await runWithReq(
          makeReq('http://localhost:3000/api/db/restore', {
            method: 'POST',
            token: tokenSuper,
            body: { filename: badName, storage, verifyOnly: true },
          }),
          POST,
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { details?: string };
        expect(body.details).toBe('Invalid filename');
      }
    }

    // Valid .sql filename reaches file stat rather than failing the old dot-stripping bug
    const validName = await runWithReq(
      makeReq('http://localhost:3000/api/db/restore', {
        method: 'POST',
        token: tokenSuper,
        body: { filename: 'backup-2026-01-01.sql', storage: 'local', verifyOnly: true },
      }),
      POST,
    );
    expect(validName.status).toBe(400);
    const validBody = (await validName.json()) as { details?: string };
    expect(validBody.details).toMatch(/File read failed/);
  });

  it('restricts infra/* and deploy to super_admin and blocks storage folder traversal', async () => {
    const connectRoute = await import('@/app/api/infra/connect/route');
    const minioRoute = await import('@/app/api/infra/minio/objects/route');
    const redisRoute = await import('@/app/api/infra/redis/keys/route');
    const pingRoute = await import('@/app/api/infra/ping/route');
    const statusRoute = await import('@/app/api/infra/status/route');
    const deployRoute = await import('@/app/api/deploy/route');
    const storageRoute = await import('@/app/api/storage/files/route');

    const cRes = await runWithReq(
      makeReq('http://localhost:3000/api/infra/connect', { method: 'POST', token: tokenAdminA, body: { type: 'redis' } }),
      connectRoute.POST,
    );
    expect(cRes.status).toBe(403);

    const mRes = await runWithReq(
      makeReq('http://localhost:3000/api/infra/minio/objects', { token: tokenAdminA }),
      minioRoute.GET,
    );
    expect(mRes.status).toBe(403);

    const rRes = await runWithReq(
      makeReq('http://localhost:3000/api/infra/redis/keys', { token: tokenAdminA }),
      redisRoute.GET,
    );
    expect(rRes.status).toBe(403);

    const pRes = await runWithReq(
      makeReq('http://localhost:3000/api/infra/ping', { method: 'POST', token: tokenAdminA }),
      pingRoute.POST,
    );
    expect(pRes.status).toBe(403);

    const sRes = await runWithReq(
      makeReq('http://localhost:3000/api/infra/status', { token: tokenAdminA }),
      statusRoute.GET,
    );
    expect(sRes.status).toBe(403);

    const dRes = await runWithReq(
      makeReq('http://localhost:3000/api/deploy', { token: tokenAdminA }),
      deployRoute.GET,
    );
    expect(dRes.status).toBe(403);

    const badFolder = await runWithReq(
      makeReq('http://localhost:3000/api/storage/files?folder=../../etc', { token: tokenAdminA }),
      storageRoute.GET,
    );
    expect(badFolder.status).toBe(400);
  });
});

describe('Phase 6: users/invite tenant isolation & token redaction', () => {
  it('isolates invitations per company, omits raw tokens on GET, and binds accept to invited email', async () => {
    const inviteRoute = await import('@/app/api/users/invite/route');

    // Tenant A cannot invite into Tenant B
    const crossPost = await runWithReq(
      makeReq('http://localhost:3000/api/users/invite', {
        method: 'POST',
        token: tokenAdminA,
        body: { email: 'newuser@test.local', role: 'operator', companyId: B.companyId },
      }),
      inviteRoute.POST,
    );
    expect(crossPost.status).toBe(403);

    // Tenant A invites someone into Tenant A
    const okPost = await runWithReq(
      makeReq('http://localhost:3000/api/users/invite', {
        method: 'POST',
        token: tokenAdminA,
        body: { email: 'invitee@test.local', role: 'operator' },
      }),
      inviteRoute.POST,
    );
    expect(okPost.status).toBe(201);
    const created = (await okPost.json()) as { token: string; companyId: string };
    expect(created.companyId).toBe(A.companyId);

    // Tenant B GET sees 0 invitations (cannot harvest Tenant A's tokens)
    const listB = await runWithReq(
      makeReq('http://localhost:3000/api/users/invite', { token: tokenAdminB }),
      inviteRoute.GET,
    );
    expect(listB.status).toBe(200);
    expect(((await listB.json()) as { data: unknown[] }).data).toHaveLength(0);

    // Even Tenant A GET only gets tokenPreview, never raw token
    const listA = await runWithReq(
      makeReq('http://localhost:3000/api/users/invite', { token: tokenAdminA }),
      inviteRoute.GET,
    );
    expect(listA.status).toBe(200);
    const rowsA = ((await listA.json()) as { data: Array<Record<string, unknown>> }).data;
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].token).toBeUndefined();
    expect(rowsA[0].tokenPreview).toBe(`${created.token.slice(0, 8)}...`);

    // Tenant B cannot resend or accept Tenant A's invitation
    const crossResend = await runWithReq(
      makeReq('http://localhost:3000/api/users/invite', {
        method: 'PUT',
        token: tokenAdminB,
        body: { token: created.token, action: 'resend' },
      }),
      inviteRoute.PUT,
    );
    expect(crossResend.status).toBe(404);

    const wrongAccept = await runWithReq(
      makeReq('http://localhost:3000/api/users/invite', {
        method: 'PUT',
        token: tokenAdminB,
        body: { token: created.token, action: 'accept' },
      }),
      inviteRoute.PUT,
    );
    expect(wrongAccept.status).toBe(403);
  });
});
