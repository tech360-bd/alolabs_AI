// @vitest-environment node
/**
 * Ecosystem Control Plane End-to-End Protocol Integration Suite
 *
 * Uses a real disposable SQLite Prisma database (`createRealDb`) and real local
 * HTTP protocol servers (Ollama `/api/tags` + `/api/chat` NDJSON, MCP JSON-RPC
 * `initialize`/`tools/list`/`tools/call`, LiveKit Twirp `RoomService`) plus real
 * disposable `/tmp` git repositories — zero mocked Prisma, zero fake 200s.
 *
 * Note: External cloud LLM/SFU/SaaS endpoints remain out of sandbox network
 * scope; these tests verify the full in-process HTTP/DB/Git protocol paths
 * against local loopback test servers.
 */
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createRealDb, type RealDb } from '../helpers/real-db';
import { useRealFetch } from '../helpers/real-fetch';

let real: RealDb;
let restoreFetch: () => void = () => undefined;

let ollamaServer: http.Server;
let mcpServer: http.Server;
let livekitServer: http.Server;

let ollamaBaseUrl = '';
let mcpUrl = '';
let livekitUrl = '';

let companyId = '';
let userId = '';
let apiKey = '';
let sessionToken = '';

const livekitRooms = new Map<string, { name: string; sid: string; empty_timeout: number }>();

