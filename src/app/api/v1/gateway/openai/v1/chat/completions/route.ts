import { NextResponse } from 'next/server';
import { z } from 'zod';
import { platformRoute, json, PlatformError } from '@/lib/platform/http';
import {
  formatOpenAIChatResponse,
  formatOpenAISseChunk,
  formatProtocolErrorEnvelope,
  parseOpenAIChatRequest,
  type OpenAIChatPayload,
} from '@/lib/ai-router/protocol-gateway';
import {
  executeCommandRoute,
  streamCommandRoute,
  type ExtendedCapability,
} from '@/lib/ai-router/command-router';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';

const schema = z.object({
  model: z.string().max(200).optional(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.union([z.string(), z.array(z.record(z.string(), z.unknown())), z.null()]),
    tool_call_id: z.string().optional(),
    name: z.string().optional(),
    tool_calls: z.array(z.any()).optional(),
  })).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(128_000).optional(),
  max_completion_tokens: z.number().int().min(1).max(128_000).optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
});

function openAiErrorResponse(err: unknown, requestId: string): NextResponse {
  const status = err instanceof CompanyAIError ? err.status : err instanceof PlatformError ? err.status : 503;
  const code = err instanceof CompanyAIError ? err.code : undefined;
  const message = err instanceof Error ? err.message : 'OpenAI gateway execution failed';
  return NextResponse.json(
    formatProtocolErrorEnvelope('openai-chat', status, message, code),
    { status, headers: { 'x-request-id': requestId } },
  );
}

export const POST = platformRoute(
  { scope: 'ai:chat', body: schema, allowCompanyScope: true, rateLimit: { limit: 120, windowMs: 60_000 } },
  async ({ principal, body, requestId }) => {
    const companyId = principal.companyId || principal.workspaceId;
    if (!companyId) throw new PlatformError(403, 'forbidden', 'Tenant identity required');

    const aiRequest = parseOpenAIChatRequest(body as unknown as OpenAIChatPayload);
    const caps: ExtendedCapability[] = ['chat'];
    if (aiRequest.tools?.length) caps.push('tool-calling');
    if (aiRequest.messages.some((m) => m.imageUrls?.length)) caps.push('image-input');

    if (aiRequest.stream) {
      let streamed: Awaited<ReturnType<typeof streamCommandRoute>>;
      try {
        streamed = await streamCommandRoute({
          companyId,
          userId: principal.userId,
          role: principal.role,
          requestId,
          request: aiRequest,
          requiredCapabilities: caps,
        });
      } catch (err) {
        return openAiErrorResponse(err, requestId);
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamed.stream) {
              controller.enqueue(encoder.encode(formatOpenAISseChunk(chunk)));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Stream execution failed';
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(formatProtocolErrorEnvelope('openai-chat', 503, message))}\n\n`));
          } finally {
            controller.close();
          }
        },
      });
      return new NextResponse(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-request-id': requestId },
      });
    }

    try {
      const result = await executeCommandRoute({
        companyId,
        userId: principal.userId,
        role: principal.role,
        requestId,
        request: aiRequest,
        requiredCapabilities: caps,
      });
      return json(formatOpenAIChatResponse(result.response, result.selectedProvider), requestId);
    } catch (error) {
      return openAiErrorResponse(error, requestId);
    }
  },
);
