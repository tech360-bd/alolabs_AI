/**
 * Call Video Infra connector — joincalldotco/Call (MIT).
 *
 * Self-hosted open-source video meeting & room infrastructure integrated
 * into ALO Labs Meetings Hub via REST API.
 */

import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  requireApiKey,
  runConnectorOp,
} from '../../types';

export const joincallAdapter: ExternalSystemAdapter = {
  id: 'media.joincall',
  category: 'media',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'Call by joincalldotco (MIT) — self-hosted open-source video meeting rooms',
  upstreamRepo: 'joincalldotco/Call',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (ctx.credential.apiKey) headers.Authorization = `Bearer ${ctx.credential.apiKey}`;
      const res = await guardedFetch('media.joincall', joinUrl(ctx.credential.baseUrl, 'api/health'), {
        headers,
        timeoutMs: ctx.timeoutMs ?? 10_000,
      });
      if (!res.ok) throw new IntegrationError('media.joincall', 'Call server health check failed', res.status);
      return { reachable: true, status: res.status };
    });
  },
};

export async function joincallCreateMeeting(ctx: ConnectorContext, title: string) {
  return runConnectorOp(joincallAdapter, ctx, 'createMeeting', async () => {
    const apiKey = requireApiKey(ctx, 'media.joincall');
    const res = await guardedFetch('media.joincall', joinUrl(ctx.credential.baseUrl, 'api/calls'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
      timeoutMs: ctx.timeoutMs ?? 10_000,
    });
    if (!res.ok) throw new IntegrationError('media.joincall', 'Failed to create Call meeting', res.status);
    return res.json() as Promise<Record<string, unknown>>;
  });
}
