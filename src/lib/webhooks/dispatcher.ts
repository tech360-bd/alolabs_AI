/**
 * Outbound webhook dispatcher.
 * See module docstring in the spec (Decision 6).
 */

import { createHmac, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { checkSsrf, checkRedirectSsrf } from './ssrf-guard';
import { sanitizePublic } from '@/lib/api/public-response';

const SCHEMA_VERSION = '1.0';
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;

export interface WebhookEvent {
  eventType: string;
  companyId: string;
  payload: Record<string, unknown>;
}

export interface DispatchResult {
  delivered: boolean;
  eventId: string;
  attempts: number;
  lastError?: string;
}

function generateEventId(): string {
  return `evt_${randomUUID()}`;
}

function signPayload(secret: string | null | undefined, timestamp: number, body: string): string {
  return createHmac('sha256', secret ?? '').update(`${timestamp}.${body}`).digest('hex');
}

export async function dispatchToWebhook(
  webhookId: string,
  event: WebhookEvent,
): Promise<DispatchResult> {
  const eventId = generateEventId();
  const config = await db.webhookConfig.findUnique({
    where: { id: webhookId },
    select: { id: true, companyId: true, url: true, events: true, secret: true, isActive: true },
  });
  if (!config || !config.isActive) {
    return { delivered: false, eventId, attempts: 0, lastError: 'webhook inactive or not found' };
  }
  if (config.companyId !== event.companyId) {
    return { delivered: false, eventId, attempts: 0, lastError: 'tenant mismatch' };
  }
  let subscribedEvents: string[] = [];
  try {
    const parsed: unknown = JSON.parse(config.events || '[]');
    if (Array.isArray(parsed)) subscribedEvents = parsed.filter((e): e is string => typeof e === 'string');
  } catch {
    /* no events */
  }
  if (subscribedEvents.length > 0 && !subscribedEvents.includes(event.eventType) && !subscribedEvents.includes('*')) {
    return { delivered: false, eventId, attempts: 0, lastError: 'event type not subscribed' };
  }
  const ssrfCheck = await checkSsrf(config.url);
  if (!ssrfCheck.allowed) {
    await logDelivery(webhookId, event, eventId, config.url, 'failed', 0, `SSRF blocked: ${ssrfCheck.reason}`);
    return { delivered: false, eventId, attempts: 0, lastError: `SSRF blocked: ${ssrfCheck.reason}` };
  }
  const redactedPayload = sanitizePublic(event.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    schema_version: SCHEMA_VERSION,
    event_id: eventId,
    event_type: event.eventType,
    company_id: event.companyId,
    timestamp,
    data: redactedPayload,
  });
  const signature = signPayload(config.secret, timestamp, body);
  let attempts = 0;
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Alolabs-Event-Id': eventId,
          'X-Alolabs-Event-Type': event.eventType,
          'X-Alolabs-Signature': `sha256=${signature}`,
          'X-Alolabs-Timestamp': String(timestamp),
          'X-Alolabs-Schema-Version': SCHEMA_VERSION,
          'User-Agent': 'alolabs-webhook-dispatcher/1.0',
        },
        body,
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timeout);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location') ?? '';
        if (location) {
          const redirectCheck = await checkRedirectSsrf(location);
          if (!redirectCheck.allowed) {
            lastError = `redirect to blocked target: ${redirectCheck.reason}`;
            await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
            continue;
          }
          lastError = `redirect not followed: ${location}`;
          await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }
      }
      if (res.status >= 200 && res.status < 300) {
        await logDelivery(webhookId, event, eventId, config.url, 'delivered', attempt, undefined, signature, body);
        return { delivered: true, eventId, attempts: attempt };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'network error';
    }
    if (attempt < MAX_ATTEMPTS) {
      await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  await logDelivery(webhookId, event, eventId, config.url, 'failed', attempts, lastError, signature, body);
  return { delivered: false, eventId, attempts, lastError };
}

export async function dispatchWebhook(event: WebhookEvent): Promise<DispatchResult[]> {
  const webhooks = await db.webhookConfig.findMany({
    where: { companyId: event.companyId, isActive: true },
    select: { id: true },
  });
  if (webhooks.length === 0) return [];
  const results: DispatchResult[] = [];
  for (const w of webhooks) {
    results.push(await dispatchToWebhook(w.id, event));
  }
  return results;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logDelivery(
  webhookId: string,
  event: WebhookEvent,
  eventId: string,
  targetUrl: string,
  status: string,
  attempts: number,
  lastError?: string,
  signature?: string,
  payload?: string,
): Promise<void> {
  try {
    await db.webhookDeliveryLog.create({
      data: {
        webhookId,
        companyId: event.companyId,
        eventType: event.eventType,
        eventId,
        payload: payload ?? JSON.stringify(sanitizePublic(event.payload)),
        signature: signature ?? '',
        targetUrl,
        status,
        attempts,
        lastAttemptAt: new Date(),
        deliveredAt: status === 'delivered' ? new Date() : null,
        lastError,
      },
    });
  } catch {
    /* best-effort logging */
  }
}
