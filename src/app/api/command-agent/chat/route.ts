import { authFailure } from '@/lib/api/route-errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, type AuthenticatedUser } from '@/lib/api-auth';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { writeAuditEvent } from '@/lib/audit-events';
import {
  runCommandAgent,
  clearCommandSessions,
  CompanyAIError,
  COMMAND_AGENT_PROFILES,
  type CommandAgentProfile,
} from '@/lib/command-agent/agent';
import { findCommandConversation, loadCommandTurns } from '@/lib/chat/command-session-store';
import { canUseCommandAgent, resolveCommandCompany } from '@/lib/command-agent/access';

export const dynamic = 'force-dynamic';

/**
 * POST /api/command-agent/chat — Super Admin / Admin own AI agent.
 *
 * Unlike /api/super-chat (advice-only, super_admin only), this agent *acts*:
 * it calls read-only tenant tools (knowledge, CRM, departments, calculate)
 * and free external tools (weather, Wikipedia, web search, Hacker News,
 * image generation, time) through the policy-gated company AI gateway.
 *
 * Access: platform super_admin (any active company) or a company
 * owner/admin (their own company only). Everyone else: 403.
 */

const BodySchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  sessionId: z.string().trim().min(1).max(120).default('default'),
  profile: z.enum(COMMAND_AGENT_PROFILES).default('free_general'),
  model: z.string().trim().max(300).optional(),
  targetCompany: z.string().trim().max(191).optional().nullable(),
  skillSlugs: z.array(z.string().trim().min(1).max(160)).max(5).optional(),
  /**
   * 'read' (default) keeps the agent strictly read-only. 'supervisor' exposes
   * the mutation registry — but only for the platform super_admin; the route
   * downgrades the mode for anyone else, so a company admin can never opt in.
   */
  mode: z.enum(['read', 'supervisor']).default('read'),
}).strict();

export async function POST(request: NextRequest) {
  let actor: AuthenticatedUser;
  try { actor = await requireAuth(); }
  catch (error) { return authFailure(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  if (!canUseCommandAgent(actor)) {
    return NextResponse.json({ error: 'Command Agent requires Super Admin or company Admin access' }, { status: 403 });
  }

  const rateLimit = await checkEndpointLimit('/api/command-agent/chat', actor.userId);
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  let parsed;
  try { parsed = BodySchema.safeParse(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const company = await resolveCommandCompany(actor, parsed.data.targetCompany);
    if (!company) return NextResponse.json({ error: 'Target company not found or not accessible' }, { status: 404 });
    if (company.status !== 'active') return NextResponse.json({ error: 'Target company is not active' }, { status: 403 });

    await writeAuditEvent({
      actorUserId: actor.userId,
      companyId: company.id,
      action: 'command_agent.chat.request',
      resource: 'command-agent',
      details: {
        sessionId: parsed.data.sessionId,
        profile: parsed.data.profile,
        requestedModel: parsed.data.model ?? null,
        requestedSkills: parsed.data.skillSlugs ?? [],
        messageLength: parsed.data.message.length,
        actorRole: actor.role,
      },
    });

    const result = await runCommandAgent({
      companyId: company.id,
      userId: actor.userId,
      role: actor.role,
      companyName: company.name,
      message: parsed.data.message,
      sessionId: parsed.data.sessionId,
      profile: parsed.data.profile as CommandAgentProfile,
      mode: actor.role === 'super_admin' ? parsed.data.mode : 'read',
      ...(parsed.data.model ? { model: parsed.data.model } : {}),
      ...(parsed.data.skillSlugs?.length ? { skillSlugs: parsed.data.skillSlugs } : {}),
    });

    return NextResponse.json({
      success: true,
      response: result.content,
      provider: result.provider,
      model: result.model,
      profile: result.profile,
      status: result.status,
      statusDetail: result.statusDetail,
      approvals: result.approvals,
      persisted: result.persisted,
      runId: result.runId,
      eventCount: result.eventCount,
      routing: result.routing,
      steps: result.steps,
      trace: result.trace,
      images: result.images,
      requestIds: result.requestIds,
      skillsUsed: result.skillsUsed,
      skillsRejected: result.skillsRejected,
      company: { id: company.id, name: company.name, slug: company.slug },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof CompanyAIError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          requestId: error.requestId,
          hint: 'No authorised free/local model completed the request. Add a free provider (Groq, OpenRouter :free, Gemini, Cerebras or Ollama) in Super Admin AI Control Plane → AI Providers, verify its free tier, and allow it in the company routing policy. See the Free Models tab for exact keys and model ids.',
        },
        { status: error.status },
      );
    }
    const response = authFailure(error);
    if (response) return response;
    console.error('[Command Agent] Request failed:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}

/**
 * GET /api/command-agent/chat?sessionId=… — durable transcript.
 *
 * The Commanding Center reloads this on mount so history survives a restart.
 * Scoped by user + tenant in the query; a guessed id cannot cross either.
 */
export async function GET(request: NextRequest) {
  let actor: AuthenticatedUser;
  try { actor = await requireAuth(); }
  catch (error) { return authFailure(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  if (!canUseCommandAgent(actor)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId') || 'default';
  try {
    const company = await resolveCommandCompany(actor, request.nextUrl.searchParams.get('targetCompany'));
    if (!company) return NextResponse.json({ error: 'Target company not found or not accessible' }, { status: 404 });

    const conversation = await findCommandConversation({
      userId: actor.userId,
      companyId: company.id,
      sessionId,
    });
    const messages = conversation
      ? await loadCommandTurns({ conversationId: conversation.id, companyId: company.id })
      : [];

    return NextResponse.json({
      success: true,
      sessionId,
      company: { id: company.id, name: company.name, slug: company.slug },
      // `durable: false` means history could not be read — not that it is empty.
      durable: Boolean(conversation),
      messages,
    });
  } catch (error) {
    const response = authFailure(error);
    if (response) return response;
    console.error('[Command Agent] history read failed:', error);
    return NextResponse.json({ error: 'Failed to load history', durable: false, messages: [] }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let actor: AuthenticatedUser;
  try { actor = await requireAuth(); }
  catch (error) { return authFailure(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  if (!canUseCommandAgent(actor)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sessionId = request.nextUrl.searchParams.get('sessionId') || 'default';
  try {
    const company = await resolveCommandCompany(actor, request.nextUrl.searchParams.get('targetCompany'));
    if (!company) return NextResponse.json({ error: 'Target company not found or not accessible' }, { status: 404 });

    const cleared = await clearCommandSessions({ userId: actor.userId, companyId: company.id, sessionId });
    await writeAuditEvent({
      actorUserId: actor.userId,
      companyId: company.id,
      action: 'command_agent.chat.clear',
      resource: 'command-agent',
      details: { sessionId, cleared },
    });
    return NextResponse.json({ success: true, message: 'Conversation cleared', cleared });
  } catch (error) {
    const response = authFailure(error);
    if (response) return response;
    console.error('[Command Agent] clear failed:', error);
    return NextResponse.json({ error: 'Failed to clear conversation' }, { status: 500 });
  }
}
