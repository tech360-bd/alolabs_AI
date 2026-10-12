import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getRun, getRunEvents } from '@/lib/runs';
import { getEventBus } from '@/lib/event-bus';
import type { DomainEvent } from '@/lib/event-bus';

/**
 * /api/runs/:id/events — Server-Sent Events stream of run progress.
 *
 * Replays persisted RunEvent rows (durable, survives reconnects), then streams
 * live events from the in-process event bus for this run (correlationId).
 * This is real progress: every event is produced by the orchestrator pipeline.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth().catch(() => null);
  if (!user || !user.companyId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id: runId } = await params;
  const run = await getRun(runId);
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (run.companyId !== user.companyId) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let lastEventId = 0;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // 1. Replay persisted events (durable history)
      const persisted = await getRunEvents(runId, 500);
      for (const event of persisted) {
        lastEventId += 1;
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(event.data); } catch { /* keep raw */ }
        send({
          id: lastEventId,
          type: event.type,
          source: event.source,
          agentId: event.agentId,
          taskId: event.taskId,
          data,
          createdAt: event.createdAt.toISOString(),
        });
      }

      // 2. Subscribe to the live event bus for this run
      const bus = getEventBus();
      const subId = bus.subscribe('*', (event: DomainEvent) => {
        if (event.correlationId !== runId) return;
        if (!event.type.startsWith('agentos.')) return;
        lastEventId += 1;
        send({
          id: lastEventId,
          type: event.type.replace(/^agentos\./, ''),
          source: event.source,
          data: (event.data ?? {}) as Record<string, unknown>,
          createdAt: event.timestamp.toISOString(),
        });
      });

      // 3. Terminal-state watcher: close the stream when the run finishes
      const watcher = setInterval(async () => {
        if (closed) return;
        try {
          const current = await getRun(runId);
          if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) {
            send({ type: 'stream.closed', data: { status: current.status } });
            closed = true;
            clearInterval(watcher);
            bus.unsubscribe(subId);
            controller.close();
          }
        } catch { /* keep streaming */ }
      }, 2000);
      if (typeof watcher.unref === 'function') watcher.unref();

      // 4. Heartbeat keeps proxies from closing idle connections
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch { /* closed */ }
      }, 15000);
      if (typeof heartbeat.unref === 'function') heartbeat.unref();

      // 5. Client disconnect cleanup
      const abortHandler = () => {
        if (closed) return;
        closed = true;
        clearInterval(watcher);
        clearInterval(heartbeat);
        bus.unsubscribe(subId);
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener('abort', abortHandler);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
