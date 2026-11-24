/**
 * Unified chat API — the backend for the single ChatGPT-style surface.
 *
 * Design constraints, deliberately chosen:
 *
 *  - **No new router.** Inference goes through `executeCompanyAIChat`, the one
 *    tenant-aware gateway that already owns routing, budget guards, failover
 *    and atomic usage metering.
 *  - **No new conversation store.** It uses the existing `Conversation` /
 *    `ConversationMessage` tables, scoped to `userId` + `companyId` in the
 *    query itself so a guessed conversation id cannot cross tenants.
 *  - **No fabricated results.** If inference fails, the turn is recorded with
 *    `status: 'failed'` and the error is returned. Nothing is invented, and no
 *    agent execution is claimed unless the orchestrator actually ran.
 *
 * Routes:
 *   GET  ?id=…   — one conversation with its messages (ownership enforced)
 *   GET          — this user's conversations, newest first
 *   POST         — append a turn and produce a reply
 *   DELETE ?id=… — archive a conversation (soft; rows are retained)
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import { checkEndpointLimit } from '@/lib/security/rate-limiter'
import { CompanyAIError, executeCompanyAIChat } from '@/lib/multi-tenant-ai/service'
import type { AIRequest } from '@/lib/ai-router/types'

export const dynamic = 'force-dynamic'

const MAX_HISTORY_TURNS = 20

const PostSchema = z.object({
  message: z.string().trim().min(1).max(50_000),
  conversationId: z.string().min(1).max(128).optional(),
  title: z.string().trim().max(200).optional(),
}).strict()

const SYSTEM_PROMPT = `You are ALO Labs AI, a helpful assistant inside the ALO Labs platform.
Answer directly and concisely. Use markdown for code and structure.
You do not have the ability to run commands, modify files, deploy, or change platform settings in this chat: such work requires a separate approved workflow. Never claim that you performed an action you did not perform. If a request needs one of those workflows, say so plainly and describe what would be required.`

/** A conversation belongs to its creator, or to the principal's company. */
async function loadOwnedConversation(id: string, userId: string, companyId: string) {
  const conversation = await db.conversation.findFirst({
    where: { id, OR: [{ userId }, { companyId }] },
    select: { id: true, userId: true, companyId: true, title: true, status: true, createdAt: true, updatedAt: true },
  })
  // Not-found and not-yours are the same answer so ids cannot be probed.
  return conversation
}

function authFailure(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'Unauthorized'
  if (/forbidden/i.test(message)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireCompanyAuth>>
  try {
    actor = await requireCompanyAuth()
  } catch (error) {
    return authFailure(error)
  }

  const id = request.nextUrl.searchParams.get('id')

  if (id) {
    const conversation = await loadOwnedConversation(id, actor.userId, actor.companyId)
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const messages = await db.conversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, role: true, content: true, model: true, tokensUsed: true, latencyMs: true, createdAt: true },
    })
    return NextResponse.json({ conversation, messages })
  }

  const conversations = await db.conversation.findMany({
    where: { userId: actor.userId, companyId: actor.companyId, status: { not: 'archived' } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: 50,
    select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json({ conversations })
}

export async function POST(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireCompanyAuth>>
  try {
    actor = await requireCompanyAuth()
  } catch (error) {
    return authFailure(error)
  }

  const rateLimit = await checkEndpointLimit('/api/chat', actor.userId)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Resolve or create the conversation, always scoped to this principal.
  let conversationId = parsed.data.conversationId
  if (conversationId) {
    const owned = await loadOwnedConversation(conversationId, actor.userId, actor.companyId)
    if (!owned) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  } else {
    const created = await db.conversation.create({
      data: {
        userId: actor.userId,
        companyId: actor.companyId,
        title: (parsed.data.title || parsed.data.message).slice(0, 120),
        status: 'active',
      },
      select: { id: true },
    })
    conversationId = created.id
  }

  const history = await db.conversationMessage.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_HISTORY_TURNS,
    select: { role: true, content: true },
  })

  const messages: AIRequest['messages'] = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...history
      .reverse()
      .map((h) => ({
        role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: h.content,
      })),
    { role: 'user' as const, content: parsed.data.message },
  ]

  // Persist the user turn before inference: if the model call fails, the
  // operator's message is still part of the record.
  await db.conversationMessage.create({
    data: { conversationId, role: 'user', content: parsed.data.message },
  })

  const started = Date.now()
  try {
    const result = await executeCompanyAIChat(
      { companyId: actor.companyId, userId: actor.userId, role: actor.companyRole ?? 'member' },
      { model: '', messages, temperature: 0.7, maxTokens: 2048 },
      { profile: 'free_general', dataClassification: 'confidential' },
    )

    const latencyMs = Date.now() - started
    const saved = await db.conversationMessage.create({
      data: {
        conversationId,
        role: 'agent',
        content: result.response.content,
        model: result.response.model,
        tokensUsed: result.response.usage.totalTokens,
        latencyMs,
        metadata: JSON.stringify({
          requestId: result.requestId,
          provider: result.provider,
          attempts: result.attempts,
          fallbackUsed: result.fallbackUsed,
        }),
      },
      select: { id: true, createdAt: true },
    })
    await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })

    return NextResponse.json({
      conversationId,
      message: {
        id: saved.id,
        role: 'agent',
        content: result.response.content,
        model: result.response.model,
        latencyMs,
        createdAt: saved.createdAt,
      },
      requestId: result.requestId,
      provider: result.provider,
      attempts: result.attempts,
      fallbackUsed: result.fallbackUsed,
      usage: result.response.usage,
    })
  } catch (error) {
    const latencyMs = Date.now() - started
    const message = error instanceof Error ? error.message : 'AI request failed'
    const code = error instanceof CompanyAIError ? error.code : 'AI_UNAVAILABLE'

    // Record the failure as a visible turn rather than dropping it. It is
    // marked `failed` in metadata so the UI can distinguish a real answer from
    // an error and offer a retry.
    await db.conversationMessage
      .create({
        data: {
          conversationId,
          role: 'system',
          content: `The AI request failed: ${message}`,
          latencyMs,
          metadata: JSON.stringify({ status: 'failed', code }),
        },
      })
      .catch(() => undefined)

    return NextResponse.json({ error: message, code, conversationId, failed: true }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireCompanyAuth>>
  try {
    actor = await requireCompanyAuth()
  } catch (error) {
    return authFailure(error)
  }
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const owned = await loadOwnedConversation(id, actor.userId, actor.companyId)
  if (!owned) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  // Soft archive: messages are retained for audit, the conversation leaves the
  // active list.
  await db.conversation.update({ where: { id }, data: { status: 'archived' } })
  return NextResponse.json({ success: true, id, status: 'archived' })
}
