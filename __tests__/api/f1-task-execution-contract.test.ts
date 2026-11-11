import { describe, it, expect } from 'vitest';
import { publicTaskResponse, containsLeakyFields } from '@/lib/api/public-response';

/**
 * F1: AI task execution — response contract.
 *
 * The /v1/ai/tasks POST endpoint now enqueues a durable run via createRun().
 * These tests verify the public response contract: the response contains an
 * opaque task_id, a service, a status, and NEVER leaks internal agent/model/
 * run identifiers. The actual enqueue is exercised in the integration test.
 */

describe('F1: Public task response contract', () => {
  it('produces a response with an opaque task_id (not an internal runId)', () => {
    const res = publicTaskResponse({
      requestId: 'req-1',
      taskId: 'task-abc-123',
      service: 'ai-tasks',
      status: 'pending',
      usageUnits: 1,
      createdAt: '2026-11-11T00:00:00Z',
    });
    expect(res.task_id).toBe('task-abc-123');
    expect(res.task_id).not.toMatch(/^run_/); // never an internal runId
  });

  it('does not leak agentId, model, runId, or routing in the response', () => {
    const res = publicTaskResponse({
      requestId: 'req-1',
      taskId: 'task-abc-123',
      service: 'ai-tasks',
      status: 'completed',
      result: { summary: 'Done', output: { agentId: 'AGENT-0001', model: 'gpt-4', runId: 'run_x', score: 42 } },
      usageUnits: 1,
      createdAt: '2026-11-11T00:00:00Z',
      completedAt: '2026-11-11T00:01:00Z',
    });
    // The leaky fields in the output MUST be stripped by the sanitizer.
    expect(containsLeakyFields(res)).toEqual([]);
    expect(JSON.stringify(res)).not.toMatch(/AGENT-0001|gpt-4|run_x/);
  });

  it('returns status "pending" for a newly-accepted task (not "completed")', () => {
    // F1: a task is enqueued, not executed synchronously. The response must
    // report 'pending' (or 'running' once the queue picks it up), never
    // 'completed' for an unexecuted task.
    const res = publicTaskResponse({
      requestId: 'req-1',
      taskId: 'task-new',
      service: 'ai-tasks',
      status: 'pending',
      usageUnits: 1,
      createdAt: '2026-11-11T00:00:00Z',
    });
    expect(res.status).toBe('pending');
  });

  it('includes a request_id for correlation', () => {
    const res = publicTaskResponse({
      requestId: 'req-correlation-1',
      taskId: 'task-1',
      service: 'ai-tasks',
      status: 'pending',
      usageUnits: 1,
      createdAt: '2026-11-11T00:00:00Z',
    });
    expect(res.request_id).toBe('req-correlation-1');
  });

  it('includes usage units (never internal token counts)', () => {
    const res = publicTaskResponse({
      requestId: 'req-1',
      taskId: 'task-1',
      service: 'ai-tasks',
      status: 'completed',
      usageUnits: 5,
      createdAt: '2026-11-11T00:00:00Z',
      completedAt: '2026-11-11T00:01:00Z',
    });
    expect(res.usage.units).toBe(5);
    // Never expose raw token counts (those are internal model details).
    expect(containsLeakyFields(res.usage)).toEqual([]);
  });
});
