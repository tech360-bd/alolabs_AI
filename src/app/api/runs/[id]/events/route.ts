import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getRun, getRunEvents } from '@/lib/runs';
import { getEventBus } from '@/lib/event-bus';
import { isUsableTenantId } from '@/lib/tenancy/policy';
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
  // T-5. This comparison is the whole access control for a live data stream, so
  // it is written out rather than left as a bare `!==`.
  //
  // A run with no tenant used to reach the `!==` and be refused by accident
  // (null !== a real id). Accident is not a policy: it stops holding the moment
  // either side is an empty string, or the day someone "fixes" the null check
  // above. Both sides are therefore required to be real tenants first, so an
  // unowned run cannot stream to anyone even if the ids happen to compare equal.
  const runTenant = isUsableTenantId(run.companyId) ? run.companyId : null;
  const callerTenant = isUsableTenantId(user.companyId) ? user.companyId : null;
  if (!runTenant || !callerTenant || runTenant !== callerTenant) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const lastEventHeader = request.headers.get('last-event-id');
  const urlAfter = new URL(request.url).searchParams.get('lastEventId');
  const resumeAfterSeq = Math.max(
    0,
    Number.parseInt(lastEventHeader ?? urlAfter ?? '0', 10) || 0,
  );

  const encoder = new TextEncoder();
  let lastEventId = 0;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (seqId: number | null, payload: Record<string, unknown>) => {
        if (closed) return;
        const prefix = seqId !== null ? `id: ${seqId}\n` : '';
        controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(payload)}\n\n`));
      };

      // 1. Replay persisted events (durable history; honours Last-Event-ID on reconnect)
      const persisted = await getRunEvents(runId, 500);
      for (const event of persisted) {
        lastEventId += 1;
        if (lastEventId <= resumeAfterSeq) continue;
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(event.data); } catch { /* keep raw */ }
        send(lastEventId, {
          id: lastEventId,
          type: event.type,
          source: event.source,
          agentId: event.agentId,
          taskId: event.taskId,
          data,
          createdAt: event.createdAt.toISOString(),
        });
      }

      // If run is already terminal when client connects/reconnects, close cleanly after replay
      const initialCheck = await getRun(runId);
      if (initialCheck && ['completed', 'failed', 'cancelled', 'blocked', 'timed_out'].includes(initialCheck.status)) {
        send(null, { type: 'stream.closed', data: { status: initialCheck.status } });
        closed = true;
        controller.close();
        return;
      }

      // 2. Subscribe to the live event bus for this run
      const bus = getEventBus();
      const subId = bus.subscribe('*', (event: DomainEvent) => {
        if (event.correlationId !== runId) return;
        if (!event.type.startsWith('agentos.')) return;
        // T-5 per-event defence-in-depth: drop any live event missing a valid
        // companyId or attributed to a different tenant.
        if (!isUsableTenantId(event.companyId) || event.companyId !== callerTenant) return;
        lastEventId += 1;
        send(lastEventId, {
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
          if (current && ['completed', 'failed', 'cancelled', 'blocked', 'timed_out'].includes(current.status)) {
            send(null, { type: 'stream.closed', data: { status: current.status } });
            closed = true;
            clearInterval(watcher);
            clearInterval(heartbeat);
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
