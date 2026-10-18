/**
 * Persistence for email tracking events.
 *
 * Events live in AuditLog so they survive process restarts and can be queried
 * per message. This replaces the in-memory Map used by the previous tracking
 * service, where every server restart erased the data.
 */

import { db } from '@/lib/db';

export type TrackingEventType = 'open' | 'click' | 'delivered' | 'bounce' | 'complaint';

export interface TrackingEventInput {
  messageId: string;
  type: TrackingEventType;
  recipient?: string;
  ip?: string;
  userAgent?: string;
  link?: string;
}

export async function recordTrackingEvent(input: TrackingEventInput): Promise<void> {
  await db.auditLog.create({
    data: {
      action: `email_${input.type}`,
      resource: `email:message:${input.messageId}`,
      details: JSON.stringify({
        messageId: input.messageId,
        type: input.type,
        recipient: input.recipient ?? null,
        userAgent: input.userAgent ?? null,
        link: input.link ?? null,
      }),
      ...(input.ip ? { ipAddress: input.ip } : {}),
    },
  });
}

export interface TrackingStats {
  opens: number;
  uniqueOpens: number;
  clicks: number;
  delivered: number;
  bounces: number;
  complaints: number;
  firstOpenAt: string | null;
  lastOpenAt: string | null;
}

export async function getTrackingStats(messageId: string): Promise<TrackingStats> {
  const rows = await db.auditLog.findMany({
    where: {
      resource: `email:message:${messageId}`,
      action: { in: ['email_open', 'email_click', 'email_delivered', 'email_bounce', 'email_complaint'] },
    },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  });

  const opens = rows.filter((row) => row.action === 'email_open');
  const clicks = rows.filter((row) => row.action === 'email_click');
  const uniqueIps = new Set<string>();

  for (const open of opens) {
    let details: { ip?: string } = {};
    try {
      details = JSON.parse(open.details) as { ip?: string };
    } catch {
      // ignore malformed details
    }
    const identity = details.ip || open.ipAddress || open.id;
    uniqueIps.add(identity);
  }

  return {
    opens: opens.length,
    uniqueOpens: uniqueIps.size,
    clicks: clicks.length,
    delivered: rows.filter((row) => row.action === 'email_delivered').length,
    bounces: rows.filter((row) => row.action === 'email_bounce').length,
    complaints: rows.filter((row) => row.action === 'email_complaint').length,
    firstOpenAt: opens[0]?.createdAt.toISOString() ?? null,
    lastOpenAt: opens[opens.length - 1]?.createdAt.toISOString() ?? null,
  };
}
