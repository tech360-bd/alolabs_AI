// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { orchestrate, type RunPort, type ChildResult, type ChildStatus } from '@/lib/orchestration/coordinator';
import { buildOrchestrationPlan, planSubtasks, type AgentDescriptor, type Subtask } from '@/lib/orchestration/plan';
import { classifyInstruction } from '@/lib/super-admin/operator';

/**
 * Multi-agent fan-out — the integration test that has to fail if the product is
 * lying about running several agents.
 *
 * A scripted port stands in for the run engine: it decides when a child finishes
 * and with what summary, and it records the exact interleaving. The assertions are
 * about that interleaving — overlapping execution, dependency ordering, retry,
 * cancellation cascading to live children, and reconciliation — not about statuses
 * a coordinator could print without doing anything.
 */

const agent = (overrides: Partial<AgentDescriptor> & Pick<AgentDescriptor, 'id' | 'capabilities'>): AgentDescriptor => ({
  name: overrides.id,
  kind: 'analysis',
  tools: [],
  health: 'available',
  maxConcurrency: 1,
  tenantScope: 'platform',
  version: '1',
  resourceBudget: { tokensPerRun: 10_000, minutesPerRun: 5 },
  ...overrides,
});

interface Script {
  /** Terminal result per child, by subtask id. May be a function of the attempt. */
  results: Record<string, ChildResult | ((attempt: number) => ChildResult)>;
  /** Milliseconds each child stays "running" before the terminal result shows. */
  durationMs?: number;
}

/** A port that models the engine: children are created, then finish after a delay. */
function scriptedPort(script: Script) {
  const startedAt = new Map<string, number>();
  /** childRunId → subtaskId. (A subtask id contains '-', so splitting an id is a bug.) */
  const subtaskOf = new Map<string, string>();
  const attempts = new Map<string, number>();
  const created: { subtaskId: string; childRunId: string; agentId: string; parentRunId: string }[] = [];
  const cancelled: string[] = [];
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const active = new Set<string>();
  let maxConcurrent = 0;
  let parentStopped = false;
  const order: string[] = [];

  const port: RunPort = {
    async createChild({ parentRunId, subtask, agent: assigned }) {
      const childRunId = `child-${subtask.id}-${(attempts.get(subtask.id) ?? 0) + 1}`;
      // A child of a cancelled parent is never started.
      if (parentStopped) throw new Error('parent stopped');
      attempts.set(subtask.id, (attempts.get(subtask.id) ?? 0) + 1);
      startedAt.set(childRunId, Date.now());
      subtaskOf.set(childRunId, subtask.id);
      active.add(childRunId);
      maxConcurrent = Math.max(maxConcurrent, active.size);
      order.push(subtask.id);
      created.push({ subtaskId: subtask.id, childRunId, agentId: assigned.id, parentRunId });
      events.push({ type: 'child.created', data: { subtaskId: subtask.id, agentId: assigned.id } });
      return childRunId;
    },
    async status(childRunId): Promise<ChildResult> {
      const subtaskId = subtaskOf.get(childRunId) ?? childRunId;
      const attempt = attempts.get(subtaskId) ?? 1;
      const entry = script.results[subtaskId];
      const result: ChildResult =
        typeof entry === 'function' ? entry(attempt) : (entry ?? { status: 'completed', summary: `${subtaskId} done` });
      const elapsed = Date.now() - (startedAt.get(childRunId) ?? Date.now());
      const duration = script.durationMs ?? 40;
      if (result.status === 'completed' && elapsed < duration) return { status: 'running' };
      active.delete(childRunId);
      return result;
    },
    async cancel(childRunId) {
      cancelled.push(childRunId);
      active.delete(childRunId);
    },
    async parentStopped() {
      return parentStopped;
    },
    async emit(_parentRunId, type, data) {
      events.push({ type, data });
    },
  };

  return {
    port,
    created,
    cancelled,
    events,
    order,
    get maxConcurrent() {
      return maxConcurrent;
    },
    stopParent() {
      parentStopped = true;
    },
  };
}

function subtask(id: string, overrides: Partial<Subtask> = {}): Subtask {
  return {
    id,
    title: `Task ${id}`,
    instruction: `Do ${id}`,
    requiredCapabilities: ['analysis'],
    scope: 'read-only',
    dependsOn: [],
    ...overrides,
  };
}

