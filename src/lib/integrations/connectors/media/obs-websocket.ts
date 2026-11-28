/**
 * OBS Studio WebSocket v5 connector — obsproject/obs-studio (GPL-2.0).
 *
 * License boundary: GPL-2.0 (COPYING). ALO Labs NEVER links or embeds OBS C/C++
 * code. OBS runs as an independent external process and is controlled solely
 * via authenticated OBS WebSocket v5 (`Identify` challenge-response auth).
 */

import { createHash } from 'node:crypto';
import {
  type ExternalSystemAdapter,
  IntegrationError,
  isAllowedIntegrationUrl,
  requireApiKey,
  runConnectorOp,
} from '../../types';

/**
 * Computes OBS WebSocket v5 `authentication` string per official spec:
 * base64(sha256(base64(sha256(password + salt)) + challenge))
 */
export function computeObsWebSocketAuth(password: string, salt: string, challenge: string): string {
  const secretHash = createHash('sha256').update(`${password}${salt}`, 'utf8').digest('base64');
  return createHash('sha256').update(`${secretHash}${challenge}`, 'utf8').digest('base64');
}

/**
 * Validates and connects to an authenticated OBS WebSocket v5 endpoint, sends
 * `Identify` using SHA-256 challenge auth, and queries `GetVersion`.
 */
export async function probeObsWebSocket(params: {
  wsUrl: string;
  password: string;
  timeoutMs?: number;
}): Promise<{ connected: boolean; obsVersion?: string; obsWebSocketVersion?: string; rpcVersion?: number }> {
  // Normalize ws(s) -> http(s) purely for SSRF host check
  const parsed = new URL(params.wsUrl);
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new IntegrationError('media.obs-websocket', 'OBS endpoint must use ws:// or wss://');
  }
  const httpEquivalent = params.wsUrl.replace(/^ws/i, 'http');
  const guard = isAllowedIntegrationUrl(httpEquivalent, {
    allowInsecure: parsed.protocol === 'wss:' || process.env.ALO_ALLOW_INSECURE_INTEGRATION_TARGETS === 'true',
  });
  if (!guard.allowed) {
    throw new IntegrationError('media.obs-websocket', `blocked OBS target: ${guard.reason}`);
  }
  if (!params.password || params.password.length < 6) {
    throw new IntegrationError('media.obs-websocket', 'OBS WebSocket requires password authentication');
  }

  // Native global WebSocket available on Node 22+
  if (typeof WebSocket === 'undefined') {
    throw new IntegrationError('media.obs-websocket', 'WebSocket client runtime unavailable');
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      reject(new IntegrationError('media.obs-websocket', 'OBS WebSocket handshake timed out'));
    }, params.timeoutMs ?? 8_000);

    const ws = new WebSocket(params.wsUrl);
    let rpcVersion = 1;

    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new IntegrationError('media.obs-websocket', 'OBS WebSocket connection error'));
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          op: number;
          d?: {
            rpcVersion?: number;
            authentication?: { challenge: string; salt: string };
            negotiatedRpcVersion?: number;
            requestStatus?: { result: boolean; code: number; comment?: string };
            responseData?: { obsVersion?: string; obsWebSocketVersion?: string };
          };
        };

        if (msg.op === 0 && msg.d) {
          rpcVersion = msg.d.rpcVersion ?? 1;
          const auth = msg.d.authentication
            ? computeObsWebSocketAuth(params.password, msg.d.authentication.salt, msg.d.authentication.challenge)
            : undefined;
          if (!auth) {
            clearTimeout(timeout);
            ws.close();
            reject(new IntegrationError('media.obs-websocket', 'OBS server has authentication disabled; refusing unauthenticated control'));
            return;
          }
          ws.send(JSON.stringify({ op: 1, d: { rpcVersion, authentication: auth, eventSubscriptions: 0 } }));
        } else if (msg.op === 2) {
          ws.send(JSON.stringify({ op: 6, d: { requestType: 'GetVersion', requestId: 'alo-probe-1' } }));
        } else if (msg.op === 7 && msg.d) {
          clearTimeout(timeout);
          ws.close();
          resolve({
            connected: Boolean(msg.d.requestStatus?.result),
            obsVersion: msg.d.responseData?.obsVersion,
            obsWebSocketVersion: msg.d.responseData?.obsWebSocketVersion,
            rpcVersion,
          });
        }
      } catch (err) {
        clearTimeout(timeout);
        ws.close();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

export const obsWebSocketAdapter: ExternalSystemAdapter = {
  id: 'media.obs-websocket',
  category: 'media',
  licenseClass: 'strong-copyleft-process',
  strategy: 'API_INTEGRATE',
  description: 'OBS Studio (GPL-2.0 external process) — authenticated OBS WebSocket v5 control',
  upstreamRepo: 'obsproject/obs-studio',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const password = requireApiKey(ctx, 'media.obs-websocket');
      return probeObsWebSocket({
        wsUrl: ctx.credential.baseUrl,
        password,
        timeoutMs: ctx.timeoutMs ?? 8_000,
      });
    });
  },
};
