import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { CompanyAIError, streamCompanyAIChat } from '@/lib/multi-tenant-ai/service';
import { MODEL_ROUTING_PROFILES } from '@/lib/multi-tenant-ai/policy';

export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string().max(200_000),
  })).min(1).max(100),
  profile: z.enum(MODEL_ROUTING_PROFILES).default('free_general'),
  agentId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  maxTokens: z.number().int().min(1).max(128_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  dataClassification: z.enum(['confidential', 'restricted']).default('confidential'),
}).strict();

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireCompanyAuth>>;
  try { user = await requireCompanyAuth(); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: message === 'Forbidden' ? 403 : 401 });
  }
  const rateLimit = await checkEndpointLimit('/api/llm/stream', user.userId);
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  let parsed;
  try { parsed = RequestSchema.safeParse(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const requestId = `ai_${randomUUID()}`;
  const actor = { companyId: user.companyId, userId: user.userId, role: user.role };
  const aiRequest = {
    model: '',
    messages: parsed.data.messages,
    maxTokens: parsed.data.maxTokens,
    temperature: parsed.data.temperature,
    stream: true,
  };
  const options = {
    profile: parsed.data.profile,
    agentId: parsed.data.agentId,
    departmentId: parsed.data.departmentId,
    dataClassification: parsed.data.dataClassification,
    requestId,
  };
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      send('metadata', { requestId, profile: parsed.data.profile, model: 'auto' });
      try {
        let model = 'auto';
        let estimatedCompletionTokens = 0;
        for await (const chunk of streamCompanyAIChat(actor, aiRequest, options)) {
          if (chunk.content) estimatedCompletionTokens += Math.ceil(chunk.content.length / 4);
          if (chunk.model) model = chunk.model;
          send('chunk', { type: 'token', content: chunk.content ?? '', model: chunk.model ?? model, finishReason: chunk.finishReason ?? null });
        }
        send('done', { requestId, model, estimatedCompletionTokens, usageSource: 'locally_estimated' });
      } catch (error) {
        const aiError = error instanceof CompanyAIError ? error : null;
        send('error', {
          requestId,
          code: aiError?.code ?? 'STREAM_ERROR',
          message: aiError?.message ?? 'Authorized AI stream could not be completed; no paid fallback was attempted.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Request-Id': requestId,
    },
  });
}
