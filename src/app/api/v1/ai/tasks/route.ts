import { v1Handler, v1Body, V1Error } from '@/lib/v1';
import { db } from '@/lib/db';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { requireEntitlement, incrementUsage } from '@/lib/api/entitlements';
import { publicTaskResponse } from '@/lib/api/public-response';
import { createRun } from '@/lib/runs';

/**
 * POST /api/v1/ai/tasks — submit an AI task for async execution.
 *
 * F1: Connects to the REAL run pipeline — createRun() enqueues a durable
 *     AgentOSRun + queue job. The task is not reported as accepted until
 *     the run is durably enqueued. Complete validated input is preserved
 *     on the Task row (description) AND on the AgentOSRun (objective).
 * F8: Idempotency keys are stored separately in IdempotencyKey with a
 *     request-hash for exact-match enforcement. Concurrent duplicates are
 *     rejected by the unique constraint on (companyId, key).
 *
 * Auth: API key with scope `ai:tasks` OR session user.
 * Entitlement: active `ai-tasks` service entitlement required.
 */

const CreateTaskSchema = z.object({
  service: z.enum(['ai-chat', 'ai-knowledge-search', 'ai-tasks', 'ai-content', 'ai-analysis']).default('ai-tasks'),
  input: z.record(z.string(), z.unknown()).default({}),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  idempotency_key: z.string().min(1).max(128).optional(),
});

