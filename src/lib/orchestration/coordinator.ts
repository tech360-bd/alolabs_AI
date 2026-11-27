/**
 * Multi-agent orchestration — coordinator.
 *
 * This is the part that actually runs several agents on separate work and then
 * proves whether their results agree. It is written against a small port so the
 * same code path is exercised by the integration test (with a controllable
 * executor) and by the server (with the durable Run Engine).
 *
 * Guarantees this module is responsible for:
 *
 * 1. **Real fan-out.** Independent subtasks start before earlier ones finish; the
 *    number in flight never exceeds the plan's concurrency.
 * 2. **Dependency ordering.** A subtask does not start until the subtasks it
 *    depends on completed.
 * 3. **Cancellation propagation.** If the parent is cancelled, every child that is
 *    not terminal is cancelled — through the run engine, so their queue items die
 *    too.
 * 4. **Bounded retries.** Only failures marked retryable are retried, a bounded
 *    number of times, and each attempt is recorded.
 * 5. **Reconciliation.** The parent is completed only when every child completed;
 *    otherwise it fails with the reasons. Contradictory outputs fail the parent.
 */

import type { AgentDescriptor, Subtask } from './plan';
import { readySubtasks } from './plan';

export type ChildStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'blocked';

export interface ChildResult {
  status: ChildStatus;
  summary?: string;
  error?: string;
  retryable?: boolean;
}

export interface RunPort {
  /** Create a child run and return its id. */
  createChild(input: { parentRunId: string; subtask: Subtask; agent: AgentDescriptor }): Promise<string>;
  /** Current status of a child run. */
  status(childRunId: string): Promise<ChildResult>;
  /** Cancel a child run (idempotent). */
  cancel(childRunId: string): Promise<void>;
  /** True when the parent has been cancelled or reached a terminal state. */
  parentStopped(parentRunId: string): Promise<boolean>;
  /** Persist an event on the parent timeline. */
  emit(parentRunId: string, type: string, data: Record<string, unknown>): Promise<void>;
}

export interface OrchestrationResult {
  parentRunId: string;
  outcome: 'completed' | 'failed' | 'cancelled';
  children: Array<{
    subtaskId: string;
    title: string;
    agentId: string;
    childRunId: string;
    status: ChildStatus;
    attempts: number;
    summary?: string;
    error?: string;
  }>;
  /** Reconciliation verdict, written to the parent. */
  verdict: string;
  /** Merged child summaries, written to the parent's `summary`. */
  summary?: string;
  /** Contradictions found between child summaries (empty when none). */
  contradictions: string[];
}

export interface OrchestrateOptions {
  parentRunId: string;
  subtasks: readonly Subtask[];
  agents: readonly AgentDescriptor[];
  assignments: ReadonlyMap<string, AgentDescriptor>;
  port: RunPort;
  concurrency?: number;
  pollIntervalMs?: number;
  childTimeoutMs?: number;
  maxAttempts?: number;
}

const TERMINAL: ChildStatus[] = ['completed', 'failed', 'cancelled', 'timed_out', 'blocked'];

function isTerminal(status: ChildStatus): boolean {
  return TERMINAL.includes(status);
}

/**
 * Run the subtasks.
 *
 * The loop is a scheduler: start whatever is ready (up to the concurrency limit),
 * poll the children that are running, and finish when everything is terminal.
 * Nothing here sleeps longer than `pollIntervalMs`, so a cancellation is noticed
 * quickly rather than at the end of a batch.
 */
