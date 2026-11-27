/**
 * AI Native Call Center connector — rasonyang/ai-native-callcenter (Apache-2.0).
 *
 * License note: Apache-2.0 (permissive). Self-hosted, API-first AI call
 * center: AI talks, code controls the call. Runs on FreeSWITCH with a SIP
 * trunk and a realtime model (OpenAI/Grok/Qwen/Doubao or any compatible
 * gateway). Humans take over without dropping the call. This adapter talks
 * REST to a separately hosted instance.
 * See docs/FREE_SYSTEMS_INTEGRATION.md.
 *
 * API surface used:
 *  - GET  {base}/healthz
 *  - GET  {base}/api/campaigns
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

async function aiccFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'telephony.ai-native-callcenter');
  const res = await guardedFetch('telephony.ai-native-callcenter', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('telephony.ai-native-callcenter', `AICC API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const aiNativeCallcenterAdapter: ExternalSystemAdapter = {
  id: 'telephony.ai-native-callcenter',
  category: 'telephony',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'AI Native Call Center (Apache-2.0) — FreeSWITCH AI call center with human takeover',
  upstreamRepo: 'rasonyang/ai-native-callcenter',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await aiccFetch(ctx, 'healthz', {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};
