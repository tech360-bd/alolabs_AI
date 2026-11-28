import { NextResponse } from 'next/server';
import { z } from 'zod';
import { platformRoute, json, PlatformError } from '@/lib/platform/http';
import {
  formatAnthropicMessagesResponse,
  formatAnthropicSseEvent,
  formatProtocolErrorEnvelope,
  parseAnthropicMessagesRequest,
  type AnthropicMessagesPayload,
} from '@/lib/ai-router/protocol-gateway';
import {
  executeCommandRoute,
  streamCommandRoute,
  type ExtendedCapability,
} from '@/lib/ai-router/command-router';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';

const schema = z.object({
  model: z.string().max(200).optional(),
  system: z.union([z.string(), z.array(z.object({ type: z.string().optional(), text: z.string().optional() }))]).optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
  })).min(1),
  max_tokens: z.number().int().min(1).max(128_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    input_schema: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
});

function anthropicErrorResponse(err: unknown, requestId: string): NextResponse {
  const status = err instanceof CompanyAIError ? err.status : err instanceof PlatformError ? err.status : 503;
  const message = err instanceof Error ? err.message : 'Anthropic gateway execution failed';
  return NextResponse.json(
    formatProtocolErrorEnvelope('anthropic-messages', status, message),
    { status, headers: { 'x-request-id': requestId } },
  );
}

export const POST = platformRoute(
  { scope: 'ai:chat', body: schema, allowCompanyScope: true, rateLimit: { limit: 120, windowMs: 60_000 } },
  async ({ principal, body, requestId }) => {
    const companyId = principal.companyId || principal.workspaceId;
    if (!companyId) throw new PlatformError(403, 'forbidden', 'Tenant identity required');

    const aiRequest = parseAnthropicMessagesRequest(body as unknown as AnthropicMessagesPayload);
    const caps: ExtendedCapability[] = ['chat'];
    if (aiRequest.tools?.length) caps.push('tool-calling');

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
        return anthropicErrorResponse(err, requestId);
      }

      const encoder = new TextEncoder();
      const msgId = `msg_${requestId}`;
      const stream = new ReadableStream({
        async start(controller) {
          let openedBlock = false;
          let resolvedModel = streamed.plan.selected?.model ?? (aiRequest.model || 'auto');
          let inputTokens = 0;
          let outputTokens = 0;
          let sawToolCall = false;

          try {
            for await (const chunk of streamed.stream) {
              if (chunk.model) resolvedModel = chunk.model;
              if (chunk.usage?.promptTokens) inputTokens = chunk.usage.promptTokens;
              if (chunk.usage?.completionTokens) outputTokens = chunk.usage.completionTokens;
              if (!openedBlock) {
                openedBlock = true;
                controller.enqueue(encoder.encode(formatAnthropicSseEvent('message_start', {
                  type: 'message_start',
                  message: { id: msgId, type: 'message', role: 'assistant', model: resolvedModel, content: [], usage: { input_tokens: inputTokens, output_tokens: 0 } },
                })));
                controller.enqueue(encoder.encode(formatAnthropicSseEvent('content_block_start', {
                  type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' },
                })));
              }
              if (chunk.content) {
                if (!outputTokens) outputTokens += Math.ceil(chunk.content.length / 4);
                controller.enqueue(encoder.encode(formatAnthropicSseEvent('content_block_delta', {
                  type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk.content },
                })));
              }
              if (chunk.toolCalls?.length) sawToolCall = true;
            }
            if (!openedBlock) {
              controller.enqueue(encoder.encode(formatAnthropicSseEvent('message_start', {
                type: 'message_start',
                message: { id: msgId, type: 'message', role: 'assistant', model: resolvedModel, content: [], usage: { input_tokens: inputTokens, output_tokens: 0 } },
              })));
              controller.enqueue(encoder.encode(formatAnthropicSseEvent('content_block_start', {
                type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' },
              })));
            }
            controller.enqueue(encoder.encode(formatAnthropicSseEvent('content_block_stop', { type: 'content_block_stop', index: 0 })));
            controller.enqueue(encoder.encode(formatAnthropicSseEvent('message_delta', {
              type: 'message_delta',
              delta: { stop_reason: sawToolCall ? 'tool_use' : 'end_turn', stop_sequence: null },
              usage: { output_tokens: outputTokens },
            })));
            controller.enqueue(encoder.encode(formatAnthropicSseEvent('message_stop', { type: 'message_stop' })));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Stream execution failed';
            controller.enqueue(encoder.encode(formatAnthropicSseEvent('error', {
              type: 'error',
              error: { type: 'overloaded_error', message: msg },
            })));
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
      return json(formatAnthropicMessagesResponse(result.response, result.selectedProvider), requestId);
    } catch (error) {
      return anthropicErrorResponse(error, requestId);
    }
  },
);