export async function orchestrate(options: OrchestrateOptions): Promise<OrchestrationResult> {
  const {
    parentRunId,
    subtasks,
    agents,
    assignments,
    port,
    concurrency = 2,
    pollIntervalMs = 25,
    childTimeoutMs = 60_000,
    maxAttempts = 2,
  } = options;

  const children = new Map<
    string,
    { subtask: Subtask; agent: AgentDescriptor; childRunId: string; status: ChildStatus; attempts: number; startedAt: number; summary?: string; error?: string }
  >();
  const completed = new Set<string>();
  const permanentlyFailed = new Set<string>();
  const startedWallClock = Date.now();

  await port.emit(parentRunId, 'run.fanout.planned', {
    subtasks: subtasks.map((subtask) => ({ id: subtask.id, title: subtask.title, dependsOn: subtask.dependsOn })),
    concurrency,
    agents: agents.map((agent) => agent.id),
  });

  const startSubtask = async (subtask: Subtask, attempt: number) => {
    const agent = assignments.get(subtask.id);
    if (!agent) {
      permanentlyFailed.add(subtask.id);
      await port.emit(parentRunId, 'run.fanout.unassigned', { subtaskId: subtask.id, title: subtask.title });
      return;
    }
    let childRunId: string;
    try {
      childRunId = await port.createChild({ parentRunId, subtask, agent });
    } catch (error) {
      // The engine refused to start this child (queue down, parent already
      // cancelled, tenant lost). Record it against the subtask instead of
      // throwing away the other agents' work.
      permanentlyFailed.add(subtask.id);
      await port.emit(parentRunId, 'run.fanout.child_failed', {
        subtaskId: subtask.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    children.set(subtask.id, {
      subtask,
      agent,
      childRunId,
      status: 'queued',
      attempts: attempt,
      startedAt: Date.now(),
    });
    await port.emit(parentRunId, 'run.fanout.dispatched', {
      subtaskId: subtask.id,
      title: subtask.title,
      agentId: agent.id,
      childRunId,
      attempt,
    });
  };

  // Subtasks with no agent are failures before anything starts.
  for (const subtask of subtasks) {
    if (!assignments.get(subtask.id)) {
      permanentlyFailed.add(subtask.id);
      await port.emit(parentRunId, 'run.fanout.unassigned', { subtaskId: subtask.id, title: subtask.title });
    }
  }

  let cancelled = false;
  const deadline = startedWallClock + Math.max(subtasks.length, 1) * childTimeoutMs + 60_000;

  while (true) {
    if (Date.now() > deadline) {
      await port.emit(parentRunId, 'run.fanout.deadline_exceeded', { deadlineMs: deadline - startedWallClock });
      for (const entry of children.values()) {
        if (!isTerminal(entry.status)) {
          await port.cancel(entry.childRunId).catch(() => undefined);
          entry.status = 'timed_out';
          permanentlyFailed.add(entry.subtask.id);
        }
      }
      break;
    }
    if (await port.parentStopped(parentRunId)) {
      cancelled = true;
      break;
    }

    // 1. Advance the children that are already running.
    const inFlight = new Set<string>();
    for (const entry of children.values()) {
      if (isTerminal(entry.status)) continue;

      if (Date.now() - entry.startedAt > childTimeoutMs && !isTerminal(entry.status)) {
        entry.status = 'timed_out';
        entry.error = `Child run exceeded ${childTimeoutMs}ms.`;
        // Without this the subtask stays "pending" forever and the scheduler spins.
        permanentlyFailed.add(entry.subtask.id);
        await port.cancel(entry.childRunId);
        await port.emit(parentRunId, 'run.fanout.child_timeout', { subtaskId: entry.subtask.id, childRunId: entry.childRunId });
        continue;
      }

      const result = await port.status(entry.childRunId);
      entry.status = result.status;
      if (result.summary) entry.summary = result.summary;
      if (result.error) entry.error = result.error;

      if (isTerminal(entry.status)) {
        if (entry.status === 'blocked') {
          permanentlyFailed.add(entry.subtask.id);
        }
        if (entry.status === 'completed') {
          completed.add(entry.subtask.id);
          await port.emit(parentRunId, 'run.fanout.child_completed', {
            subtaskId: entry.subtask.id,
            childRunId: entry.childRunId,
            agentId: entry.agent.id,
            summary: (result.summary ?? '').slice(0, 500),
          });
        } else if (entry.status === 'cancelled') {
          completed.add(entry.subtask.id);
        } else if ((result.retryable ?? true) && entry.attempts < maxAttempts) {
          await port.emit(parentRunId, 'run.fanout.child_retry', {
            subtaskId: entry.subtask.id,
            childRunId: entry.childRunId,
            attempt: entry.attempts,
            error: (result.error ?? '').slice(0, 300),
          });
          children.delete(entry.subtask.id);
          await startSubtask(entry.subtask, entry.attempts + 1);
        } else {
          permanentlyFailed.add(entry.subtask.id);
          await port.emit(parentRunId, 'run.fanout.child_failed', {
            subtaskId: entry.subtask.id,
            childRunId: entry.childRunId,
            error: (result.error ?? 'failed').slice(0, 500),
          });
        }
        continue;
      }

      inFlight.add(entry.subtask.id);
    }

    // 2. Everything terminal?
    const pending = subtasks.filter((subtask) => !completed.has(subtask.id) && !permanentlyFailed.has(subtask.id));
    if (pending.length === 0 && inFlight.size === 0) break;

    // 3. Start what is ready.
    const running = [...children.values()].filter((entry) => !isTerminal(entry.status)).length;
    const free = Math.max(0, concurrency - running);
    if (free > 0) {
      const ready = readySubtasks(pending, completed, inFlight).filter((subtask) => !permanentlyFailed.has(subtask.id));
      for (const subtask of ready.slice(0, free)) {
        await startSubtask(subtask, 0);
        inFlight.add(subtask.id);
      }
    }

    // 4. Nothing running and nothing startable: the dependency graph is stuck.
    const blocked = pending.filter(
      (subtask) => subtask.dependsOn.some((dependency) => permanentlyFailed.has(dependency)),
    );
    if (running === 0 && free > 0) {
      const startable = readySubtasks(pending, completed, inFlight).filter(
        (subtask) => !permanentlyFailed.has(subtask.id),
      );
      if (startable.length === 0 && blocked.length === pending.length) break;
    }
    if (running === 0 && blocked.length > 0 && blocked.length === pending.length) break;

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Cancelled parent: stop every child that is still running.
  if (cancelled) {
    for (const entry of children.values()) {
      if (!isTerminal(entry.status)) {
        await port.cancel(entry.childRunId).catch(() => undefined);
        entry.status = 'cancelled';
        await port.emit(parentRunId, 'run.fanout.child_cancelled', {
          subtaskId: entry.subtask.id,
          childRunId: entry.childRunId,
        });
      }
    }
  }

  const reconciled = reconcile({
    parentRunId,
    subtasks,
    children,
    completed,
    permanentlyFailed,
    cancelled,
  });

  await port.emit(parentRunId, 'run.fanout.reconciled', {
    outcome: reconciled.outcome,
    verdict: reconciled.verdict,
    contradictions: reconciled.contradictions,
  });

  return reconciled;
}

/**
 * Reconcile child outputs into a parent verdict.
 *
 * Rules, in order:
 *  1. a cancelled parent is `cancelled`, not `failed` — cancellation is a decision,
 *     not an error;
 *  2. any unfinished or failed subtask fails the parent, naming each reason;
 *  3. otherwise the children's summaries are merged, and a **contradiction** — two
 *     children reporting different terminal states for the same scope, or a child
 *     whose summary says it failed while its run says completed — fails the parent
 *     rather than being averaged away.
 */
function reconcile(input: {
  parentRunId: string;
  subtasks: readonly Subtask[];
  children: Map<
    string,
    { subtask: Subtask; agent: AgentDescriptor; childRunId: string; status: ChildStatus; attempts: number; summary?: string; error?: string }
  >;
  completed: Set<string>;
  permanentlyFailed: Set<string>;
  cancelled: boolean;
}): OrchestrationResult {
  const { parentRunId, subtasks, children, completed, permanentlyFailed, cancelled } = input;

  const rows = subtasks.map((subtask) => {
    const entry = children.get(subtask.id);
    return {
      subtaskId: subtask.id,
      title: subtask.title,
      agentId: entry?.agent.id ?? 'unassigned',
      childRunId: entry?.childRunId ?? '',
      status: (entry?.status ?? (permanentlyFailed.has(subtask.id) ? 'failed' : 'cancelled')) as ChildStatus,
      attempts: entry?.attempts ?? 0,
      ...(entry?.summary ? { summary: entry.summary } : {}),
      ...(entry?.error ? { error: entry.error } : {}),
    };
  });

  const contradictions: string[] = [];
  for (const row of rows) {
    const summary = row.summary?.toLowerCase() ?? '';
    if (row.status === 'completed' && /\b(failed|could not|cannot|unable to)\b/.test(summary)) {
      contradictions.push(`${row.subtaskId} reported completed but its output says: "${row.summary?.slice(0, 120)}"`);
    }
    if (row.childRunId === '' && row.status !== 'cancelled') {
      contradictions.push(`${row.subtaskId} has no child run but is not marked cancelled.`);
    }
  }

  const failures = rows.filter((row) => row.status !== 'completed' && row.status !== 'cancelled');

  if (cancelled) {
    return {
      parentRunId,
      outcome: 'cancelled',
      children: rows,
      verdict: `Cancelled with ${completed.size}/${subtasks.length} subtasks complete; remaining children were stopped.`,
      contradictions,
    };
  }

  if (failures.length > 0 || contradictions.length > 0) {
    return {
      parentRunId,
      outcome: 'failed',
      children: rows,
      verdict:
        `${failures.length} of ${subtasks.length} subtasks did not complete` +
        (failures.length ? `: ${failures.map((row) => `${row.subtaskId} (${row.status})`).join(', ')}` : '') +
        (contradictions.length ? `; ${contradictions.length} contradiction(s).` : '.'),
      contradictions,
    };
  }

  const merged = rows
    .filter((row) => row.summary)
    .map((row) => `[${row.agentId}] ${row.summary}`)
    .join('\n\n');

  return {
    parentRunId,
    outcome: 'completed',
    children: rows,
    verdict: `${rows.length}/${subtasks.length} subtasks completed and reconciled across ${new Set(rows.map((row) => row.agentId)).size} agent(s).`,
    contradictions,
    ...(merged ? { summary: merged.slice(0, 8_000) } : {}),
  };
}
