/**
 * WhatsApp shared inbox.
 *
 * The webhook has always written inbound messages to AuditLog, which is fine
 * for an audit trail but cannot power a team inbox: it has no tenant, no
 * conversation identity and no reply state. Prisma already carries
 * `Conversation` / `ConversationMessage` models that were completely unused;
 * this module is the missing writer/reader for them.
 *
 * Layout:
 *   Conversation        one row per (phone number, contact)
 *   ConversationMessage the ordered messages (role: user | agent)
 *   Settings            a small index at `whatsapp:inbox:<sha256>` with the
 *                       tenant, contact, unread count and last-message preview
 *                       so the list endpoint does not scan every conversation.
 */

import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { resolveWhatsAppCompanyId } from './config';

const INDEX_PREFIX = 'whatsapp:inbox:';
export const DEFAULT_COMPANY_ID = 'default-company';

export interface InboxIndexRecord {
  conversationId: string;
  companyId: string;
  contact: string;
  contactName: string | null;
  phoneNumberId: string;
  unread: number;
  lastMessage: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface InboxMessage {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function indexKey(phoneNumberId: string, contact: string): string {
  const digest = createHash('sha256').update(`${phoneNumberId}:${contact}`).digest('hex').slice(0, 32);
  return `${INDEX_PREFIX}${digest}`;
}

async function readIndex(key: string): Promise<InboxIndexRecord | null> {
  const row = await db.settings.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as InboxIndexRecord;
  } catch {
    return null;
  }
}

async function writeIndex(key: string, record: InboxIndexRecord): Promise<void> {
  const value = JSON.stringify(record);
  await db.settings.upsert({
    where: { key },
    update: { value, type: 'json' },
    create: { id: randomUUID(), key, value, type: 'json' },
  });
}

function preview(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 240);
}

/**
 * Store an inbound message and return the conversation id.
 * Best-effort by design: the webhook wraps this in try/catch so a database
 * hiccup never causes WhatsApp to retry (and duplicate) the delivery.
 */
export async function recordInboundMessage(params: {
  phoneNumberId: string;
  contact: string;
  contactName?: string | null;
  content: string;
  messageId?: string;
  type?: string;
  mediaId?: string;
  timestamp?: string;
}): Promise<string> {
  const { phoneNumberId, contact } = params;
  const key = indexKey(phoneNumberId, contact);
  const existing = await readIndex(key);
  const companyId = existing?.companyId ?? (await resolveWhatsAppCompanyId(phoneNumberId));
  const now = params.timestamp ?? new Date().toISOString();

  let conversationId = existing?.conversationId;
  if (!conversationId) {
    const conversation = await db.conversation.create({
      data: {
        userId: `whatsapp:${phoneNumberId}`,
        companyId,
        title: params.contactName || contact,
        status: 'active',
      },
    });
    conversationId = conversation.id;
  }

  await db.conversationMessage.create({
    data: {
      conversationId,
      role: 'user',
      content: params.content,
      metadata: JSON.stringify({
        channel: 'whatsapp',
        direction: 'inbound',
        phoneNumberId,
        contact,
        contactName: params.contactName ?? null,
        messageId: params.messageId ?? null,
        type: params.type ?? 'text',
        mediaId: params.mediaId ?? null,
        timestamp: now,
      }),
    },
  });

  const record: InboxIndexRecord = {
    conversationId,
    companyId,
    contact,
    contactName: params.contactName ?? existing?.contactName ?? null,
    phoneNumberId,
    unread: (existing?.unread ?? 0) + 1,
    lastMessage: preview(params.content),
    lastMessageAt: now,
    createdAt: existing?.createdAt ?? now,
  };
  await writeIndex(key, record);
  await db.conversation
    .update({ where: { id: conversationId }, data: { updatedAt: new Date(), title: record.contactName || contact } })
    .catch(() => undefined);

  return conversationId;
}

