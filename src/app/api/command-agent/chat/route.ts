import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, canManageCompany, type AuthenticatedUser } from '@/lib/api-auth';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { writeAuditEvent } from '@/lib/audit-events';
import {
  runCommandAgent,
  clearCommandSessions,
  CompanyAIError,
  COMMAND_AGENT_PROFILES,
  type CommandAgentProfile,
} from '@/lib/command-agent/agent';

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
}).strict();

function authFailure(error: unknown): NextResponse | null {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

type CompanyRow = { id: string; name: string; slug: string; status: string };

async function resolveCompany(actor: AuthenticatedUser, target: string | null | undefined): Promise<CompanyRow | null> {
  if (actor.role === 'super_admin') {
    if (target) {
      return db.company.findFirst({
        where: { OR: [{ id: target }, { slug: target }] },
        select: { id: true, name: true, slug: true, status: true },
      });
    }
    if (actor.companyId) {
      const selected = await db.company.findUnique({ where: { id: actor.companyId }, select: { id: true, name: true, slug: true, status: true } });
      if (selected) return selected;
    }
    return db.company.findUnique({ where: { slug: 'alo-labs' }, select: { id: true, name: true, slug: true, status: true } });
  }
  // Company admins: their own company only — a foreign target is refused.
  if (!actor.companyId || !canManageCompany(actor)) return null;
  const own = await db.company.findUnique({ where: { id: actor.companyId }, select: { id: true, name: true, slug: true, status: true } });
  if (!own) return null;
  if (target && target !== own.id && target !== own.slug) return null;
  return own;
}

export async function POST(request: NextRequest) {
  let actor: AuthenticatedUser;
  try { actor = await requireAuth(); }
  catch (error) { return authFailure(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  if (actor.role !== 'super_admin' && !canManageCompany(actor)) {
    return NextResponse.json({ error: 'Command Agent requires Super Admin or company Admin access' }, { status: 403 });
  }

  const rateLimit = await checkEndpointLimit('/api/command-agent/chat', actor.userId);
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  let parsed;
  try { parsed = BodySchema.safeParse(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const company = await resolveCompany(actor, parsed.data.targetCompany);
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
      ...(parsed.data.model ? { model: parsed.data.model } : {}),
    });

    return NextResponse.json({
      success: true,
      response: result.content,
      provider: result.provider,
      model: result.model,
      profile: result.profile,
      steps: result.steps,
      trace: result.trace,
      images: result.images,
      requestIds: result.requestIds,
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

export async function DELETE(request: NextRequest) {
  let actor: AuthenticatedUser;
  try { actor = await requireAuth(); }
  catch (error) { return authFailure(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  if (actor.role !== 'super_admin' && !canManageCompany(actor)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sessionId = request.nextUrl.searchParams.get('sessionId') || 'default';
  const cleared = clearCommandSessions(actor.userId, sessionId);
  await writeAuditEvent({ actorUserId: actor.userId, action: 'command_agent.chat.clear', resource: 'command-agent', details: { sessionId, cleared } });
  return NextResponse.json({ success: true, message: 'Conversation cleared', cleared });
}
