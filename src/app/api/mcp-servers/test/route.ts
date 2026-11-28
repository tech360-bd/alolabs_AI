import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { guardedFetch, isAllowedIntegrationUrl } from '@/lib/integrations/types';
import { assertSafeExternalUrl } from '@/lib/security/ssrf';

const TestMcpSchema = z.object({
  id: z.string().min(1),
});

async function sendMcpJsonRpc(
  serverName: string,
  targetUrl: string,
  payload: Record<string, unknown>,
  sessionId?: string | null,
): Promise<{ res: Response; json: Record<string, unknown> | null; sessionId: string | null }> {
  const res = await guardedFetch(`mcp:${serverName}`, targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(payload),
    timeoutMs: 8_000,
  });
  const nextSession = res.headers.get('mcp-session-id') ?? sessionId ?? null;
  let json: Record<string, unknown> | null = null;
  if (res.ok) {
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = null;
    }
  }
  return { res, json, sessionId: nextSession };
}

/**
 * POST /api/mcp-servers/test
 *
 * Probes an MCP server behind strict SSRF + DNS-resolution validation, runs the
 * MCP protocol sequence (`initialize` -> `notifications/initialized` -> paginated
 * `tools/list`), and persists verified reachability, latencyMs, and tools.
 */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = TestMcpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const server = await db.mcpServer.findUnique({ where: { id: parsed.data.id } });
  if (!server) {
    return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
  }

  const rawScheme = server.protocol === 'ws' ? 'http' : server.protocol === 'wss' ? 'https' : server.protocol;
  const targetUrl = `${rawScheme}://${server.host}:${server.port}`;
  const allowInsecure = process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS === 'true';

  const guard = isAllowedIntegrationUrl(targetUrl, { allowInsecure });
  if (!guard.allowed) {
    await db.mcpServer.update({
      where: { id: server.id },
      data: {
        status: 'error',
        lastError: `Blocked by SSRF policy: ${guard.reason ?? 'disallowed target'}`,
        errorCount: { increment: 1 },
      },
    });
    return NextResponse.json(
      { success: false, reachable: false, error: `Blocked by SSRF policy: ${guard.reason ?? 'disallowed target'}` },
      { status: 400 },
    );
  }
  if (!allowInsecure) {
    try {
      await assertSafeExternalUrl(targetUrl, { allowHttp: false });
    } catch (ssrfErr) {
      const reason = ssrfErr instanceof Error ? ssrfErr.message : 'SSRF DNS guard rejected target';
      await db.mcpServer.update({
        where: { id: server.id },
        data: { status: 'error', lastError: reason, errorCount: { increment: 1 } },
      });
      return NextResponse.json({ success: false, reachable: false, error: reason }, { status: 400 });
    }
  }

  const startedAt = Date.now();
  try {
    // 1. Official MCP initialize handshake (falls back cleanly to tools/list for stateless endpoints)
    let sessionId: string | null = null;
    try {
      const initCall = await sendMcpJsonRpc(server.name, targetUrl, {
        jsonrpc: '2.0',
        id: 'alo-init-1',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          clientInfo: { name: 'alo-agentos-mcp-client', version: '1.0.0' },
        },
      });
      sessionId = initCall.sessionId;
      if (initCall.res.ok) {
        await sendMcpJsonRpc(
          server.name,
          targetUrl,
          { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
          sessionId,
        ).catch(() => undefined);
      }
    } catch {
      // Proceed to direct tools/list probe if stateless MCP endpoint rejects initialize
    }

    // 2. Paginated tools/list discovery (capped to 5 pages safely)
    const discoveredTools: unknown[] = [];
    let cursor: string | undefined;
    let lastResOk = false;
    let lastStatus = 502;
    for (let page = 0; page < 5; page++) {
      const listCall = await sendMcpJsonRpc(
        server.name,
        targetUrl,
        {
          jsonrpc: '2.0',
          id: `alo-list-${page + 1}`,
          method: 'tools/list',
          params: cursor ? { cursor } : {},
        },
        sessionId,
      );
      lastResOk = listCall.res.ok;
      lastStatus = listCall.res.status;
      if (!listCall.res.ok) break;
      const resultObj = listCall.json?.result as { tools?: unknown[]; nextCursor?: string } | undefined;
      if (Array.isArray(resultObj?.tools)) {
        discoveredTools.push(...resultObj.tools);
      }
      if (!resultObj?.nextCursor || resultObj.nextCursor === cursor) break;
      cursor = resultObj.nextCursor;
    }

    const latencyMs = Date.now() - startedAt;
    const updated = await db.mcpServer.update({
      where: { id: server.id },
      data: {
        status: lastResOk ? 'connected' : 'error',
        latencyMs,
        lastPingAt: new Date(),
        lastError: lastResOk ? null : `HTTP ${lastStatus}`,
        ...(discoveredTools.length > 0 ? { tools: JSON.stringify(discoveredTools) } : {}),
        ...(!lastResOk ? { errorCount: { increment: 1 } } : {}),
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'test',
        resource: 'mcp-servers',
        details: JSON.stringify({
          mcpServerId: server.id,
          reachable: lastResOk,
          latencyMs,
          toolCount: discoveredTools.length,
        }),
      },
    }).catch(() => undefined);

    return NextResponse.json({
      success: lastResOk,
      reachable: lastResOk,
      latencyMs,
      toolCount: discoveredTools.length,
      tools: discoveredTools,
      data: updated,
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : 'Probe failed';
    await db.mcpServer.update({
      where: { id: server.id },
      data: {
        status: 'error',
        latencyMs,
        lastError: message.slice(0, 500),
        errorCount: { increment: 1 },
      },
    }).catch(() => undefined);
    return NextResponse.json({
      success: false,
      reachable: false,
      latencyMs,
      error: message,
    });
  }
}
