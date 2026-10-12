/**
 * AgentOS Run Pipeline — deterministic SUCCESS path.
 *
 * Verifies the full USER→COMMAND→ORCHESTRATOR→PLAN→AGENT→MODEL→RESULT→
 * MEMORY→QC→ARTIFACT→USER pipeline with a deterministic stub provider.
 * The stub stands in for the model layer only; planning is supplied
 * explicitly (options.plan), and routing/QC/memory/artifacts are the REAL
 * implementations (db is an in-memory fake).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fakeDb,
  stubExecute,
  routeTask,
  addEpisodic,
  publish,
  resetAgentOsMocks,
} from '../helpers/fake-db';

vi.mock('@/lib/db', () => ({ db: fakeDb.db }));

vi.mock('@/lib/memory', () => ({
  getMemoryStore: () => ({ addEpisodic }),
}));

vi.mock('@/lib/event-bus', () => ({
  getEventBus: () => ({ publish, subscribe: () => () => {}, getHistory: () => [] }),
}));

vi.mock('@/lib/orchestrator', () => ({
  getOrchestrator: () => ({ routeTask }),
}));

vi.mock('@/lib/agent-runtime', () => ({
  getExecutionEngine: () => ({ execute: stubExecute }),
}));

import { createRun, executeRun, getRunDetail, RUN_JOB_TYPE, RUN_QUEUE } from '@/lib/runs';

const PLAN = {
  strategy: 'llm' as const,
  reasoning: 'test plan',
  steps: [
    {
      id: 'step-1',
      title: 'Research UK universities',
      description: 'Research and rank UK universities for an HSC student.',
      agentHint: 'researcher',
      skills: ['web-research'],
      tools: ['web_search'],
      dependsOn: [],
    },
    {
      id: 'step-2',
      title: 'Write counselor report',
      description: 'Write the final counselor report based on the research.',
      agentHint: 'writer',
      skills: ['document-writing'],
      tools: [],
      dependsOn: ['step-1'],
    },
  ],
};

beforeEach(() => {
  resetAgentOsMocks();
  // The routed agent must resolve to a DB agent record.
  fakeDb.db.agent.create({
    data: { id: 'db-agent-1', agentId: 'AGENT-0001', name: 'Research Agent', status: 'active' },
  });
});

describe('AgentOS run pipeline (deterministic success path)', () => {
  it('createRun persists a queued run and enqueues a durable queue job', async () => {
    const { runId, status } = await createRun({
      objective: 'Research the best UK universities for an HSC student.',
      userId: 'user-1',
      companyId: 'company-1',
    });

    expect(status).toBe('queued');
    const run = fakeDb.rows('agentOSRun').find((r) => r.id === runId);
    expect(run).toBeTruthy();
    expect(run.status).toBe('queued');
    expect(run.objective).toContain('UK universities');

    const job = fakeDb.rows('queueItem')[0];
    expect(job).toBeTruthy();
    expect(job.jobType).toBe(RUN_JOB_TYPE);

    const queueMeta = fakeDb.rows('jobQueue')[0];
    expect(queueMeta?.name).toBe(RUN_QUEUE);

    // run.queued event persisted
    const queuedEvents = fakeDb.rows('runEvent').filter((e) => e.type === 'run.queued');
    expect(queuedEvents.length).toBe(1);
    expect(queuedEvents[0].runId).toBe(runId);
  });

  it('executeRun runs the full pipeline: plan → route → execute → QC → artifact → memory', async () => {
    const { runId } = await createRun({
      objective: 'Research the best UK universities and write a counselor report.',
      userId: 'user-1',
      companyId: 'company-1',
    });

    await executeRun(runId, { plan: PLAN as any });

    // Run completed
    const run = fakeDb.rows('agentOSRun').find((r) => r.id === runId)!;
    expect(run.status).toBe('completed');
    expect(run.summary).toContain('Completed 2/2 steps');
    expect(run.completedAt).toBeTruthy();
    const persistedPlan = JSON.parse(run.plan);
    expect(persistedPlan.steps.length).toBe(2);

    // Both steps produced tasks that completed
    const tasks = fakeDb.rows('task');
    expect(tasks.length).toBe(2);
    expect(tasks.every((t) => t.status === 'completed')).toBe(true);
    expect(tasks[0].agentId).toBe('db-agent-1');

    // TaskSteps completed with output
    const taskSteps = fakeDb.rows('taskStep');
    expect(taskSteps.length).toBe(2);
    expect(taskSteps.every((s) => s.status === 'completed')).toBe(true);
    expect(taskSteps[0].output).toContain('Research findings');

    // Stub provider was called once per step with the composed step input
    expect(stubExecute).toHaveBeenCalledTimes(2);
    const firstCallInput = stubExecute.mock.calls[0][0].task as string;
    expect(firstCallInput).toContain('OBJECTIVE:');
    expect(firstCallInput).toContain('STEP: Research UK universities');
    const secondCallInput = stubExecute.mock.calls[1][0].task as string;
    expect(secondCallInput).toContain('CONTEXT FROM PREVIOUS STEPS');

    // QC gate persisted a passing QualityAssessment per step
    const assessments = fakeDb.rows('qualityAssessment');
    expect(assessments.length).toBe(2);
    expect(assessments.every((a) => a.score >= 0.6)).toBe(true);

    // Run report artifact assembled (versioned + checksummed)
    const artifacts = fakeDb.rows('artifact');
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].type).toBe('report');
    expect(artifacts[0].checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(artifacts[0].version).toBe(1);
    expect(artifacts[0].content).toContain('Completed 2/2 steps');

    // Episodic memory write-back happened
    expect(addEpisodic).toHaveBeenCalledTimes(1);
    expect(addEpisodic.mock.calls[0][0].companyId).toBe('company-1');

    // Event bus published namespaced run lifecycle events (agentos.*)
    const publishedTypes = publish.mock.calls.map((c) => c[0]?.type);
    expect(publishedTypes).toContain('agentos.run.completed');
    expect(publishedTypes).toContain('agentos.plan.created');
    // Every bus event carries the runId as correlationId for SSE filtering
    const completedCall = publish.mock.calls.find((c) => c[0]?.type === 'agentos.run.completed');
    expect(completedCall?.[0]?.correlationId).toBe(runId);

    // Full persisted event sequence
    const events = fakeDb
      .rows('runEvent')
      .filter((e) => e.runId === runId)
      .map((e) => e.type);
    expect(events[0]).toBe('run.queued');
    expect(events).toContain('plan.created');
    expect(events).toContain('run.started');
    expect(events.filter((t) => t === 'agent.selected').length).toBe(2);
    expect(events.filter((t) => t === 'task.queued').length).toBe(2);
    expect(events.filter((t) => t === 'task.started').length).toBe(2);
    expect(events.filter((t) => t === 'model.selected').length).toBe(2);
    expect(events.filter((t) => t === 'qc.passed').length).toBe(2);
    expect(events.filter((t) => t === 'task.completed').length).toBe(2);
    expect(events).toContain('artifact.created');
    expect(events[events.length - 1]).toBe('run.completed');
    // No repairs needed on the happy path
    expect(events).not.toContain('repair.started');
    expect(events).not.toContain('qc.failed');
  });

  it('getRunDetail aggregates run, tasks, artifacts and events', async () => {
    const { runId } = await createRun({ objective: 'Do a thing.', userId: 'user-1', companyId: 'company-1' });
    await executeRun(runId, { plan: PLAN as any });

    const detail = await getRunDetail(runId);
    expect(detail.run.id).toBe(runId);
    expect(detail.run.status).toBe('completed');
    expect(detail.tasks.length).toBe(2);
    expect(detail.artifacts.length).toBe(1);
    expect(detail.events.length).toBeGreaterThan(10);
    expect(detail.events.some((e) => e.type === 'run.completed')).toBe(true);
  });

  it('fails honestly when no agent is available for the step', async () => {
    resetAgentOsMocks(); // no agent record seeded
    const { runId } = await createRun({ objective: 'Multi-step objective.', userId: 'user-1', companyId: 'company-1' });

    await executeRun(runId, { plan: PLAN as any });

    const run = fakeDb.rows('agentOSRun').find((r) => r.id === runId)!;
    expect(run.status).toBe('failed');
    const events = fakeDb.rows('runEvent').map((e) => e.type);
    expect(events).toContain('task.failed');
    expect(events).toContain('run.failed');
  });
});
