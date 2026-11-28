/**
 * Lark Suite / Open Platform MCP & SDK connector — larksuite/lark-openapi-mcp (MIT).
 *
 * Uses official tenant-access-token endpoint on open.larksuite.com (or self-configured
 * OpenAPI MCP bridge) without inventing credentials.
 */
import {
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  requireApiKey,
  runConnectorOp,
} from '../../types';

export const larksuiteAdapter: ExternalSystemAdapter = {
  id: 'messaging.larksuite',
  category: 'messaging',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'Lark Suite Open Platform & MCP (MIT SDK) — Messenger, Docs, Base & Calendar API bridge',
  upstreamRepo: 'larksuite/lark-openapi-mcp',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const appSecret = requireApiKey(ctx, 'messaging.larksuite');
      const appId = ctx.credential.extras?.appId;
      if (!appId) {
        throw new IntegrationError('messaging.larksuite', 'missing extras.appId for Lark Open Platform');
      }
      const res = await guardedFetch(
        'messaging.larksuite',
        joinUrl(ctx.credential.baseUrl, 'open-apis/auth/v3/tenant_access_token/internal'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
          timeoutMs: ctx.timeoutMs ?? 10_000,
        },
      );
      if (!res.ok) throw new IntegrationError('messaging.larksuite', 'Lark Open Platform auth failed', res.status);
      const data = (await res.json()) as { code?: number; msg?: string };
      return { reachable: data.code === 0, code: data.code ?? null, msg: data.msg ?? 'ok' };
    });
  },
};