describe('multi-agent fan-out', () => {
  it('runs independent subtasks concurrently on different agents', async () => {
    const agents = [
      agent({ id: 'a1', capabilities: ['analysis'], name: 'Analyst' }),
      agent({ id: 'a2', capabilities: ['analysis'], name: 'Reviewer' }),
    ];
    const assignments = new Map([
      ['sub-1', agents[0]],
      ['sub-2', agents[1]],
    ]);
    const scripted = scriptedPort({
      durationMs: 60,
      results: {
        'sub-1': { status: 'completed', summary: 'sub-1: nothing found' },
        'sub-2': { status: 'completed', summary: 'sub-2: one advisory' },
      },
    });

    const result = await orchestrate({
      parentRunId: 'parent-1',
      subtasks: [subtask('sub-1'), subtask('sub-2')],
      agents,
      assignments,
      port: scripted.port,
      concurrency: 2,
      pollIntervalMs: 10,
    });

    expect(result.outcome).toBe('completed');
    // Two children were created, for two different agents…
    expect(scripted.created).toHaveLength(2);
    expect(new Set(scripted.created.map((entry) => entry.agentId))).toEqual(new Set(['a1', 'a2']));
    // …and they overlapped in time: real fan-out, not a loop.
    expect(scripted.maxConcurrent).toBe(2);
    // Both summaries survive into the reconciliation.
    expect(result.children.every((child) => child.status === 'completed')).toBe(true);
    expect(result.verdict).toMatch(/2\/2 subtasks completed/);
  });

  it('never exceeds the concurrency limit even when more work is ready', async () => {
    const agents = [agent({ id: 'a1', capabilities: ['analysis'] })];
    const assignments = new Map(['sub-1', 'sub-2', 'sub-3'].map((id) => [id, agents[0]]));
    const scripted = scriptedPort({ durationMs: 40, results: {} });

    const result = await orchestrate({
      parentRunId: 'parent-2',
      subtasks: [subtask('sub-1'), subtask('sub-2'), subtask('sub-3')],
      agents,
      assignments,
      port: scripted.port,
      concurrency: 1,
      pollIntervalMs: 10,
    });

    expect(result.outcome).toBe('completed');
    expect(scripted.maxConcurrent).toBe(1);
    expect(scripted.order).toEqual(['sub-1', 'sub-2', 'sub-3']);
  });

  it('respects dependency ordering', async () => {
    const agents = [agent({ id: 'a1', capabilities: ['analysis'] })];
    const assignments = new Map([
      ['sub-1', agents[0]],
      ['sub-2', agents[0]],
    ]);
    const scripted = scriptedPort({ durationMs: 20, results: {} });

    await orchestrate({
      parentRunId: 'parent-3',
      subtasks: [subtask('sub-1'), subtask('sub-2', { dependsOn: ['sub-1'] })],
      agents,
      assignments,
      port: scripted.port,
      concurrency: 2,
      pollIntervalMs: 10,
    });

    // sub-2 is only started after sub-1 completed, even with free slots.
    expect(scripted.order).toEqual(['sub-1', 'sub-2']);
    expect(scripted.maxConcurrent).toBe(1);
  });

  it('retries a recoverable failure and records both attempts', async () => {
    const agents = [agent({ id: 'a1', capabilities: ['analysis'] })];
    const assignments = new Map([['sub-1', agents[0]]]);
    const scripted = scriptedPort({
      durationMs: 10,
      results: {
        'sub-1': (attempt) => (attempt === 1 ? { status: 'failed', error: 'provider timeout', retryable: true } : { status: 'completed', summary: 'sub-1: recovered' }),
      },
    });

    const result = await orchestrate({
      parentRunId: 'parent-4',
      subtasks: [subtask('sub-1')],
      agents,
      assignments,
      port: scripted.port,
      concurrency: 1,
      pollIntervalMs: 10,
      maxAttempts: 2,
    });

    expect(result.outcome).toBe('completed');
    expect(scripted.created).toHaveLength(2);
    expect(result.children[0].attempts).toBe(1);
    expect(scripted.events.some((event) => event.type === 'run.fanout.child_retry')).toBe(true);
  });

  it('does not retry a non-retryable failure', async () => {
    const agents = [agent({ id: 'a1', capabilities: ['analysis'] })];
    const assignments = new Map([['sub-1', agents[0]]]);
    const scripted = scriptedPort({
      durationMs: 10,
      results: { 'sub-1': { status: 'failed', error: 'tenant mismatch', retryable: false } },
    });

    const result = await orchestrate({
      parentRunId: 'parent-5',
      subtasks: [subtask('sub-1')],
      agents,
      assignments,
      port: scripted.port,
      concurrency: 1,
      pollIntervalMs: 10,
    });

    expect(result.outcome).toBe('failed');
    expect(scripted.created).toHaveLength(1);
    expect(result.verdict).toMatch(/did not complete/);
  });

  it('fails a subtask with no agent instead of pretending it ran', async () => {
    const agents = [agent({ id: 'a1', capabilities: ['analysis'] })];
    const scripted = scriptedPort({ results: {} });

    const result = await orchestrate({
      parentRunId: 'parent-6',
      subtasks: [subtask('sub-1', { requiredCapabilities: ['browser'] })],
      agents,
      assignments: new Map(),
      port: scripted.port,
      concurrency: 1,
      pollIntervalMs: 10,
    });

    expect(result.outcome).toBe('failed');
    expect(scripted.created).toHaveLength(0);
    expect(scripted.events.some((event) => event.type === 'run.fanout.unassigned')).toBe(true);
  });

  it('cancels live children when the parent is cancelled', async () => {
    const agents = [agent({ id: 'a1', capabilities: ['analysis'] })];
    const assignments = new Map(['sub-1', 'sub-2'].map((id) => [id, agents[0]]));
    const scripted = scriptedPort({
      durationMs: 5_000, // children would run for a long time
      results: {},
    });

    // Stop the parent as soon as the first child has been created.
    const originalCreate = scripted.port.createChild;
    let stopped = false;
    scripted.port.createChild = async (input) => {
      const id = await originalCreate(input);
      if (!stopped) {
        stopped = true;
        scripted.stopParent();
      }
      return id;
    };

    const result = await orchestrate({
      parentRunId: 'parent-7',
      subtasks: [subtask('sub-1'), subtask('sub-2')],
      agents,
      assignments,
      port: scripted.port,
      concurrency: 2,
      pollIntervalMs: 10,
    });

    expect(result.outcome).toBe('cancelled');
    expect(scripted.cancelled.length).toBeGreaterThan(0);
    expect(scripted.events.some((event) => event.type === 'run.fanout.child_cancelled')).toBe(true);
    expect(result.verdict).toMatch(/Cancelled with/);
  });

  it('rejects contradictory outputs instead of merging them', async () => {
    const agents = [
      agent({ id: 'a1', capabilities: ['analysis'] }),
      agent({ id: 'a2', capabilities: ['analysis'] }),
    ];
    const assignments = new Map([
      ['sub-1', agents[0]],
      ['sub-2', agents[1]],
    ]);
    const scripted = scriptedPort({
      durationMs: 10,
      results: {
        'sub-1': { status: 'completed', summary: 'sub-1: all tests pass' },
        // Completed, but the output admits it could not do the work.
        'sub-2': { status: 'completed', summary: 'sub-2: could not open the page' },
      },
    });

    const result = await orchestrate({
      parentRunId: 'parent-8',
      subtasks: [subtask('sub-1'), subtask('sub-2')],
      agents,
      assignments,
      port: scripted.port,
      concurrency: 2,
      pollIntervalMs: 10,
    });

    expect(result.outcome).toBe('failed');
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0]).toMatch(/sub-2/);
  });

  it('times out a child that never finishes and cancels it', async () => {
    const agents = [agent({ id: 'a1', capabilities: ['analysis'] })];
    const assignments = new Map([['sub-1', agents[0]]]);
    const scripted = scriptedPort({ durationMs: 10_000, results: { 'sub-1': { status: 'running' as ChildStatus } } });

    const result = await orchestrate({
      parentRunId: 'parent-9',
      subtasks: [subtask('sub-1')],
      agents,
      assignments,
      port: scripted.port,
      concurrency: 1,
      pollIntervalMs: 10,
      childTimeoutMs: 60,
    });

    expect(result.outcome).toBe('failed');
    expect(result.children[0].status).toBe('timed_out');
    expect(scripted.cancelled).toContain('child-sub-1-1');
  });
});

