import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { streamCompanyAIChat, CompanyAIError } from '@/lib/multi-tenant-ai/service';
import { MODEL_ROUTING_PROFILES } from '@/lib/multi-tenant-ai/policy';

const RequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant', 'tool']), content: z.string().max(200_000) })).min(1).max(100),
  model: z.string().trim().min(1).max(200).optional(),
  profile: z.enum(MODEL_ROUTING_PROFILES).default('free_general'),
  agentId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  maxTokens: z.number().int().min(1).max(128_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  tools: z.array(z.object({
    type: z.literal('function'),
    function: z.object({ name: z.string().min(1).max(100), description: z.string().max(2000).optional(), parameters: z.record(z.string(), z.unknown()).optional() }),
  })).max(32).optional(),
  dataClassification: z.enum(['confidential', 'restricted']).optional(),
});

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireCompanyAuth>>;
  try { user = await requireCompanyAuth(); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: message === 'Forbidden' ? 403 : 401 });
  }
  const rateLimit = await checkEndpointLimit('/api/ai/stream', user.userId);
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  let parsed;
  try { parsed = RequestSchema.safeParse(await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const requestId = `ai_${randomUUID()}`;
  const actor = { companyId: user.companyId, userId: user.userId, role: user.role };
  const options = {
    profile: parsed.data.profile,
    agentId: parsed.data.agentId,
    departmentId: parsed.data.departmentId,
    dataClassification: parsed.data.dataClassification,
    requestId,
  };
  const aiRequest = {
    model: parsed.data.model ?? '',
    messages: parsed.data.messages,
    temperature: parsed.data.temperature,
    maxTokens: parsed.data.maxTokens,
    tools: parsed.data.tools,
    stream: true,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send('metadata', { requestId, model: parsed.data.model ?? 'auto', profile: parsed.data.profile });
      try {
        let completionTokens = 0;
        let model = parsed.data.model ?? 'auto';
        for await (const chunk of streamCompanyAIChat(actor, aiRequest, options)) {
          if (chunk.content) completionTokens += Math.ceil(chunk.content.length / 4);
          if (chunk.model) model = chunk.model;
          send('chunk', { id: chunk.id, content: chunk.content ?? '', model: chunk.model ?? model, finishReason: chunk.finishReason ?? null });
        }
        send('done', { requestId, model, estimatedCompletionTokens: completionTokens });
      } catch (error) {
        const code = error instanceof CompanyAIError ? error.code : 'STREAM_ERROR';
        const message = error instanceof CompanyAIError ? error.message : 'The authorized AI stream could not be completed.';
        send('error', { requestId, code, message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
