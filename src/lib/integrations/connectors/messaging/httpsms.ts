/**
 * httpSMS connector — SMS channel via a customer-owned Android phone gateway.
 *
 * License note: NdoleStudio/httpsms is AGPL-3.0 (commonly mis-believed MIT).
 * Run an UNMODIFIED httpsms instance as a separate network service; this
 * adapter only calls its REST API. See docs/ECOSYSTEM_REVERSE_MAP.md.
 *
 * API surface used:
 *  - POST {base}/v1/messages/send   { phoneNumber, to, content }
 *  - GET  {base}/v1/messages?...    (delivery status)
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

export interface SmsSendResult {
  messageId: string;
  to: string;
  status: string;
}

async function httpsmsFetch(
  ctx: ConnectorContext,
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const apiKey = requireApiKey(ctx, 'messaging.httpsms');
  const res = await guardedFetch('messaging.httpsms', joinUrl(ctx.credential.baseUrl, path), {
    ...init,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('messaging.httpsms', `httpsms API ${init.method ?? 'GET'} ${path} failed`, res.status);
  }
  return res;
}

export const httpsmsAdapter: ExternalSystemAdapter = {
  id: 'messaging.httpsms',
  category: 'messaging',
  licenseClass: 'strong-copyleft-network',
  strategy: 'API_INTEGRATE',
  description: 'httpSMS gateway (AGPL) — SMS channel via separately hosted instance + Android phone',
  upstreamRepo: 'NdoleStudio/httpsms',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const owner = ctx.credential.extras?.['ownerPhoneNumber'];
      if (!owner) {
        throw new IntegrationError('messaging.httpsms', 'credential.extras.ownerPhoneNumber is required');
      }
      const qs = new URLSearchParams({
        phoneNumber: owner,
        limit: '1',
      });
      const res = await httpsmsFetch(ctx, `v1/messages?${qs.toString()}`, {}, 10_000);
      return { reachable: true, status: res.status };
    });
  },
};

export async function httpsmsSendSms(
  ctx: ConnectorContext,
  input: { to: string; content: string },
): Promise<Awaited<ReturnType<typeof runConnectorOp<SmsSendResult>>>> {
  return runConnectorOp(httpsmsAdapter, ctx, 'sendSms', async () => {
    const owner = ctx.credential.extras?.['ownerPhoneNumber'];
    if (!owner) {
      throw new IntegrationError('messaging.httpsms', 'credential.extras.ownerPhoneNumber is required');
    }
    if (!input.to || !input.content) {
      throw new IntegrationError('messaging.httpsms', 'to and content are required');
    }
    const res = await httpsmsFetch(ctx, 'v1/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        phoneNumber: owner,
        to: input.to,
        content: input.content,
      }),
    });
    const body: unknown = await res.json();
    const d = (body ?? {}) as Record<string, unknown>;
    return {
      messageId: String(d['id'] ?? d['uuid'] ?? ''),
      to: input.to,
      status: typeof d['status'] === 'string' ? (d['status'] as string) : 'queued',
    };
  });
}
