// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AgentTaskTimeoutError, createAgentTaskTimeout } from '@/lib/agent-runtime/timeout';
import { requestAbortSignal } from '@/lib/ai-router/provider-base';

describe('agent runtime cancellation and task deadlines', () => {
  it('aborts with an explicit task-timeout reason and disposes its deadline timer', async () => {
    const timeout = createAgentTaskTimeout(5);
    try {
      await new Promise<void>((resolve, reject) => {
        timeout.controller.signal.addEventListener('abort', () => resolve(), { once: true });
        setTimeout(() => reject(new Error('task deadline did not fire')), 250);
      });
      expect(timeout.controller.signal.aborted).toBe(true);
      expect(timeout.controller.signal.reason).toBeInstanceOf(AgentTaskTimeoutError);
      expect(timeout.controller.signal.reason.message).toMatch(/5 ms timeout/);
    } finally {
      timeout.dispose();
    }
  });

  it('propagates the task cancellation signal into provider requests', () => {
    const task = new AbortController();
    const requestSignal = requestAbortSignal({ signal: task.signal }, 60_000);
    const reason = new Error('task cancelled');
    task.abort(reason);
    expect(requestSignal.aborted).toBe(true);
    expect(requestSignal.reason).toBe(reason);
  });
});
