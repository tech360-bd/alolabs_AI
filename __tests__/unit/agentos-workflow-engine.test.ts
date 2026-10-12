/**
 * AgentOS Workflow Engine — persisted workflow runs through the run pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb, stubExecute, routeTask, addEpisodic, publish, resetAgentOsMocks } from '../helpers/fake-db';

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

import { runWorkflow, executeWorkflowRun, getWorkflowRun, substituteTemplate } from '@/lib/workflow-engine';

beforeEach(() => {
  resetAgentOsMocks();
  fakeDb.db.agent.create({
    data: { id: 'db-agent-1', agentId: 'AGENT-0001', name: 'Research Agent', status: 'active' },
  });
  fakeDb.db.workflow.create({
    data: {
      id: 'wf-1',
      name: 'UK Research',
      slug: 'uk-research',
      status: 'active',
      triggers: '[]',
    },
  });
  fakeDb.db.workflowStep.create({
    data: {
      id: 'ws-1',
      workflowId: 'wf-1',
      stepNumber: 1,
      action: 'Research UK universities for {{student}}',
      agentId: 'AGENT-0001',
      config: '{}',
    },
  });
  fakeDb.db.workflowStep.create({
    data: {
      id: 'ws-2',
      workflowId: 'wf-1',
      stepNumber: 2,
      action: 'Write counselor report',
      agentId: 'AGENT-0001',
      config: '{}',
    },
  });
});

describe('substituteTemplate', () => {
  it('replaces {{var}} placeholders', () => {
    expect(substituteTemplate('Hello {{name}}, welcome to {{place}}!', { name: 'Amin', place: 'ALO' }))
      .toBe('Hello Amin, welcome to ALO!');
  });

  it('leaves unknown placeholders intact', () => {
    expect(substituteTemplate('Hi {{unknown}}', {})).toBe('Hi {{unknown}}');
  });
});

describe('runWorkflow', () => {
  it('creates a WorkflowRun + AgentOSRun, enqueues a job, and returns ids', async () => {
    const result = await runWorkflow('wf-1', {
      input: { student: 'Student #123' },
      companyId: 'company-1',
      userId: 'user-1',
    });

    expect(result.runId).toBeTruthy();
    expect(result.workflowRunId).toBeTruthy();
    expect(result.status).toBe('queued');

    const wfRun = fakeDb.rows('workflowRun').find((r) => r.id === result.workflowRunId);
    expect(wfRun).toBeTruthy();
    expect(wfRun.status).toBe('running');

    // The persisted plan substituted the workflow input
    const run = fakeDb.rows('agentOSRun').find((r) => r.id === result.runId)!;
    const plan = JSON.parse(run.plan);
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0].description).toContain('Student #123');
    // Step 2 depends on step 1
    expect(plan.steps[1].dependsOn).toEqual([plan.steps[0].id]);

    // Durable queue job enqueued
    const job = fakeDb.rows('queueItem')[0];
    expect(job).toBeTruthy();
    expect(job.jobType).toBe('agentos.workflow');
  });

  it('executeWorkflowRun executes inline and finalizes the WorkflowRun', async () => {
    const result = await runWorkflow('wf-1', {
      input: { student: 'Student #123' },
      companyId: 'company-1',
      userId: 'user-1',
    });

    // Queue-worker path: plan is loaded from the run record (not passed in).
    await executeWorkflowRun(result.runId, result.workflowRunId);

    const wfRun = fakeDb.rows('workflowRun').find((r) => r.id === result.workflowRunId)!;
    expect(wfRun.status).toBe('completed');
    expect(wfRun.completedAt).toBeTruthy();
    const run = fakeDb.rows('agentOSRun').find((r) => r.id === result.runId)!;
    expect(run.status).toBe('completed');
    // Container task + one pipeline task per workflow step
    const tasks = fakeDb.rows('task');
    expect(tasks.length).toBe(3); // 1 container + 2 executed
    const executed = tasks.filter((t) => t.id !== undefined && t.workflowId === 'wf-1' && t.agentId);
    expect(executed.length).toBe(2);
    expect(executed.every((t) => t.status === 'completed')).toBe(true);
    // WorkflowRun output aggregates the executed steps
    const output = JSON.parse(wfRun.output);
    expect(output.status).toBe('completed');
    expect(output.steps.length).toBe(2);
    expect(output.steps.every((s: { status: string }) => s.status === 'completed')).toBe(true);
    // Artifact assembled
    expect(fakeDb.rows('artifact').length).toBe(1);
  });

  it('getWorkflowRun aggregates workflow run state', async () => {
    const result = await runWorkflow('wf-1', { input: {}, companyId: 'company-1', userId: 'user-1' });
    await executeWorkflowRun(result.runId, result.workflowRunId);

    const detail = await getWorkflowRun(result.workflowRunId);
    expect(detail.workflowRun.status).toBe('completed');
    expect(detail.run.status).toBe('completed');
  });

  it('rejects an unknown workflow honestly', async () => {
    await expect(runWorkflow('missing', { input: {}, companyId: 'c', userId: 'u' })).rejects.toThrow(/not found/i);
  });
});