async function startServer(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, port };
}

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-ecosystem-e2e-0123456789abcdef';
  process.env.JWT_SECRET = 'test-jwt-secret-ecosystem-e2e-0123456789abcdef';
  process.env.FREE_ONLY_MODE = 'true';
  process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS = 'true';
  process.env.AI_PROVIDER_SYNC_MS = '0';

  restoreFetch = useRealFetch();
  real = await createRealDb('alo-ecosystem-e2e');

  // 1. Real Ollama loopback protocol server (/api/tags + /api/chat JSON & NDJSON streaming)
  const ollama = await startServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [
              {
                name: 'qwen2.5-coder:7b',
                size: 5_000_000_000,
                digest: 'sha256:test',
                modified_at: new Date().toISOString(),
                details: { parent_model: '', format: 'gguf', family: 'qwen', families: ['qwen'], parameter_size: '7B', quantization_level: 'Q4_K_M' },
              },
            ],
          }),
        );
        return;
      }

      if (req.url === '/api/chat' && req.method === 'POST') {
        const body = JSON.parse(raw || '{}') as { model?: string; messages?: Array<{ role: string; content: string }>; stream?: boolean };
        const model = body.model || 'qwen2.5-coder:7b';
        const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '';

        if (body.stream) {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          res.write(JSON.stringify({ model, message: { role: 'assistant', content: 'Streamed-' }, done: false }) + '\n');
          res.write(
            JSON.stringify({
              model,
              message: { role: 'assistant', content: `Ack:${lastUser.slice(0, 24)}` },
              done: true,
              prompt_eval_count: 14,
              eval_count: 8,
            }) + '\n',
          );
          res.end();
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            model,
            message: { role: 'assistant', content: `InferenceOK:${lastUser.slice(0, 40)}` },
            done: true,
            prompt_eval_count: 18,
            eval_count: 9,
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });
  });
  ollamaServer = ollama.server;
  ollamaBaseUrl = `http://127.0.0.1:${ollama.port}`;

  // 2. Real MCP JSON-RPC 2.0 loopback server (initialize + paginated tools/list + tools/call)
  const mcp = await startServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const rpc = JSON.parse(raw || '{}') as { id?: string; method?: string; params?: { name?: string; arguments?: Record<string, unknown>; cursor?: string } };
      res.setHeader('mcp-session-id', 'mcp-sess-loopback-1');

      if (rpc.method === 'initialize') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-03-26', serverInfo: { name: 'alo-test-mcp', version: '1.0.0' } } }));
        return;
      }
      if (rpc.method === 'notifications/initialized') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (rpc.method === 'tools/list') {
        const cursor = rpc.params?.cursor;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (!cursor) {
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: rpc.id,
              result: {
                tools: [{ name: 'repo.read_file', description: 'Read file' }],
                nextCursor: 'page-2',
              },
            }),
          );
        } else {
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: rpc.id,
              result: {
                tools: [{ name: 'repo.apply_patch', description: 'Apply patch' }],
              },
            }),
          );
        }
        return;
      }
      if (rpc.method === 'tools/call') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: rpc.id,
            result: {
              content: [{ type: 'text', text: `Executed ${rpc.params?.name} with ${JSON.stringify(rpc.params?.arguments ?? {})}` }],
            },
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  mcpServer = mcp.server;
  mcpUrl = `http://127.0.0.1:${mcp.port}`;

  // 3. Real LiveKit Twirp loopback server (CreateRoom + ListRooms + DeleteRoom)
  const lk = await startServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!req.headers.authorization?.startsWith('Bearer ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ msg: 'missing auth' }));
        return;
      }
      const body = JSON.parse(raw || '{}') as { name?: string; empty_timeout?: number; names?: string[]; room?: string };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url?.endsWith('/CreateRoom')) {
        const room = { name: body.name || 'room', sid: `RM_${Date.now()}`, empty_timeout: body.empty_timeout || 300 };
        livekitRooms.set(room.name, room);
        res.end(JSON.stringify(room));
        return;
      }
      if (req.url?.endsWith('/ListRooms')) {
        const list = body.names?.length
          ? body.names.map((n) => livekitRooms.get(n)).filter(Boolean)
          : Array.from(livekitRooms.values());
        res.end(JSON.stringify({ rooms: list }));
        return;
      }
      if (req.url?.endsWith('/DeleteRoom')) {
        if (body.room) livekitRooms.delete(body.room);
        res.end(JSON.stringify({}));
        return;
      }
      res.end(JSON.stringify({}));
    });
  });
  livekitServer = lk.server;
  livekitUrl = `http://127.0.0.1:${lk.port}`;

  // 4. Seed tenant, super_admin user, session token, platform workspace API key, and Ollama AIProviderConfig
  const { createSessionToken, hashPassword } = await import('@/lib/auth');
  const { mintApiKey } = await import('@/lib/platform/principal');
  const { ensureRouterSynced } = await import('@/lib/ai-router');

  const company = await real.db.company.create({
    data: { name: 'Ecosystem E2E Org', slug: 'ecosystem-e2e-org', status: 'active', accountType: 'internal' },
  });
  companyId = company.id;

  const pw = await hashPassword('e2e-super-password-123!');
  const user = await real.db.user.create({
    data: { email: 'eco-e2e@test.local', name: 'Eco E2E Admin', passwordHash: pw, role: 'super_admin', isActive: true },
  });
  userId = user.id;
  await real.db.companyUser.create({ data: { userId, companyId, role: 'owner' } });
  sessionToken = await createSessionToken(userId);

  const ws = await real.db.aiWorkspace.create({
    data: { name: 'E2E Gateway WS', slug: 'e2e-gateway-ws', ownerId: userId, companyId, status: 'active' },
  });
  const minted = mintApiKey();
  apiKey = minted.plaintext;
  await real.db.aiApiKey.create({
    data: {
      workspaceId: ws.id,
      name: 'E2E Gateway Key',
      keyHash: minted.keyHash,
      keyPrefix: minted.keyPrefix,
      keySuffix: minted.keySuffix,
      scopes: JSON.stringify(['ai:chat']),
      isActive: true,
      createdBy: userId,
      rateLimit: 120,
    },
  });

  await real.db.aIProviderConfig.create({
    data: {
      companyId,
      provider: 'ollama',
      name: 'Loopback Ollama E2E',
      baseUrl: ollamaBaseUrl,
      models: JSON.stringify([{ id: 'qwen2.5-coder:7b', capabilities: ['chat', 'streaming', 'function-calling', 'code-generation', 'reasoning'] }]),
      isEnabled: true,
      isLocal: true,
      priority: 1,
      fallbackEligible: true,
    },
  });

  await ensureRouterSynced({ force: true });
});

afterAll(async () => {
  await Promise.all([
    new Promise<void>((r) => ollamaServer?.close(() => r())),
    new Promise<void>((r) => mcpServer?.close(() => r())),
    new Promise<void>((r) => livekitServer?.close(() => r())),
  ]);
  restoreFetch();
  await real.cleanup();
});

