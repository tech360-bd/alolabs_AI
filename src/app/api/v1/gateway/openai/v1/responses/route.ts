import { NextResponse } from 'next/server';
import { z } from 'zod';
import { platformRoute, json, PlatformError } from '@/lib/platform/http';
import {
  formatOpenAIResponsesResult,
  formatOpenAIResponsesSseEvent,
  formatProtocolErrorEnvelope,
  parseOpenAIResponsesRequest,
  type OpenAIResponsesPayload,
} from '@/lib/ai-router/protocol-gateway';
import {
  executeCommandRoute,
  streamCommandRoute,
  type ExtendedCapability,
} from '@/lib/ai-router/command-router';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';

const schema = z.object({
  model: z.string().max(200).optional(),
  instructions: z.string().optional(),
  input: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
  temperature: z.number().min(0).max(2).optional(),
  max_output_tokens: z.number().int().min(1).max(128_000).optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
  previous_response_id: z.string().optional(),
  background: z.boolean().optional(),
});

function responsesErrorResponse(err: unknown, requestId: string): NextResponse {
  const status = err instanceof CompanyAIError ? err.status : err instanceof PlatformError ? err.status : 503;
  const code = err instanceof CompanyAIError ? err.code : undefined;
  const message = err instanceof Error ? err.message : 'OpenAI Responses gateway execution failed';
  return NextResponse.json(
    formatProtocolErrorEnvelope('openai-responses', status, message, code),
    { status, headers: { 'x-request-id': requestId } },
  );
}

export const POST = platformRoute(
  { scope: 'ai:chat', body: schema, allowCompanyScope: true, rateLimit: { limit: 120, windowMs: 60_000 } },
  async ({ principal, body, requestId }) => {
    const companyId = principal.companyId || principal.workspaceId;
    if (!companyId) throw new PlatformError(403, 'forbidden', 'Tenant identity required');

    if (body.previous_response_id || body.background) {
      return NextResponse.json(
        formatProtocolErrorEnvelope(
          'openai-responses',
          501,
          'Stateful previous_response_id continuation and async background mode are not implemented; pass full conversation items in input.',
          'unsupported_parameter',
        ),
        { status: 501, headers: { 'x-request-id': requestId } },
      );
    }

    const aiRequest = parseOpenAIResponsesRequest(body as unknown as OpenAIResponsesPayload);
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
        return responsesErrorResponse(err, requestId);
      }

      const encoder = new TextEncoder();
      const respId = `resp_${requestId}`;
      const stream = new ReadableStream({
        async start(controller) {
          let started = false;
          let fullText = '';
          let model = streamed.plan.selected?.model ?? (aiRequest.model || 'auto');
          let inputTokens = 0;
          let outputTokens = 0;

          try {
            for await (const chunk of streamed.stream) {
              if (chunk.model) model = chunk.model;
              if (chunk.usage?.promptTokens) inputTokens = chunk.usage.promptTokens;
              if (chunk.usage?.completionTokens) outputTokens = chunk.usage.completionTokens;
              if (!started) {
                started = true;
                controller.enqueue(encoder.encode(formatOpenAIResponsesSseEvent('response.created', {
                  type: 'response.created',
                  response: { id: respId, object: 'response', status: 'in_progress', model },
                })));
              }
              if (chunk.content) {
                fullText += chunk.content;
                controller.enqueue(encoder.encode(formatOpenAIResponsesSseEvent('response.output_text.delta', {
                  type: 'response.output_text.delta',
                  item_id: `msg_${requestId}`,
                  output_index: 0,
                  content_index: 0,
                  delta: chunk.content,
                })));
              }
            }
            if (!started) {
              controller.enqueue(encoder.encode(formatOpenAIResponsesSseEvent('response.created', {
                type: 'response.created',
                response: { id: respId, object: 'response', status: 'in_progress', model },
              })));
            }
            controller.enqueue(encoder.encode(formatOpenAIResponsesSseEvent('response.completed', {
              type: 'response.completed',
              response: {
                id: respId,
                object: 'response',
                status: 'completed',
                model,
                output_text: fullText,
                usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens || Math.ceil(fullText.length / 4),
                  total_tokens: inputTokens + (outputTokens || Math.ceil(fullText.length / 4)),
                },
              },
            })));
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Stream execution failed';
            controller.enqueue(encoder.encode(formatOpenAIResponsesSseEvent('error', {
              type: 'error',
              error: { message },
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
      return json(formatOpenAIResponsesResult(result.response, result.selectedProvider), requestId);
    } catch (error) {
      return responsesErrorResponse(error, requestId);
    }
  },
);