/** Store an outbound message (human reply or auto-reply) against the same index. */
export async function recordOutboundMessage(params: {
  phoneNumberId: string;
  contact: string;
  content: string;
  autoReply?: boolean;
  messageId?: string;
}): Promise<void> {
  const key = indexKey(params.phoneNumberId, params.contact);
  const existing = await readIndex(key);
  if (!existing) {
    // Outbound-first conversation (agent initiated): create it so the message
    // is not lost, but never fabricate an inbound user message.
    const now = new Date().toISOString();
    const companyId = await resolveWhatsAppCompanyId(params.phoneNumberId);
    const conversation = await db.conversation.create({
      data: { userId: `whatsapp:${params.phoneNumberId}`, companyId, title: params.contact, status: 'active' },
    });
    await db.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'agent',
        content: params.content,
        metadata: JSON.stringify({
          channel: 'whatsapp',
          direction: 'outbound',
          autoReply: params.autoReply ?? false,
          messageId: params.messageId ?? null,
          phoneNumberId: params.phoneNumberId,
          contact: params.contact,
        }),
      },
    });
    await writeIndex(key, {
      conversationId: conversation.id,
      companyId,
      contact: params.contact,
      contactName: null,
      phoneNumberId: params.phoneNumberId,
      unread: 0,
      lastMessage: preview(params.content),
      lastMessageAt: now,
      createdAt: now,
    });
    return;
  }

  await db.conversationMessage.create({
    data: {
      conversationId: existing.conversationId,
      role: 'agent',
      content: params.content,
      metadata: JSON.stringify({
        channel: 'whatsapp',
        direction: 'outbound',
        autoReply: params.autoReply ?? false,
        messageId: params.messageId ?? null,
        phoneNumberId: params.phoneNumberId,
        contact: params.contact,
      }),
    },
  });

  await writeIndex(key, {
    ...existing,
    unread: 0,
    lastMessage: preview(params.content),
    lastMessageAt: new Date().toISOString(),
  });
  await db.conversation
    .update({ where: { id: existing.conversationId }, data: { updatedAt: new Date() } })
    .catch(() => undefined);
}

async function listIndexRecords(companyId: string, limit = 500): Promise<InboxIndexRecord[]> {
  const rows = await db.settings.findMany({
    where: { key: { startsWith: INDEX_PREFIX } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  const records: InboxIndexRecord[] = [];
  for (const row of rows) {
    try {
      const record = JSON.parse(row.value) as InboxIndexRecord;
      if (record.companyId === companyId) records.push(record);
    } catch {
      // skip malformed index rows
    }
  }
  return records;
}

export async function listConversations(options: {
  companyId: string;
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{ data: InboxIndexRecord[]; total: number; unread: number }> {
  const { companyId } = options;
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const search = (options.search ?? '').toLowerCase();

  const records = (await listIndexRecords(companyId)).filter((record) => {
    if (!search) return true;
    return (
      record.contact.toLowerCase().includes(search) ||
      (record.contactName ?? '').toLowerCase().includes(search) ||
      record.lastMessage.toLowerCase().includes(search)
    );
  });

  records.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  const start = (page - 1) * limit;

  return {
    data: records.slice(start, start + limit),
    total: records.length,
    unread: records.reduce((sum, record) => sum + (record.unread || 0), 0),
  };
}

async function findIndexByConversation(
  companyId: string,
  conversationId: string,
): Promise<InboxIndexRecord | null> {
  const records = await listIndexRecords(companyId);
  return records.find((record) => record.conversationId === conversationId) ?? null;
}

export async function getConversationMessages(options: {
  companyId: string;
  conversationId: string;
  limit?: number;
}): Promise<{ conversation: InboxIndexRecord; messages: InboxMessage[] } | null> {
  const record = await findIndexByConversation(options.companyId, options.conversationId);
  if (!record) return null;

  const rows = await db.conversationMessage.findMany({
    where: { conversationId: options.conversationId },
    orderBy: { createdAt: 'asc' },
    take: Math.min(500, Math.max(1, options.limit ?? 200)),
  });

  const messages: InboxMessage[] = rows.map((row) => {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      // ignore malformed metadata
    }
    return { id: row.id, role: row.role, content: row.content, metadata, createdAt: row.createdAt.toISOString() };
  });

  return { conversation: record, messages };
}

/** Locate the contact/phone pair for a conversation so a reply can be sent. */
export async function resolveConversationTarget(
  companyId: string,
  conversationId: string,
): Promise<InboxIndexRecord | null> {
  return findIndexByConversation(companyId, conversationId);
}

/** Mark a conversation as read without writing a message. */
export async function markConversationRead(companyId: string, conversationId: string): Promise<boolean> {
  const record = await findIndexByConversation(companyId, conversationId);
  if (!record) return false;
  if (record.unread === 0) return true;
  const key = indexKey(record.phoneNumberId, record.contact);
  await writeIndex(key, { ...record, unread: 0 });
  return true;
}