describe('Part B–D: All 4 Multi-Protocol Gateways through AIGateway & executeCompanyAIChat -> Ollama', () => {
  it('routes Anthropic, OpenAI Chat (incl. streaming), OpenAI Responses (and 501 guard), and Gemini through unified gateway with persisted usage & audit', async () => {
    const anthropic = await import('@/app/api/v1/gateway/anthropic/v1/messages/route');
    const openaiChat = await import('@/app/api/v1/gateway/openai/v1/chat/completions/route');
    const openaiResp = await import('@/app/api/v1/gateway/openai/v1/responses/route');
    const gemini = await import('@/app/api/v1/gateway/gemini/v1beta/models/[model]/generateContent/route');

    // 1. Anthropic Messages non-streaming
    const antRes = await anthropic.POST(
      new NextRequest('http://localhost/api/v1/gateway/anthropic/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          system: 'System check',
          messages: [{ role: 'user', content: 'AnthropicHello' }],
          max_tokens: 128,
        }),
      }),
    );
    expect(antRes.status).toBe(200);
    const antJson = await antRes.json();
    expect(antJson.type).toBe('message');
    expect(antJson.content[0].text).toContain('InferenceOK:AnthropicHello');

    // 2. OpenAI Chat real SSE streaming
    const oaiStreamRes = await openaiChat.POST(
      new NextRequest('http://localhost/api/v1/gateway/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'StreamPlease' }],
          stream: true,
        }),
      }),
    );
    expect(oaiStreamRes.status).toBe(200);
    const sseText = await oaiStreamRes.text();
    expect(sseText).toContain('Streamed-');
    expect(sseText).toContain('Ack:StreamPlease');
    expect(sseText).toContain('data: [DONE]');

    // 3. OpenAI Responses API + explicit 501 check on unsupported stateful parameter
    const respOk = await openaiResp.POST(
      new NextRequest('http://localhost/api/v1/gateway/openai/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'o3-mini', input: 'RespHello' }),
      }),
    );
    expect(respOk.status).toBe(200);
    const respJson = await respOk.json();
    expect(respJson.object).toBe('response');
    expect(respJson.output_text).toContain('InferenceOK:RespHello');

    const resp501 = await openaiResp.POST(
      new NextRequest('http://localhost/api/v1/gateway/openai/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input: 'continue', previous_response_id: 'resp_123' }),
      }),
    );
    expect(resp501.status).toBe(501);

    // 4. Gemini GenerateContent via x-goog-api-key
    const gemRes = await gemini.POST(
      new NextRequest('http://localhost/api/v1/gateway/gemini/v1beta/models/gemini-2.5-flash/generateContent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'GeminiHello' }] }],
        }),
      }),
    );
    expect(gemRes.status).toBe(200);
    const gemJson = await gemRes.json();
    expect(gemJson.candidates[0].content.parts[0].text).toContain('InferenceOK:GeminiHello');

    // Verify ModelUsageRecord + AuditEvent persisted cleanly by executeCompanyAIChat/streamCompanyAIChat
    const usageCount = await real.db.modelUsageRecord.count({ where: { companyId, status: 'success' } });
    const auditCount = await real.db.auditEvent.count({ where: { companyId, action: 'ai.model_attempt.success' } });
    expect(usageCount).toBeGreaterThanOrEqual(4);
    expect(auditCount).toBeGreaterThanOrEqual(4);
  });

  it('refuses unauthenticated requests and never falls back to paid cloud routes under FREE_ONLY_MODE', async () => {
    const anthropic = await import('@/app/api/v1/gateway/anthropic/v1/messages/route');
    const unauth = await anthropic.POST(
      new NextRequest('http://localhost/api/v1/gateway/anthropic/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      }),
    );
    expect(unauth.status).toBe(401);

    const { assessCandidate } = await import('@/lib/multi-tenant-ai/policy');
    const paidDecision = assessCandidate(
      {
        providerConfigId: 'paid-1',
        providerKind: 'openai-compatible',
        providerName: 'Paid GPT',
        routerName: 'openai-compatible:paid-1',
        companyId,
        isEnabled: true,
        isLocal: false,
        fallbackEligible: true,
        priority: 1,
        modelId: 'gpt-4o',
        capabilities: ['chat'],
        contextLength: 128_000,
        costPerMillionTokens: 5.0,
        permissionAllowed: true,
        paidPermissionAllowed: true,
      },
      {
        profile: 'free_general',
        requiredContextTokens: 500,
        allowPaid: true,
        allowVerifiedFree: true,
        externalDataAllowed: true,
        quotaFreshnessNow: new Date(),
      },
    );
    expect(paidDecision.eligible).toBe(false);
  });
});

