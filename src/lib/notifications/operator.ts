/**
 * Administrator notifications.
 *
 * A run that finishes at 03:00 is only useful if somebody learns about it. This
 * module writes the notification into the existing `Notification` table — the same
 * one the dashboard bell reads — and optionally pushes it to an operator webhook.
 *
 * Four rules:
 *
 * 1. **Tenant-aware.** A notification is written for one company and, when known,
 *    one user. There is no broadcast path.
 * 2. **Deduplicated.** The same event for the same run is written once. A retrying
 *    worker must not produce ten identical alerts.
 * 3. **Linked.** The run id, approval id and any evidence pointers live in
 *    `metadata`, so the notification opens the thing it is about.
 * 4. **Delivery is visible.** A webhook that fails writes its attempt count and last
 *    error into `metadata` and leaves the row unread — a failed delivery must be
 *    observable, not silent.
 */

import { db } from '@/lib/db';
import { isUsableTenantId } from '@/lib/tenancy/policy';

export type OperatorNotificationType =
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'approval.required'
  | 'agent.unavailable'
  | 'browser.verification_failed'
  | 'build.failed'
  | 'deployment.failed'
  | 'security.issue'
  | 'config.changed'
  | 'ops.backup';

const PRIORITY: Record<OperatorNotificationType, 'info' | 'warning' | 'critical'> = {
  'run.completed': 'info',
  'run.cancelled': 'info',
  'config.changed': 'info',
  'approval.required': 'warning',
  'agent.unavailable': 'warning',
  'browser.verification_failed': 'warning',
  'run.failed': 'warning',
  'build.failed': 'critical',
  'deployment.failed': 'critical',
  'security.issue': 'critical',
  'ops.backup': 'critical',
};

export interface OperatorNotificationInput {
  /**
   * The tenant this belongs to. Empty only with `scope: 'platform'`, which writes a
   * platform-level row (companyId null) that only super administrators can read —
   * used for infrastructure such as backups, which are not a customer's data.
   */
  companyId: string;
  scope?: 'tenant' | 'platform';
  userId?: string;
  type: OperatorNotificationType;
  title: string;
  message: string;
  runId?: string;
  approvalId?: string;
  /** Stable key for "this exact thing already notified". Defaults to type+runId. */
  dedupeKey?: string;
  link?: string;
  evidence?: Record<string, unknown>;
}

export interface OperatorNotificationResult {
  id: string | null;
  created: boolean;
  reason?: string;
  delivery?: 'skipped' | 'delivered' | 'failed';
}

interface NotificationMetadata {
  dedupeKey?: string;
  runId?: string;
  approvalId?: string;
  link?: string;
  evidence?: Record<string, unknown>;
  delivery?: { attempts: number; lastError?: string; deliveredAt?: string };
}

const DEDUPE_WINDOW_MS = 24 * 3600 * 1000;

function parseMetadata(raw: string | null): NotificationMetadata {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as NotificationMetadata) : {};
  } catch {
    return {};
  }
}

/**
 * Write one notification, deduplicated, and attempt delivery.
 *
 * Returns `created: false` when an identical notification already exists inside the
 * dedupe window — callers treat that as success, not as an error.
 */
