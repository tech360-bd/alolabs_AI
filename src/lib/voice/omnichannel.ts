/**
 * Omnichannel messaging service (Module I).
 *
 * SCOPE AND HONESTY
 * -----------------
 * This module owns the PLATFORM side of messaging: one tenant-scoped thread
 * model across voice/SMS/WhatsApp/email/webchat, template rendering, AI-drafted
 * replies that REQUIRE human approval, assignment, internal notes and a unified
 * customer timeline.
 *
 * It does NOT deliver messages to carriers. Delivery belongs to the existing
 * channel adapters (`src/lib/whatsapp`, `src/lib/sms`, `src/lib/email`), which
 * report their own provider status. When a channel adapter is not configured we
 * record the message as `failed` with `provider_not_configured` — we never mark
 * an undelivered message as `sent`, because a shared inbox that lies about
 * delivery is worse than one that says "not configured".
 */

import { db } from '@/lib/db'
import { normalizeBdPhoneNumber } from './customers'

export const OMNI_CHANNELS = ['voice', 'sms', 'whatsapp', 'email', 'webchat', 'social'] as const
export type OmniChannel = (typeof OMNI_CHANNELS)[number]

export class OmnichannelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OmnichannelError'
  }
}

export function isOmniChannel(value: string): value is OmniChannel {
  return (OMNI_CHANNELS as readonly string[]).includes(value)
}

/**
 * Stable thread key. Phone-based channels normalize the address so
 * `+880 1712-345678` and `01712345678` land in the SAME thread; email is
 * lowercased. Without this, one customer looks like five conversations.
 */
export function threadKeyFor(channel: OmniChannel, address: string): string {
  if (channel === 'email') return `email:${address.trim().toLowerCase()}`
  if (channel === 'webchat' || channel === 'social') return `${channel}:${address.trim().toLowerCase()}`
  const normalized = normalizeBdPhoneNumber(address)
  return `${channel}:${normalized?.e164 ?? address.replace(/[\s\-()]/g, '')}`
}

/** Render a `{{variable}}` template; unknown variables are reported, not blanked silently. */
export function renderTemplate(body: string, variables: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = []
  const text = body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, name: string) => {
    const value = variables[name]
    if (value === undefined || value === '') {
      missing.push(name)
      return `{{${name}}}`
    }
    return value
  })
  return { text, missing }
}

/** Extract declared variables from a template body. */
export function extractTemplateVariables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))]
}