describe('Part E–I: Asset Vault Reconciliation, Disposable Git Sandbox, MCP Execution & LiveKit Room Lifecycle', () => {
  it('reconciles all 30 supplied sources with 30 assets/licenses/reviews and immutable version pin/rollback', async () => {
    const {
      syncAssetVaultToDb,
      getPaginatedDiscoveryStats,
      pinNewIntegrationVersion,
      rollbackIntegrationVersion,
    } = await import('@/lib/ecosystem/asset-vault');

    const syncRes = await syncAssetVaultToDb(userId);
    expect(syncRes.sourcesUpserted).toBe(30);
    expect(syncRes.assetsUpserted).toBe(30);

    const stats = getPaginatedDiscoveryStats();
    expect(stats.unmatchedSources).toEqual([]);
    expect(stats.customerCopyIsolation).toBe('immutable_pinned_version_id');

    const firstInt = await real.db.integration.findFirst({ include: { versions: true } });
    expect(firstInt).not.toBeNull();
    const initialVerId = firstInt!.versions[0]!.id;
    const pinned = await pinNewIntegrationVersion({
      integrationId: firstInt!.id,
      version: '1.1.0',
      pinnedRef: 'abc123def',
      changelog: 'E2E pin',
      actorUserId: userId,
    });
    expect(pinned?.activeVersionId).not.toBe(initialVerId);
    const rolled = await rollbackIntegrationVersion({
      integrationId: firstInt!.id,
      targetVersionId: initialVerId,
      actorUserId: userId,
    });
    expect(rolled?.activeVersionId).toBe(initialVerId);
  });

  it('executes approved coding harness inside an isolated disposable /tmp git sandbox and enforces protected-branch ban', async () => {
    const {
      createSandboxedAgentSession,
      reviewAgentSession,
      executeSandboxedHarnessSession,
    } = await import('@/lib/coding-agents/harness-registry');

    await expect(
      createSandboxedAgentSession({
        harnessSlug: 'opencode',
        companyId,
        userId,
        branchName: 'main',
        promptSummary: 'Should fail on protected branch',
      }),
    ).rejects.toThrow(/Protected branch/);

    const session = await createSandboxedAgentSession({
      harnessSlug: 'opencode',
      companyId,
      userId,
      branchName: 'sandbox/e2e-verified-task',
      promptSummary: 'Verify isolated git worktree execution',
    });
    expect(session.status).toBe('awaiting_approval');

    await expect(
      executeSandboxedHarnessSession({ sessionId: session.id, companyId, actorUserId: userId }),
    ).rejects.toThrow(/must be approved/);

    await reviewAgentSession({ sessionId: session.id, companyId, approverId: userId, decision: 'approved' });
    const execResult = await executeSandboxedHarnessSession({
      sessionId: session.id,
      companyId,
      actorUserId: userId,
      targetFileName: 'verified-task.mjs',
      proposedContent: 'export const e2eOk = true;\n',
    });
    expect(execResult.session.status).toBe('completed');
    expect(execResult.execution.verificationPassed).toBe(true);
    expect(execResult.execution.diffStat).toContain('verified-task.mjs');
    expect(execResult.execution.secretsScrubbed).toBe(true);
  });

  it('performs MCP initialize, paginated tools/list, human-approval gating, tools/call, and SSRF protection', async () => {
    const testRoute = await import('@/app/api/mcp-servers/test/route');
    const callRoute = await import('@/app/api/mcp-servers/call/route');

    const u = new URL(mcpUrl);
    const mcpRow = await real.db.mcpServer.create({
      data: {
        name: 'Loopback MCP E2E',
        host: u.hostname,
        port: Number(u.port),
        protocol: 'http',
        status: 'disconnected',
      },
    });

    const testRes = await testRoute.POST(
      new NextRequest('http://localhost/api/mcp-servers/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ id: mcpRow.id }),
      }),
    );
    expect(testRes.status).toBe(200);
    const testJson = await testRes.json();
    expect(testJson.reachable).toBe(true);
    expect(testJson.toolCount).toBe(2);

    // Mutating tool rejected without human approval
    const blockedMut = await callRoute.POST(
      new NextRequest('http://localhost/api/mcp-servers/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ id: mcpRow.id, toolName: 'repo.apply_patch', arguments: { file: 'a.ts' }, approved: false }),
      }),
    );
    expect(blockedMut.status).toBe(403);

    // Read-only tool succeeds directly
    const readCall = await callRoute.POST(
      new NextRequest('http://localhost/api/mcp-servers/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ id: mcpRow.id, toolName: 'repo.read_file', arguments: { path: 'README.md' } }),
      }),
    );
    expect(readCall.status).toBe(200);
    const readJson = await readCall.json();
    expect(readJson.success).toBe(true);
    expect(JSON.stringify(readJson.result)).toContain('Executed repo.read_file');

    // SSRF check rejects IMDS metadata host when insecure flag disabled
    delete process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS;
    const ssrfRow = await real.db.mcpServer.create({
      data: { name: 'IMDS Trap', host: '169.254.169.254', port: 80, protocol: 'http', status: 'disconnected' },
    });
    const ssrfRes = await testRoute.POST(
      new NextRequest('http://localhost/api/mcp-servers/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ id: ssrfRow.id }),
      }),
    );
    expect(ssrfRes.status).toBe(400);
    process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS = 'true';
  });

  it('creates, retrieves, signs JWT for, verifies webhook SHA-256 on, and deletes real LiveKit SFU rooms (and reports unconfigured cleanly)', async () => {
    const meetings = await import('@/app/api/meetings/route');
    const { verifyLiveKitWebhook } = await import('@/lib/integrations/connectors/telephony/livekit');
    const { createHmac } = await import('node:crypto');

    // Honest unconfigured check first
    delete process.env.LIVEKIT_URL;
    const unconfRes = await meetings.POST(
      new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ title: 'Unconfigured LK', date: new Date().toISOString(), duration: 30, provider: 'livekit' }),
      }),
    );
    expect(unconfRes.status).toBe(200);
    const unconfJson = await unconfRes.json();
    expect(unconfJson.livekitStatus).toBe('unconfigured_sfu');

    // Configured LiveKit SFU verification
    process.env.LIVEKIT_URL = livekitUrl;
    process.env.LIVEKIT_API_KEY = 'lk-dev-key';
    process.env.LIVEKIT_API_SECRET = 'lk-dev-secret-32-chars-minimum-123';

    const createRes = await meetings.POST(
      new NextRequest('http://localhost/api/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ title: 'LiveKit Room Verified', date: new Date().toISOString(), duration: 30, provider: 'livekit' }),
      }),
    );
    expect(createRes.status).toBe(200);
    const createJson = await createRes.json();
    expect(createJson.livekitStatus).toBe('verified_room');
    expect(createJson.livekitRoom.name).toBe(createJson.roomName);
    expect(createJson.livekitToken.split('.').length).toBe(3);

    // Webhook verification with body SHA-256 digest
    const webhookBody = JSON.stringify({ event: 'room_started', room: { name: createJson.roomName } });
    const sha = createHash('sha256').update(webhookBody).digest('base64');
    const hdr = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const pay = Buffer.from(
      JSON.stringify({ iss: 'lk-dev-key', exp: Math.floor(Date.now() / 1000) + 60, sha256: sha }),
    ).toString('base64url');
    const sig = createHmac('sha256', process.env.LIVEKIT_API_SECRET).update(`${hdr}.${pay}`).digest('base64url');
    const wh = verifyLiveKitWebhook(webhookBody, `Bearer ${hdr}.${pay}.${sig}`, 'lk-dev-key', process.env.LIVEKIT_API_SECRET);
    expect(wh.valid).toBe(true);

    // Delete cleans up both DB & LiveKit room
    const delRes = await meetings.DELETE(
      new NextRequest(`http://localhost/api/meetings?id=${encodeURIComponent(createJson.id)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${sessionToken}` },
      }),
    );
    expect(delRes.status).toBe(200);
    expect(livekitRooms.has(createJson.roomName)).toBe(false);
  });
});
