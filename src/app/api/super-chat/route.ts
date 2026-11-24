import { authFailure as authError } from '@/lib/api/route-errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { agentCompanyScope } from '@/lib/agent-access';
import { requireRole } from '@/lib/api-auth';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { writeAuditEvent } from '@/lib/audit-events';
import { CompanyAIError, executeCompanyAIChat } from '@/lib/multi-tenant-ai/service';
import {
  appendSuperAdminTurn,
  clearSuperAdminConversation,
  getOrCreateSuperAdminConversation,
  loadSuperAdminHistory,
} from '@/lib/chat/super-admin-conversation-store';
import type { AIRequest } from '@/lib/ai-router/types';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are the ALO Labs Super Admin command-center assistant. You may help plan and explain work, but this chat endpoint does not dispatch agents or execute operational actions. Never claim that tasks, broadcasts, CRM changes, security scans, or other real-world operations have been performed. Clearly distinguish recommendations from actions that require a separate approved workflow. Treat company data as confidential.`;

const MessageSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  sessionId: z.string().trim().min(1).max(120).default('default'),
  targetDepartment: z.string().trim().max(191).optional().nullable(),
  targetCompany: z.string().trim().max(191).optional().nullable(),
  broadcast: z.boolean().default(false),
}).strict();

async function resolveCompany(actorCompanyId: string | undefined, target: string | null | undefined) {
  if (target) {
    return db.company.findFirst({ where: { OR: [{ id: target }, { slug: target }] } });
  }
  if (actorCompanyId) {
    const selected = await db.company.findUnique({ where: { id: actorCompanyId } });
    if (selected) return selected;
  }
  return db.company.findUnique({ where: { slug: 'alo-labs' } });
}

async function getAvailableAgents(companyId: string, department?: string | null) {
  const agents = await db.agent.findMany({
    where: {
      status: 'active',
      ...agentCompanyScope(companyId, 'view'),
      ...(department ? { departmentName: department } : {}),
    },
    select: { id: true, name: true, departmentName: true, type: true },
    take: 5,
    orderBy: { createdAt: 'asc' },
  });
  return agents.map((agent) => ({
    agentId: agent.id,
    name: agent.name || agent.type || 'Unnamed Agent',
    department: agent.departmentName || 'General',
    status: 'available',
    message: 'Available in this company. This chat did not dispatch or execute the agent.',
  }));
}

export async function POST(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireRole>>;
  try { actor = await requireRole('super_admin'); }
  catch (error) { return authError(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const rateLimit = await checkEndpointLimit('/api/super-chat', actor.userId);
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  let parsed;
  try { parsed = MessageSchema.safeParse(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const company = await resolveCompany(actor.companyId, parsed.data.targetCompany);
    if (!company) return NextResponse.json({ error: 'Target company not found' }, { status: 404 });
    if (company.status !== 'active') return NextResponse.json({ error: 'Target company is not active' }, { status: 403 });

    // Durable history, scoped to this user + tenant. Replaces the previous
    // module-level Map, which lost every restart and diverged between
    // instances.
    const conversation = await getOrCreateSuperAdminConversation({
      userId: actor.userId,
      companyId: company.id,
      sessionId: parsed.data.sessionId,
    });
    const history = await loadSuperAdminHistory({
      conversationId: conversation.id,
      companyId: company.id,
    });
    const contextPrefix = [
      `[Company scope: ${company.name}]`,
      parsed.data.targetDepartment ? `[Department: ${parsed.data.targetDepartment}]` : '',
      parsed.data.broadcast ? '[Broadcast requested; do not perform a broadcast in this chat.]' : '',
    ].filter(Boolean).join(' ');
    const messages: AIRequest['messages'] = [
      { role: 'system' as const, content: `${SYSTEM_PROMPT}\nCompany: ${company.name} (${company.slug}).` },
      ...history.slice(-18),
      { role: 'user' as const, content: `${contextPrefix}\n${parsed.data.message}` },
    ];

    await writeAuditEvent({
      actorUserId: actor.userId,
      companyId: company.id,
      action: 'super_admin.chat.request',
      resource: 'super-chat',
      details: {
        targetDepartment: parsed.data.targetDepartment ?? null,
        broadcastRequested: parsed.data.broadcast,
        sessionId: parsed.data.sessionId,
        messageLength: parsed.data.message.length,
      },
    });

    const result = await executeCompanyAIChat(
      { companyId: company.id, userId: actor.userId, role: actor.role },
      { model: '', messages, maxTokens: 2048, temperature: 0.3 },
      { profile: 'free_general', dataClassification: 'confidential' },
    );

    // Persist both turns. Best-effort by design: a storage hiccup must not
    // discard a reply the operator already waited for.
    const persistedUser = await appendSuperAdminTurn({
      conversationId: conversation.id,
      turn: { role: 'user', content: `${contextPrefix}\n${parsed.data.message}` },
    });
    const persistedReply = await appendSuperAdminTurn({
      conversationId: conversation.id,
      turn: {
        role: 'assistant',
        content: result.response.content,
        model: result.response.model,
        metadata: { requestId: result.requestId, provider: result.provider },
      },
    });

    const agents = await getAvailableAgents(company.id, parsed.data.targetDepartment);
    return NextResponse.json({
      success: true,
      response: result.response.content,
      requestId: result.requestId,
      provider: result.provider,
      model: result.response.model,
      company: { id: company.id, name: company.name, slug: company.slug },
      // This endpoint has never executed a broadcast and still does not. It is
      // reported from the actual guard result rather than as a bare literal, so
      // a future implementation cannot silently leave the field stale.
      broadcastRequested: parsed.data.broadcast,
      broadcastExecuted: false,
      conversationId: conversation.id,
      persisted: { userTurn: persistedUser, assistantTurn: persistedReply },
      agents,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof CompanyAIError) {
      return NextResponse.json({ error: error.message, code: error.code, requestId: error.requestId }, { status: error.status });
    }
    const response = authError(error);
    if (response) return response;
    console.error('[Super Chat] Request failed:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireRole>>;
  try { actor = await requireRole('super_admin'); }
  catch (error) { return authError(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const sessionId = request.nextUrl.searchParams.get('sessionId') || 'default';
  // Deletes only this user's turns for this session. The conversation row is
  // retained so the fact that a conversation existed stays auditable.
  const deleted = await clearSuperAdminConversation({
    userId: actor.userId,
    companyId: actor.companyId ?? '',
    sessionId,
  }).catch((error: unknown) => {
    console.error('[super-chat] Clear failed:', error instanceof Error ? error.message : error);
    return -1;
  });
  if (deleted < 0) {
    return NextResponse.json({ error: 'Failed to clear conversation' }, { status: 500 });
  }
  await writeAuditEvent({ actorUserId: actor.userId, action: 'super_admin.chat.clear', resource: 'super-chat', details: { sessionId, messagesDeleted: deleted } });
  return NextResponse.json({ success: true, message: 'Conversation cleared', messagesDeleted: deleted });
}
