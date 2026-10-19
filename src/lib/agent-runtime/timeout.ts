export class AgentTaskTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Agent task exceeded its ${timeoutMs} ms timeout.`);
    this.name = 'AgentTaskTimeoutError';
  }
}

export interface AgentTaskTimeout {
  controller: AbortController;
  dispose(): void;
}

/** Create one deadline signal for a task and clear its timer on every exit path. */
export function createAgentTaskTimeout(timeoutMs: number, controller = new AbortController()): AgentTaskTimeout {
  const boundedTimeout = Number.isFinite(timeoutMs) ? Math.max(1, Math.floor(timeoutMs)) : 1;
  const timer = setTimeout(() => controller.abort(new AgentTaskTimeoutError(boundedTimeout)), boundedTimeout);
  timer.unref?.();
  return { controller, dispose: () => clearTimeout(timer) };
}

/** Preserve timeout/cancellation reasons rather than converting them into successes. */
export function throwIfAgentTaskAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error('Agent task was cancelled.');
}
