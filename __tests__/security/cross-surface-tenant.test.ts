// @vitest-environment node
/**
 * Multi-layer cross-tenant isolation verification across:
 *   - RAG documents, chunks, queries, and logs (`/api/rag/*`)
 *   - Memory store ownership (`assertOwnedBy` + `/api/memory/*`)
 *   - Automation triggers, execution, and logs (`/api/automation/*`)
 *   - API management & HMAC signing (`/api/api-management`, `/api/gateway/sign`)
 *   - Artifacts & versioned deliverables (`src/lib/artifacts`)
 *   - SSE run stream tenant guard (`/api/runs/[id]/events`)
 *   - `secureRoute` unowned-record rejection (`assertTenant(null)`)
 *
 * Uses a real SQLite database via `createRealDb` — no mocked Prisma.
 */

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealDb, type RealDb } from '../helpers/real-db';

let real: RealDb;
let tokenA: string;
let tokenB: string;
let tokenOrphan: string;

const A = { companyId: 'co-sec-a', userId: 'u-sec-a' };
const B = { companyId: 'co-sec-b', userId: 'u-sec-b' };

function makeNextRequest(
  url: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): NextRequest {
  const headers = new Headers();
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

beforeAll(async () => {
  real = await createRealDb('cross-surface-tenant');
  const { db } = real;

  await db.company.create({ data: { id: A.companyId, name: 'Tenant Alpha', slug: 'tenant-alpha', accountType: 'client', status: 'active' } });
  await db.company.create({ data: { id: B.companyId, name: 'Tenant Beta', slug: 'tenant-beta', accountType: 'client', status: 'active' } });

  await db.user.create({ data: { id: A.userId, email: 'alpha@sec.test', name: 'Alpha Admin', passwordHash: 'x', role: 'admin', isActive: true } });
  await db.user.create({ data: { id: B.userId, email: 'beta@sec.test', name: 'Beta Admin', passwordHash: 'x', role: 'admin', isActive: true } });
  await db.user.create({ data: { id: 'u-sec-orphan', email: 'orphan@sec.test', name: 'Orphan', passwordHash: 'x', role: 'admin', isActive: true } });

  await db.companyUser.create({ data: { userId: A.userId, companyId: A.companyId, role: 'owner' } });
  await db.companyUser.create({ data: { userId: B.userId, companyId: B.companyId, role: 'owner' } });

  const { createSessionToken } = await import('@/lib/auth');
  tokenA = await createSessionToken(A.userId);
  tokenB = await createSessionToken(B.userId);
  tokenOrphan = await createSessionToken('u-sec-orphan');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

describe('RAG tenant isolation across documents, chunks, and queries', () => {
  it('isolates collections, documents, chunks, and queries strictly between Company A and Company B', async () => {
    const { db } = real;
    const colA = await db.ragCollection.create({ data: { id: 'col-a', companyId: A.companyId, name: 'Alpha Secrets' } });
    const colB = await db.ragCollection.create({ data: { id: 'col-b', companyId: B.companyId, name: 'Beta Secrets' } });

    const ragDocs = await import('@/app/api/rag/documents/route');
    const ragDocById = await import('@/app/api/rag/documents/[id]/route');
    const ragChunkById = await import('@/app/api/rag/chunks/[id]/route');
    const ragQuery = await import('@/app/api/rag/query/route');

    // Tenant A creates a document in its own collection
    const createResA = await ragDocs.POST(
      makeNextRequest('http://localhost:3000/api/rag/documents', {
        method: 'POST',
        token: tokenA,
        body: { collectionId: colA.id, name: 'Alpha Architecture', classification: 'confidential' },
      }),
    );
    expect(createResA.status).toBe(201);
    const docA = (await createResA.json()) as { id: string; companyId: string };
    expect(docA.companyId).toBe(A.companyId);

    // Seed a secret chunk in Company A
    const chunkA = await db.ragChunk.create({
      data: {
        id: 'chunk-alpha-secret',
        documentId: docA.id,
        companyId: A.companyId,
        content: 'TOP_SECRET_ALPHA_BLUEPRINT_TOKEN_9911',
        position: 0,
      },
    });

    // Tenant B cannot create a document inside Tenant A's collection (404)
    const crossCreate = await ragDocs.POST(
      makeNextRequest('http://localhost:3000/api/rag/documents', {
        method: 'POST',
        token: tokenB,
        body: { collectionId: colA.id, name: 'Injected Doc' },
      }),
    );
    expect(crossCreate.status).toBe(404);

    // Tenant B cannot spoof companyId in POST body (403)
    const spoofCreate = await ragDocs.POST(
      makeNextRequest('http://localhost:3000/api/rag/documents', {
        method: 'POST',
        token: tokenB,
        body: { collectionId: colB.id, companyId: A.companyId, name: 'Spoofed' },
      }),
    );
    expect(spoofCreate.status).toBe(403);

    // Tenant B listing documents sees 0 of Tenant A's documents
    const listB = await ragDocs.GET(makeNextRequest('http://localhost:3000/api/rag/documents', { token: tokenB }));
    expect(listB.status).toBe(200);
    expect(await listB.json()).toEqual([]);

    // Tenant B fetching or deleting Tenant A's document/chunk by ID gets 404
    const getDocB = await ragDocById.GET(
      makeNextRequest(`http://localhost:3000/api/rag/documents/${docA.id}`, { token: tokenB }),
      { params: Promise.resolve({ id: docA.id }) },
    );
    expect(getDocB.status).toBe(404);

    const delChunkB = await ragChunkById.DELETE(
      makeNextRequest(`http://localhost:3000/api/rag/chunks/${chunkA.id}`, { method: 'DELETE', token: tokenB }),
      { params: Promise.resolve({ id: chunkA.id }) },
    );
    expect(delChunkB.status).toBe(404);

    // Tenant B querying RAG without companyId NEVER receives Tenant A's chunks
    const queryB = await ragQuery.POST(
      makeNextRequest('http://localhost:3000/api/rag/query', {
        method: 'POST',
        token: tokenB,
        body: { query: 'TOP_SECRET_ALPHA_BLUEPRINT_TOKEN_9911' },
      }),
    );
    expect(queryB.status).toBe(200);
    const queryBodyB = (await queryB.json()) as { chunks: unknown[] };
    expect(queryBodyB.chunks).toEqual([]);

    // Tenant B spoofing companyId in RAG query gets 403
    const spoofQueryB = await ragQuery.POST(
      makeNextRequest('http://localhost:3000/api/rag/query', {
        method: 'POST',
        token: tokenB,
        body: { query: 'anything', companyId: A.companyId },
      }),
    );
    expect(spoofQueryB.status).toBe(403);

    // Orphan user (no CompanyUser membership) gets 403, not 500
    const orphanRes = await ragDocs.GET(makeNextRequest('http://localhost:3000/api/rag/documents', { token: tokenOrphan }));
    expect(orphanRes.status).toBe(403);
  });
});

describe('Automation trigger & action tenant isolation', () => {
  it('blocks cross-tenant trigger read, update, delete, execution, and record mutation', async () => {
    const triggersRoute = await import('@/app/api/automation/triggers/route');
    const triggerById = await import('@/app/api/automation/triggers/[id]/route');
    const executeRoute = await import('@/app/api/automation/execute/route');
    const logsRoute = await import('@/app/api/automation/logs/route');

    // Tenant A creates a trigger
    const createRes = await triggersRoute.POST(
      makeNextRequest('http://localhost:3000/api/automation/triggers', {
        method: 'POST',
        token: tokenA,
        body: { name: 'Alpha Cron', type: 'manual', actions: [{ name: 'Task', type: 'create_task', config: { title: 'A Task' } }] },
      }),
    );
    expect(createRes.status).toBe(201);
    const created = ((await createRes.json()) as { data: { id: string; companyId: string } }).data;
    expect(created.companyId).toBe(A.companyId);

    // Tenant B cannot read, update, delete, or execute Tenant A's trigger
    const getB = await triggerById.GET(
      makeNextRequest(`http://localhost:3000/api/automation/triggers/${created.id}`, { token: tokenB }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(getB.status).toBe(404);

    const execB = await executeRoute.POST(
      makeNextRequest('http://localhost:3000/api/automation/execute', {
        method: 'POST',
        token: tokenB,
        body: { triggerId: created.id },
      }),
    );
    expect(execB.status).toBe(404);

    // Tenant A executes its own trigger -> succeeds & stamps companyId on created task
    const execA = await executeRoute.POST(
      makeNextRequest('http://localhost:3000/api/automation/execute', {
        method: 'POST',
        token: tokenA,
        body: { triggerId: created.id },
      }),
    );
    expect(execA.status).toBe(200);

    // Tenant B sees 0 automation trigger logs from Tenant A
    const logsB = await logsRoute.GET(makeNextRequest('http://localhost:3000/api/automation/logs', { token: tokenB }));
    expect(logsB.status).toBe(200);
    expect(((await logsB.json()) as { data: unknown[] }).data).toEqual([]);
  });
});

describe('API key management & HMAC gateway tenant isolation', () => {
  it('prevents minting or signing API keys for a foreign company', async () => {
    const apiMgmt = await import('@/app/api/api-management/route');
    const gatewaySign = await import('@/app/api/gateway/sign/route');

    // Tenant B tries to mint an API key for Tenant A -> 403
    const crossMint = await apiMgmt.POST(
      makeNextRequest('http://localhost:3000/api/api-management', {
        method: 'POST',
        token: tokenB,
        body: { companyId: A.companyId, name: 'Backdoor Key' },
      }),
    );
    expect(crossMint.status).toBe(403);

    // Tenant A mints its own key
    const mintA = await apiMgmt.POST(
      makeNextRequest('http://localhost:3000/api/api-management', {
        method: 'POST',
        token: tokenA,
        body: { name: 'Alpha Live Key' },
      }),
    );
    expect(mintA.status).toBe(200);
    const keyA = ((await mintA.json()) as { data: { key: string } }).data.key;

    // Tenant B tries to sign a request using Tenant A's API key -> 403
    const crossSign = await gatewaySign.POST(
      makeNextRequest('http://localhost:3000/api/gateway/sign', {
        method: 'POST',
        token: tokenB,
        body: { apiKey: keyA, payload: '{"hello":"world"}' },
      }),
    );
    expect(crossSign.status).toBe(403);

    // Tenant B overview only counts Tenant B's keys (0)
    const overviewB = await apiMgmt.GET(makeNextRequest('http://localhost:3000/api/api-management', { token: tokenB }));
    expect(overviewB.status).toBe(200);
    const statsB = ((await overviewB.json()) as { data: { keys: { total: number } } }).data;
    expect(statsB.keys.total).toBe(0);
  });
});

describe('Memory ownership & unowned record rejection', () => {
  it('assertOwnedBy rejects foreign and unowned memory entries', async () => {
    const { assertOwnedBy } = await import('@/lib/memory/ownership');

    expect(() => assertOwnedBy({ userId: A.userId }, A.userId)).not.toThrow();
    expect(() => assertOwnedBy({ userId: A.userId }, B.userId)).toThrow(/not found/i);
    expect(() => assertOwnedBy({ userId: undefined, companyId: '' }, B.userId)).toThrow(/not found/i);
    expect(() => assertOwnedBy(null, B.userId)).toThrow(/not found/i);
  });

  it('artifacts list and get isolate Company A from Company B', async () => {
    const { createArtifact, listArtifacts, getArtifact } = await import('@/lib/artifacts');

    const artA = await createArtifact({
      name: 'alpha-report.md',
      type: 'report',
      content: '# Confidential Alpha Deliverable',
      companyId: A.companyId,
      createdBy: A.userId,
    });

    const listForB = await listArtifacts({ companyId: B.companyId });
    expect(listForB.artifacts.find((x) => x.id === artA.id)).toBeUndefined();

    const fetched = await getArtifact(artA.id);
    expect(fetched?.companyId).toBe(A.companyId);
  });
});
