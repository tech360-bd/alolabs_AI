/**
 * rasonyang Self-Hosted Voice Stack connectors (Apache-2.0).
 *
 * Covers the sibling services alongside `rasonyang/ai-native-callcenter`:
 *   - rasonyang/freesbc (pure-Go SBC keeping FreeSWITCH/Asterisk off public internet)
 *   - rasonyang/cascade-realtime-gateway (OpenAI Realtime WS + cascaded ASR->LLM->TTS)
 *   - rasonyang/web-sip-phone (persistent WebRTC SIP browser workspace client)
 */

import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  runConnectorOp,
} from '../../types';

export const freesbcAdapter: ExternalSystemAdapter = {
  id: 'telephony.freesbc',
  category: 'telephony',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'FreeSBC (Apache-2.0) — pure-Go SIP proxy, RTP/SRTP relay & WebRTC SBC',
  upstreamRepo: 'rasonyang/freesbc',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await guardedFetch('telephony.freesbc', joinUrl(ctx.credential.baseUrl, 'healthz'), {
        headers: ctx.credential.apiKey ? { Authorization: `Bearer ${ctx.credential.apiKey}` } : {},
        timeoutMs: ctx.timeoutMs ?? 10_000,
      });
      if (!res.ok) throw new IntegrationError('telephony.freesbc', 'FreeSBC health check failed', res.status);
      return { reachable: true, status: res.status };
    });
  },
};

export const cascadeRealtimeGatewayAdapter: ExternalSystemAdapter = {
  id: 'telephony.cascade-realtime-gateway',
  category: 'telephony',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'Cascade Realtime Gateway (Apache-2.0) — OpenAI Realtime WS speaking ASR -> LLM -> TTS',
  upstreamRepo: 'rasonyang/cascade-realtime-gateway',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const res = await guardedFetch(
        'telephony.cascade-realtime-gateway',
        joinUrl(ctx.credential.baseUrl, 'healthz'),
        {
          headers: ctx.credential.apiKey ? { Authorization: `Bearer ${ctx.credential.apiKey}` } : {},
          timeoutMs: ctx.timeoutMs ?? 10_000,
        },
      );
      if (!res.ok) {
        throw new IntegrationError('telephony.cascade-realtime-gateway', 'Cascade gateway health failed', res.status);
      }
      return { reachable: true, status: res.status };
    });
  },
};