/** Stable hash of the request body for exact-match idempotency. */
function hashRequest(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export const POST = v1Handler(async ({ identity }, request) => {
  const body = await v1Body<unknown>(request);
  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    throw new V1Error('Validation failed: ' + parsed.error.issues.map((i) => i.message).join('; '), 400, 'VALIDATION_ERROR');
  }

  const entitlement = await requireEntitlement(identity, parsed.data.service, 'ai:tasks');

  // F8: Idempotency — store the key separately with a request hash for exact
  // match. Concurrent duplicate submissions are rejected by the unique
  // constraint on (companyId, key). Distinct keys (order-123 vs order-1234)
  // are treated as distinct requests.
  let idempotencyRecord: { id: string; taskId: string | null } | null = null;
  if (parsed.data.idempotency_key) {
    const requestHash = hashRequest({ service: parsed.data.service, input: parsed.data.input, priority: parsed.data.priority });

    // Try to claim the idempotency key atomically. If it already exists, we
    // return the existing task (if created) or 409 if the original is still
    // in-flight.
    try {
      idempotencyRecord = await db.idempotencyKey.create({
        data: {
          id: randomUUID(),
          key: parsed.data.idempotency_key,
          companyId: identity.companyId,
          requestHash,
        },
        select: { id: true, taskId: true },
      });
    } catch {
      // Unique constraint hit — a previous submission used this key.
      const existing = await db.idempotencyKey.findUnique({
        where: { companyId_key: { companyId: identity.companyId, key: parsed.data.idempotency_key } },
        select: { id: true, taskId: true, requestHash: true },
      });
      if (existing) {
        // F8: exact-match enforcement. A different request body with the same
        // key is rejected (not silently treated as a duplicate).
        if (existing.requestHash !== requestHash) {
          throw new V1Error('Idempotency key already used with a different request body', 409, 'CONFLICT');
        }
        if (existing.taskId) {
          // Return the original task — this is a true duplicate.
          const originalTask = await db.task.findUnique({
            where: { id: existing.taskId },
            select: { id: true, status: true, createdAt: true, completedAt: true, title: true },
          });
          if (originalTask) {
            return publicTaskResponse({
              requestId: randomUUID(),
              taskId: originalTask.id,
              service: parsed.data.service,
              status: mapTaskStatus(originalTask.status),
              createdAt: originalTask.createdAt.toISOString(),
              completedAt: originalTask.completedAt?.toISOString(),
              usageUnits: 1,
            });
          }
        }
        // The original submission is still in-flight (task row not yet created).
        throw new V1Error('A request with this idempotency key is already being processed', 409, 'CONFLICT');
      }
    }
  }

  // F1: Preserve the COMPLETE validated input, not only a description snippet.
  // The full input is stored on the Task description (so it survives in the
  // existing Task table) and on the AgentOSRun objective (so the run
  // pipeline can act on it).
  const inputJson = JSON.stringify(parsed.data.input);
  const taskId = randomUUID();
  const objective = `[${parsed.data.service}] ${parsed.data.idempotency_key ?? randomUUID().slice(0, 8)} — input: ${inputJson.slice(0, 2000)}`;

  // F1: Create the Task row first, then enqueue the durable run. The run
  // pipeline (createRun) creates an AgentOSRun record + enqueues a queue
  // job. If enqueue fails, the task is marked failed (never reported as
  // accepted for an unqueued task).
  let task;
  try {
    task = await db.task.create({
      data: {
        id: taskId,
        companyId: identity.companyId,
        userId: identity.userId,
        status: 'pending',
        priority: parsed.data.priority === 'high' ? 'high' : parsed.data.priority === 'low' ? 'low' : 'medium',
        title: `[${parsed.data.service}] ${parsed.data.idempotency_key ?? randomUUID().slice(0, 8)}`,
        description: `AI task via /v1/ai/tasks. Service: ${parsed.data.service}. Input: ${inputJson.slice(0, 4000)}`,
      },
    });

    // F1: Enqueue the durable run. createRun creates an AgentOSRun + queue
    // job. If this throws, we mark the task failed and surface the error.
    const run = await createRun({
      objective,
      userId: identity.userId,
      companyId: identity.companyId,
      priority: parsed.data.priority,
    });

    // Link the run to the task.
    await db.task.update({
      where: { id: task.id },
      data: { runId: run.runId, status: 'in_progress' },
    });

    // F8: Link the idempotency record to the task.
    if (idempotencyRecord) {
      await db.idempotencyKey.update({
        where: { id: idempotencyRecord.id },
        data: { taskId: task.id },
      });
    }
  } catch (error) {
    // F1: Never return success for an unqueued task. Mark the task failed
    // and surface a safe error.
    if (task) {
      await db.task.update({
        where: { id: task.id },
        data: { status: 'failed', completedAt: new Date() },
      }).catch(() => {});
    }
    const message = error instanceof Error ? error.message : 'task enqueue failed';
    console.error('[v1/ai/tasks POST] enqueue failed', message);
    throw new V1Error('Task could not be enqueued for execution.', 503, 'INTERNAL_ERROR');
  }

  await incrementUsage(entitlement.serviceId, identity.companyId, 1);

  await db.auditLog.create({
    data: {
      action: 'ai.task.created',
      resource: 'Task',
      details: JSON.stringify({
        taskId: task.id,
        service: parsed.data.service,
        companyId: identity.companyId,
        callerKind: identity.kind,
        inputBytes: inputJson.length,
      }),
      userId: identity.userId,
    },
  }).catch(() => {});

  return publicTaskResponse({
    requestId: randomUUID(),
    taskId: task.id,
    service: parsed.data.service,
    status: 'pending',
    createdAt: task.createdAt.toISOString(),
    usageUnits: 1,
  });
});

/**
 * GET /api/v1/ai/tasks — list the caller's tasks (tenant-scoped).
 * Returns sanitized public DTOs only — no agent/model/internal fields.
 */
export const GET = v1Handler(async ({ identity }, request) => {
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20));
  const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10) || 0);

  const tasks = await db.task.findMany({
    where: { companyId: identity.companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      status: true,
      title: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return {
    tasks: tasks.map((t) => ({
      task_id: t.id,
      service: t.title.startsWith('[') ? t.title.slice(1, t.title.indexOf(']')) : t.title,
      status: mapTaskStatus(t.status),
      created_at: t.createdAt.toISOString(),
      completed_at: t.completedAt?.toISOString() ?? null,
    })),
    limit,
    offset,
    has_more: tasks.length === limit,
  };
});

function mapTaskStatus(internal: string): 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' {
  switch (internal) {
    case 'pending': return 'pending';
    case 'running': case 'in_progress': return 'running';
    case 'completed': case 'succeeded': return 'completed';
    case 'failed': case 'error': return 'failed';
    case 'cancelled': case 'canceled': return 'cancelled';
    default: return 'pending';
  }
}
