import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { guardedFetch, isAllowedIntegrationUrl } from '@/lib/integrations/types';
import { assertSafeExternalUrl } from '@/lib/security/ssrf';
import { classifyToolRisk } from '@/lib/coding-agents/tool-optimizer';
import { writeAuditEvent } from '@/lib/audit-events';
import { checkLimit } from '@/lib/security/rate-limiter';

const CallMcpToolSchema = z.object({
  id: z.string().min(1),
  toolName: z.string().min(1).max(200),
  arguments: z.record(z.string(), z.unknown()).default({}),
  approved: z.boolean().default(false),
  approvalNote: z.string().max(300).optional(),
});

/**
 * POST /api/mcp-servers/call
 *
 * Executes a real MCP JSON-RPC `tools/call` invocation behind:
 *   1. Authenticated user identity (`requireAuth`)
 *   2. Per-user rate limiting
 *   3. SSRF + DNS resolution validation (`isAllowedIntegrationUrl` + `assertSafeExternalUrl`)
 *   4. Tool Risk classification (`classifyToolRisk` — mutating/dangerous tools require explicit `approved: true`)
 *   5. Official MCP `initialize` + `tools/call` + durable AuditLog & AuditEvent tracking
 */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const rl = await checkLimit(`mcp_call:${user.userId}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded for MCP tool calls' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CallMcpToolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, toolName, arguments: toolArgs, approved, approvalNote } = parsed.data;
  const risk = classifyToolRisk(toolName);
  if (risk.requiresApproval && !approved) {
    return NextResponse.json(
      {
        success: false,
        requiresApproval: true,
        riskTier: risk.risk,
        error: `MCP tool "${toolName}" is classified as ${risk.risk} and requires explicit human approval (approved: true).`,
      },
      { status: 403 },
    );
  }

  const server = await db.mcpServer.findUnique({ where: { id } });
  if (!server) {
    return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
  }

  const rawScheme = server.protocol === 'ws' ? 'http' : server.protocol === 'wss' ? 'https' : server.protocol;
  const targetUrl = `${rawScheme}://${server.host}:${server.port}`;
  const allowInsecure = process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS === 'true';

  const guard = isAllowedIntegrationUrl(targetUrl, { allowInsecure });
  if (!guard.allowed) {
    return NextResponse.json(
      { success: false, error: `Blocked by SSRF policy: ${guard.reason ?? 'disallowed target'}` },
      { status: 400 },
    );
  }
  if (!allowInsecure) {
    try {
      await assertSafeExternalUrl(targetUrl, { allowHttp: false });
    } catch (ssrfErr) {
      return NextResponse.json(
        { success: false, error: ssrfErr instanceof Error ? ssrfErr.message : 'Blocked by DNS SSRF guard' },
        { status: 400 },
      );
    }
  }

  const startedAt = Date.now();
  try {
    let sessionId: string | null = null;
    try {
      const initRes = await guardedFetch(`mcp:${server.name}`, targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'alo-call-init',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {} },
            clientInfo: { name: 'alo-agentos-mcp-client', version: '1.0.0' },
          },
        }),
        timeoutMs: 6_000,
      });
      sessionId = initRes.headers.get('mcp-session-id');
    } catch {
      // stateless server fallback
    }

    const callRes = await guardedFetch(`mcp:${server.name}`, targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `alo-call-${Date.now()}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArgs,
        },
      }),
      timeoutMs: 15_000,
    });

    const latencyMs = Date.now() - startedAt;
    const rawText = await callRes.text();
    let payload: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      payload = { rawText };
    }

    const rpcError = payload && typeof payload.error === 'object' ? payload.error : null;
    const ok = callRes.ok && !rpcError;

    await Promise.all([
      db.mcpServer.update({
        where: { id: server.id },
        data: {
          status: ok ? 'connected' : 'error',
          latencyMs,
          lastPingAt: new Date(),
          lastError: ok ? null : JSON.stringify(rpcError ?? `HTTP ${callRes.status}`).slice(0, 400),
          ...(!ok ? { errorCount: { increment: 1 } } : {}),
        },
      }).catch(() => undefined),
      db.auditLog.create({
        data: {
          userId: user.userId,
          action: 'mcp.tool_call',
          resource: 'mcp-servers',
          details: JSON.stringify({
            mcpServerId: server.id,
            toolName,
            riskTier: risk.risk,
            approved,
            approvalNote: approvalNote ?? null,
            ok,
            latencyMs,
          }),
        },
      }).catch(() => undefined),
      writeAuditEvent({
        companyId: user.companyId ?? 'system',
        actorUserId: user.userId,
        action: 'mcp.tool_call',
        resource: 'McpServer',
        resourceId: server.id,
        details: { toolName, riskTier: risk.risk, approved, ok, latencyMs },
      }),
    ]);

    return NextResponse.json(
      {
        success: ok,
        toolName,
        riskTier: risk.risk,
        latencyMs,
        result: payload?.result ?? null,
        error: rpcError ?? (ok ? null : `HTTP ${callRes.status}`),
      },
      { status: ok ? 200 : callRes.ok ? 400 : 502 },
    );
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        success: false,
        toolName,
        latencyMs,
        error: err instanceof Error ? err.message : 'MCP tools/call failed',
      },
      { status: 502 },
    );
  }
}
