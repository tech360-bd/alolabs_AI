/**
 * POST /api/ai/stream
 * ALO Labs AIOS — Streaming AI chat completion via the gateway.
 * Returns Server-Sent Events (SSE) stream.
 */

import { NextRequest } from 'next/server';
import { AIGateway } from '@/lib/ai-gateway/gateway';
import type { AIGatewayRequest } from '@/lib/ai-gateway/types';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  let body: AIGatewayRequest;

  try {
    await requireAuth();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
        timestamp: new Date().toISOString(),
        requestId: 'err-parse',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of AIGateway.stream(body)) {
          controller.enqueue(encoder.encode(event));
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ code: 'STREAM_ERROR', message: 'Stream interrupted.' })}\n\n`,
          ),
        );
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
      'Connection': 'keep-alive',
    },
  });
}