export interface MessageInput {
  companyId: string
  channel: OmniChannel
  direction: 'inbound' | 'outbound'
  contactId?: string | null
  fromAddress: string
  toAddress: string
  body: string
  status?: string
  assignedUserId?: string | null
  templateId?: string | null
  aiDrafted?: boolean
  approvedById?: string | null
  externalId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Record a message on the unified timeline.
 *
 * `aiDrafted` messages are forced to status `queued` and must be approved
 * before any sender may pick them up (`status='approved'`), because the master
 * prompt requires human approval for AI-authored customer communication.
 */
export async function recordMessage(input: MessageInput): Promise<{ id: string; threadKey: string; status: string }> {
  if (!isOmniChannel(input.channel)) throw new OmnichannelError(`unknown channel "${input.channel}"`)
  const body = input.body?.trim()
  if (!body) throw new OmnichannelError('message body is required')

  const threadKey = threadKeyFor(input.channel, input.direction === 'inbound' ? input.fromAddress : input.toAddress)

  let status = input.status ?? (input.direction === 'inbound' ? 'received' : 'queued')
  if (input.aiDrafted) {
    if (!input.approvedById) status = 'queued'
    else status = 'approved'
  }

  const message = await db.omniChannelMessage.create({
    data: {
      companyId: input.companyId,
      channel: input.channel,
      direction: input.direction,
      contactId: input.contactId ?? null,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      body,
      status,
      assignedUserId: input.assignedUserId ?? null,
      threadKey,
      templateId: input.templateId ?? null,
      aiDrafted: input.aiDrafted ?? false,
      approvedById: input.approvedById ?? null,
      externalId: input.externalId ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
    select: { id: true, threadKey: true, status: true },
  })
  return message
}

/** Group tenant messages into threads with unread counts and last message. */
export async function listThreads(params: {
  companyId: string
  channel?: OmniChannel
  assignedUserId?: string
  status?: string
  limit?: number
}) {
  const messages = await db.omniChannelMessage.findMany({
    where: {
      companyId: params.companyId,
      ...(params.channel ? { channel: params.channel } : {}),
      ...(params.assignedUserId ? { assignedUserId: params.assignedUserId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 500,
  })

  const byThread = new Map<string, {
    threadKey: string
    channel: string
    contactId: string | null
    address: string
    lastMessage: string
    lastMessageAt: Date
    count: number
    inbound: number
    outbound: number
    needsApproval: number
    assignedUserId: string | null
    failed: number
  }>()

  for (const message of messages) {
    const existing = byThread.get(message.threadKey)
    if (existing) {
      existing.count++
      if (message.direction === 'inbound') existing.inbound++
      else existing.outbound++
      if (message.aiDrafted && message.status === 'queued') existing.needsApproval++
      if (message.status === 'failed') existing.failed++
      continue
    }
    byThread.set(message.threadKey, {
      threadKey: message.threadKey,
      channel: message.channel,
      contactId: message.contactId,
      address: message.direction === 'inbound' ? message.fromAddress : message.toAddress,
      lastMessage: message.body.slice(0, 200),
      lastMessageAt: message.createdAt,
      count: 1,
      inbound: message.direction === 'inbound' ? 1 : 0,
      outbound: message.direction === 'outbound' ? 1 : 0,
      needsApproval: message.aiDrafted && message.status === 'queued' ? 1 : 0,
      assignedUserId: message.assignedUserId,
      failed: message.status === 'failed' ? 1 : 0,
    })
  }

  return [...byThread.values()].sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
}

/** Full thread history + contact context, for the agent-facing conversation view. */
export async function threadDetail(companyId: string, threadKey: string) {
  const messages = await db.omniChannelMessage.findMany({
    where: { companyId, threadKey },
    orderBy: { createdAt: 'asc' },
    take: 500,
  })
  if (messages.length === 0) throw new OmnichannelError(`thread ${threadKey} not found for this tenant`)

  const contactId = messages.find((m) => m.contactId)?.contactId ?? null
  const [contact, calls] = await Promise.all([
    contactId
      ? db.crmContact.findFirst({ where: { id: contactId, companyId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, tags: true } })
      : Promise.resolve(null),
    contactId
      ? db.callSession.findMany({
          where: { companyId, contactId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, direction: true, status: true, durationSeconds: true, createdAt: true },
        })
      : Promise.resolve([]),
  ])

  return {
    threadKey,
    channel: messages[0].channel,
    contact,
    calls,
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      status: m.status,
      aiDrafted: m.aiDrafted,
      approvedById: m.approvedById,
      assignedUserId: m.assignedUserId,
      createdAt: m.createdAt,
    })),
    needsApproval: messages.filter((m) => m.aiDrafted && m.status === 'queued').length,
  }
}

/**
 * Approve an AI-drafted outbound message. Approval is explicit, attributed and
 * only valid for an unapproved draft — an approval cannot be replayed onto a
 * different message body.
 */
export async function approveDraft(params: {
  companyId: string
  messageId: string
  approverUserId: string
  editedBody?: string
}): Promise<{ id: string; status: string; body: string }> {
  const message = await db.omniChannelMessage.findFirst({
    where: { id: params.messageId, companyId: params.companyId },
    select: { id: true, aiDrafted: true, status: true, body: true, direction: true },
  })
  if (!message) throw new OmnichannelError(`message ${params.messageId} not found for this tenant`)
  if (message.direction !== 'outbound') throw new OmnichannelError('only outbound drafts can be approved')
  if (message.status !== 'queued') throw new OmnichannelError(`message is "${message.status}" — only queued drafts can be approved`)

  const body = params.editedBody?.trim() || message.body
  if (!body) throw new OmnichannelError('approved body cannot be empty')

  const updated = await db.omniChannelMessage.update({
    where: { id: message.id },
    data: {
      status: 'approved',
      approvedById: params.approverUserId,
      body,
      metadata: JSON.stringify({ editedOnApproval: Boolean(params.editedBody) }),
    },
    select: { id: true, status: true, body: true },
  })
  return updated
}

/** Assign a thread to an agent (must be a tenant member). */
export async function assignThread(params: {
  companyId: string
  threadKey: string
  userId: string | null
}): Promise<{ updated: number }> {
  if (params.userId) {
    const membership = await db.companyUser.findFirst({
      where: { companyId: params.companyId, userId: params.userId },
      select: { id: true },
    })
    if (!membership) throw new OmnichannelError(`user ${params.userId} is not a member of this tenant`)
  }
  const result = await db.omniChannelMessage.updateMany({
    where: { companyId: params.companyId, threadKey: params.threadKey },
    data: { assignedUserId: params.userId },
  })
  if (result.count === 0) throw new OmnichannelError(`thread ${params.threadKey} not found for this tenant`)
  return { updated: result.count }
}

/**
 * Unified customer timeline: every channel plus calls in one ordered list.
 * This is what the "one customer history" requirement actually means.
 */
export async function customerTimeline(companyId: string, contactId: string) {
  const contact = await db.crmContact.findFirst({ where: { id: contactId, companyId }, select: { id: true, phone: true, email: true } })
  if (!contact) throw new OmnichannelError(`contact ${contactId} not found for this tenant`)

  const [messages, calls, appointments] = await Promise.all([
    db.omniChannelMessage.findMany({
      where: { companyId, contactId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.callSession.findMany({
      where: { companyId, contactId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, direction: true, status: true, disposition: true, durationSeconds: true, createdAt: true, language: true, simulated: true },
    }),
    db.appointment.findMany({
      where: { companyId, contactId },
      orderBy: { scheduledFor: 'desc' },
      take: 50,
      select: { id: true, title: true, scheduledFor: true, status: true },
    }),
  ])

  const timeline = [
    ...messages.map((m) => ({
      at: m.createdAt,
      type: 'message' as const,
      channel: m.channel,
      direction: m.direction,
      summary: m.body.slice(0, 160),
      refId: m.id,
      status: m.status,
    })),
    ...calls.map((c) => ({
      at: c.createdAt,
      type: 'call' as const,
      channel: 'voice',
      direction: c.direction,
      summary: `${c.direction} call — ${c.status}${c.disposition ? ` (${c.disposition})` : ''}`,
      refId: c.id,
      status: c.status,
    })),
    ...appointments.map((a) => ({
      at: a.scheduledFor,
      type: 'appointment' as const,
      channel: 'voice',
      direction: 'outbound',
      summary: `${a.title} — ${a.status}`,
      refId: a.id,
      status: a.status,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())

  return { contact, timeline, counts: { messages: messages.length, calls: calls.length, appointments: appointments.length } }
}

/** Create/replace a message template (unique per tenant+channel+name). */
export async function upsertTemplate(params: {
  companyId: string
  channel: OmniChannel
  name: string
  language?: string
  body: string
  category?: string
}): Promise<{ id: string; variables: string[] }> {
  if (!['sms', 'whatsapp', 'email'].includes(params.channel)) {
    throw new OmnichannelError('templates are supported for sms, whatsapp and email')
  }
  if (!params.body.trim()) throw new OmnichannelError('template body is required')
  const variables = extractTemplateVariables(params.body)
  const template = await db.messageTemplate.upsert({
    where: { companyId_channel_name: { companyId: params.companyId, channel: params.channel, name: params.name } },
    create: {
      companyId: params.companyId,
      channel: params.channel,
      name: params.name,
      language: params.language ?? 'bn-BD',
      body: params.body,
      variables: JSON.stringify(variables),
      category: params.category ?? 'utility',
    },
    update: {
      language: params.language ?? 'bn-BD',
      body: params.body,
      variables: JSON.stringify(variables),
      category: params.category ?? 'utility',
    },
    select: { id: true },
  })
  return { id: template.id, variables }
}