export async function notifyOperator(input: OperatorNotificationInput): Promise<OperatorNotificationResult> {
  const platform = input.scope === 'platform';
  if (!platform && !isUsableTenantId(input.companyId)) {
    // A notification with no tenant would be visible to whoever owned the row.
    return { id: null, created: false, reason: 'no tenant' };
  }

  const dedupeKey = input.dedupeKey ?? `${input.type}:${input.runId ?? input.approvalId ?? input.title}`;
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);

  const existing = await db.notification
    .findFirst({
      where: {
        companyId: platform ? null : input.companyId,
        type: input.type,
        createdAt: { gte: since },
        metadata: { contains: `"dedupeKey":"${dedupeKey}"` },
      },
      select: { id: true },
    })
    .catch(() => null);

  if (existing) return { id: existing.id, created: false, reason: 'duplicate suppressed' };

  const metadata: NotificationMetadata = {
    dedupeKey,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    ...(input.link ? { link: input.link } : {}),
    ...(input.evidence ? { evidence: input.evidence } : {}),
  };

  const notification = await db.notification.create({
    data: {
      type: input.type,
      title: input.title.slice(0, 200),
      message: input.message.slice(0, 2_000),
      priority: PRIORITY[input.type],
      ...(platform ? {} : { companyId: input.companyId }),
      ...(input.userId ? { userId: input.userId } : {}),
      metadata: JSON.stringify(metadata),
    },
    select: { id: true },
  });

  const delivery = await deliver(input, metadata, notification.id);

  return { id: notification.id, created: true, delivery };
}

/** Push to the operator webhook when one is configured; never throw. */
async function deliver(
  input: OperatorNotificationInput,
  metadata: NotificationMetadata,
  notificationId: string,
): Promise<'skipped' | 'delivered' | 'failed'> {
  const url = process.env.OPERATOR_WEBHOOK_URL;
  if (!url) return 'skipped';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: input.type,
        title: input.title,
        message: input.message,
        companyId: input.companyId,
        ...(input.runId ? { runId: input.runId } : {}),
        priority: PRIORITY[input.type],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`webhook returned ${response.status}`);
    await db.notification.update({
      where: { id: notificationId },
      data: {
        metadata: JSON.stringify({
          ...metadata,
          delivery: { attempts: 1, deliveredAt: new Date().toISOString() },
        }),
      },
    }).catch(() => undefined);
    return 'delivered';
  } catch (error) {
    // The in-app notification still exists; the failure is recorded so an operator
    // can see that the push did not go out.
    await db.notification.update({
      where: { id: notificationId },
      data: {
        metadata: JSON.stringify({
          ...metadata,
          delivery: { attempts: 1, lastError: error instanceof Error ? error.message : 'delivery failed' },
        }),
      },
    }).catch(() => undefined);
    return 'failed';
  }
}

/**
 * Retry delivery for notifications whose webhook attempt failed.
 *
 * Returns a count so a scheduled job — or an operator — can see whether anything
 * was fixed. In-app rows are never deleted: a notification that could not be pushed
 * is still a notification.
 */
export async function retryFailedDeliveries(companyId: string, limit = 20): Promise<{ retried: number; delivered: number }> {
  if (!isUsableTenantId(companyId)) return { retried: 0, delivered: 0 };
  const rows = await db.notification.findMany({
    where: { companyId, metadata: { contains: '"lastError"' } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true, type: true, title: true, message: true, metadata: true, userId: true },
  });

  let delivered = 0;
  for (const row of rows) {
    const metadata = parseMetadata(row.metadata);
    const result = await deliver(
      {
        companyId,
        type: row.type as OperatorNotificationType,
        title: row.title,
        message: row.message,
        ...(row.userId ? { userId: row.userId } : {}),
        ...(metadata.runId ? { runId: metadata.runId } : {}),
      },
      metadata,
      row.id,
    );
    if (result === 'delivered') delivered += 1;
  }
  return { retried: rows.length, delivered };
}

/** Unread operator notifications for the bell. Tenant-scoped, newest first. */
/** Platform-level notifications (backups, infrastructure) for super administrators. */
export async function listPlatformNotifications(limit = 20) {
  return db.notification.findMany({
    where: { companyId: null, type: { startsWith: 'ops.' } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true, type: true, title: true, message: true, priority: true, read: true, metadata: true, createdAt: true },
  });
}

export async function listOperatorNotifications(companyId: string, limit = 20) {
  if (!isUsableTenantId(companyId)) return [];
  return db.notification.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true, type: true, title: true, message: true, priority: true, read: true, metadata: true, createdAt: true },
  });
}