describe('orchestration planning', () => {
  it('splits an intent plan into dependent, capability-tagged subtasks', () => {
    const plan = classifyInstruction('Review https://github.com/owner/repo for security issues');
    const subtasks = planSubtasks('Review the repository', plan);

    expect(subtasks.length).toBe(plan.steps.length);
    expect(subtasks[0].requiredCapabilities).toContain('repository');
    expect(subtasks.every((entry) => entry.instruction.includes('Review the repository'))).toBe(true);
    // Later steps depend on earlier ones: source review cannot precede resolution.
    expect(subtasks[1].dependsOn.length).toBeGreaterThan(0);
  });

  it('assigns the healthiest capable agent and explains an empty assignment', () => {
    const agents = [
      agent({ id: 'browser-agent', capabilities: ['browser'] }),
      agent({ id: 'analysis-agent', capabilities: ['analysis'] }),
      agent({ id: 'coding-agent', capabilities: ['coding', 'testing'], health: 'unavailable' }),
    ];
    const plan = buildOrchestrationPlan(
      'Run the tests and fix the failures',
      classifyInstruction('Run the tests and fix the failures'),
      agents,
    );

    // The coding agent is the only one with `coding`+`testing`, and it is unhealthy.
    const unassigned = plan.assignments.filter((assignment) => assignment.agent === null);
    expect(unassigned.length).toBeGreaterThan(0);
    expect(unassigned[0].reason).toMatch(/healthy|advertises/);
    expect(plan.notes.length).toBeGreaterThan(0);
  });

  it('serialises two subtasks that write the same scope', () => {
    const plan = classifyInstruction('Fix the build');
    const agents = [agent({ id: 'a1', capabilities: ['coding', 'testing', 'analysis'] })];
    const built = buildOrchestrationPlan('Fix the build', plan, agents);
    const writes = built.assignments.filter((assignment) => assignment.subtask.scope !== 'read-only');
    for (let index = 1; index < writes.length; index += 1) {
      expect(writes[index].subtask.dependsOn.length).toBeGreaterThan(0);
    }
  });
});
