import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, type AuthenticatedUser } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { writeAuditEvent } from '@/lib/audit-events';
import {
  COMMAND_AGENT_PROFILES,
  CompanyAIError,
  runCommandAgent,
  type CommandAgentProfile,
} from '@/lib/command-agent/agent';
import { canUseCommandAgent, resolveCommandCompany } from '@/lib/command-agent/access';
import type { CommandRunEvent } from '@/lib/command-agent/run-store';

export const dynamic = 'force-dynamic';

/**
 * POST /api/command-agent/stream — run a command and stream its *real* events.
 *
 * NDJSON over a single response (not SSE): the browser posts a JSON body and
 * reads the response body with a stream reader, so there is no need to encode
 * the prompt in a URL or to keep a second GET connection open.
 *
 * Every line is one of:
 *   {"type":"run","runId":"…"}                       run row created (or null)
 *   {"type":"event","event":{seq,at,type,data}}      run_started / model / tool / approval
 *   {"type":"final","result":{…}}                    terminal result (status included)
 *   {"type":"error","error":"…","code":"…"}          the run failed; no fake success
 *
 * This streams *execution events*, not model tokens: the underlying gateway is
 * not streaming, and pretending it is would be dishonest. The first `model`
 * event arrives when a provider has answered.
 */

const BodySchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  sessionId: z.string().trim().min(1).max(120).default('default'),
  profile: z.enum(COMMAND_AGENT_PROFILES).default('free_general'),
  model: z.string().trim().max(300).optional(),
  targetCompany: z.string().trim().max(191).optional().nullable(),
  skillSlugs: z.array(z.string().trim().min(1).max(160)).max(5).optional(),
}).strict();

export async function POST(request: NextRequest) {
  let actor: AuthenticatedUser;
  try {
    actor = await requireAuth();
  } catch (error) {
    return authFailure(error) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canUseCommandAgent(actor)) {
    return NextResponse.json(
      { error: 'Command Agent requires Super Admin or company Admin access' },
      { status: 403 },
    );
  }

  const rateLimit = await checkEndpointLimit('/api/command-agent/stream', actor.userId);
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  let parsed;
  try {
    parsed = BodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let company;
  try {
    company = await resolveCommandCompany(actor, parsed.data.targetCompany);
  } catch (error) {
    const response = authFailure(error);
    if (response) return response;
    return NextResponse.json({ error: 'Could not resolve target company' }, { status: 500 });
  }
  if (!company) return NextResponse.json({ error: 'Target company not found or not accessible' }, { status: 404 });
  if (company.status !== 'active') return NextResponse.json({ error: 'Target company is not active' }, { status: 403 });

  try {
    await writeAuditEvent({
      actorUserId: actor.userId,
      companyId: company.id,
      action: 'command_agent.stream.request',
      resource: 'command-agent',
      details: {
        sessionId: parsed.data.sessionId,
        profile: parsed.data.profile,
        requestedModel: parsed.data.model ?? null,
        actorRole: actor.role,
        messageLength: parsed.data.message.length,
      },
    });
  } catch (error) {
    // The audit trail is part of the contract for a streaming run; refuse rather
    // than run without it.
    console.error('[Command Agent] stream audit failed:', error);
    return NextResponse.json({ error: 'Could not record the run in the audit trail' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          closed = true;
        }
      };

      const onEvent = (event: CommandRunEvent) => {
        send({ type: 'event', event });
        if (event.type === 'run_started') {
          send({ type: 'run', runId: typeof event.data.runId === 'string' ? event.data.runId : null });
        }
      };

      try {
        const result = await runCommandAgent({
          companyId: company.id,
          userId: actor.userId,
          role: actor.role,
          companyName: company.name,
          message: parsed.data.message,
          sessionId: parsed.data.sessionId,
          profile: parsed.data.profile as CommandAgentProfile,
          ...(parsed.data.model ? { model: parsed.data.model } : {}),
          ...(parsed.data.skillSlugs?.length ? { skillSlugs: parsed.data.skillSlugs } : {}),
          onEvent,
        });

        // The run row is created inside the agent; surface it immediately after
        // the run_started event so the client can re-fetch the stored timeline.
        send({
          type: 'final',
          result: {
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
            skillsUsed: result.skillsUsed,
            skillsRejected: result.skillsRejected,
            company: { id: company.id, name: company.name, slug: company.slug },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        if (error instanceof CompanyAIError) {
          send({
            type: 'error',
            error: error.message,
            code: error.code,
            requestId: error.requestId,
            hint: 'No authorised free/local model completed the request. Add or verify a free provider in Super Admin AI Control Plane → AI Providers.',
          });
        } else {
          send({
            type: 'error',
            error: error instanceof Error ? error.message : 'Failed to process message',
            code: 'COMMAND_RUN_FAILED',
          });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
      'x-command-company': company.id,
    },
  });
}
