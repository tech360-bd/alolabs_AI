import { NextResponse } from 'next/server';
import { z } from 'zod';
import { platformRoute, json, PlatformError } from '@/lib/platform/http';
import {
  formatGeminiGenerateResponse,
  formatGeminiSseChunk,
  formatProtocolErrorEnvelope,
  parseGeminiGenerateRequest,
  type GeminiGenerateContentPayload,
} from '@/lib/ai-router/protocol-gateway';
import {
  executeCommandRoute,
  streamCommandRoute,
  type ExtendedCapability,
} from '@/lib/ai-router/command-router';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';

const schema = z.object({
  systemInstruction: z.object({ parts: z.array(z.object({ text: z.string().optional() })).optional() }).optional(),
  contents: z.array(z.object({
    role: z.enum(['user', 'model']).optional(),
    parts: z.array(z.record(z.string(), z.unknown())),
  })).min(1),
  tools: z.array(z.object({ functionDeclarations: z.array(z.any()).optional() })).optional(),
  generationConfig: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(1).max(128_000).optional(),
  }).optional(),
});

function geminiErrorResponse(err: unknown, requestId: string): NextResponse {
  const status = err instanceof CompanyAIError ? err.status : err instanceof PlatformError ? err.status : 503;
  const message = err instanceof Error ? err.message : 'Gemini gateway execution failed';
  return NextResponse.json(
    formatProtocolErrorEnvelope('gemini-generate', status, message),
    { status, headers: { 'x-request-id': requestId } },
  );
}

export const POST = platformRoute(
  { scope: 'ai:chat', body: schema, allowCompanyScope: true, rateLimit: { limit: 120, windowMs: 60_000 } },
  async ({ principal, body, request, requestId }) => {
    const companyId = principal.companyId || principal.workspaceId;
    if (!companyId) throw new PlatformError(403, 'forbidden', 'Tenant identity required');

    const segs = request.nextUrl.pathname.split('/');
    const modelsIdx = segs.indexOf('models');
    const requestedModel = modelsIdx >= 0 && segs[modelsIdx + 1] ? decodeURIComponent(segs[modelsIdx + 1]) : 'auto';
    const altSse = request.nextUrl.searchParams.get('alt') === 'sse';

    const aiRequest = parseGeminiGenerateRequest(requestedModel, body as unknown as GeminiGenerateContentPayload);
    const caps: ExtendedCapability[] = ['chat'];
    if (aiRequest.tools?.length) caps.push('tool-calling');

    if (altSse) {
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
        return geminiErrorResponse(err, requestId);
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamed.stream) {
              controller.enqueue(encoder.encode(formatGeminiSseChunk(chunk)));
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Gemini stream failed';
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(formatProtocolErrorEnvelope('gemini-generate', 503, msg))}\n\n`));
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
      return json(formatGeminiGenerateResponse(result.response, result.selectedProvider), requestId);
    } catch (error) {
      return geminiErrorResponse(error, requestId);
    }
  },
);
