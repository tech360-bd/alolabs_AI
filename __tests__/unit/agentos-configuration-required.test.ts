/**
 * AgentOS Run Pipeline — HONEST FAILURE PATH (no AI provider configured).
 *
 * This test deliberately does NOT mock the model layer:
 *  - the REAL AgentExecutionEngine runs (security gate, model selection,
 *    fallback chain, failure persistence)
 *  - the REAL AIRouter runs with NO provider API keys in the environment
 *
 * Expected, honest outcome: the run fails with a "Configuration required"
 * message — never a fake success.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { fakeDb, routeTask, addEpisodic, publish, resetAgentOsMocks } from '../helpers/fake-db';

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
// NOTE: @/lib/agent-runtime and @/lib/ai-router are intentionally NOT mocked.

// Ensure no provider keys leak into the test environment.
beforeAll(() => {
  for (const key of Object.keys(process.env)) {
    if (
      /API_KEY|APIKEY|SECRET|TOKEN|OPENAI|ANTHROPIC|GEMINI|GROQ|DEEPSEEK|MISTRAL|OLLAMA|OPENROUTER|ZAI/i.test(key)
    ) {
      delete process.env[key];
    }
  }
});

import { createRun, executeRun } from '@/lib/runs';
import { isConfigurationError, configurationRequiredMessage } from '@/lib/qc';

const PLAN = {
  strategy: 'heuristic' as const,
  reasoning: 'test plan',
  steps: [
    {
      id: 'step-1',
      title: 'Research UK universities',
      description: 'Research and rank UK universities for an HSC student.',
      agentHint: 'researcher',
      skills: [],
      tools: [],
      dependsOn: [],
    },
  ],
};

beforeEach(() => {
  resetAgentOsMocks();
  fakeDb.db.agent.create({
    data: { id: 'db-agent-1', agentId: 'AGENT-0001', name: 'Research Agent', status: 'active' },
  });
  // The real execution engine enforces tenant membership before running.
  fakeDb.db.companyUser.create({
    data: { id: 'cu-1', companyId: 'company-1', userId: 'user-1' },
  });
});

describe('AgentOS run pipeline (no provider configured)', () => {
  it('run fails honestly with "Configuration required" — never a fake success', async () => {
    const { runId } = await createRun({
      objective: 'Research the best UK universities for an HSC student.',
      userId: 'user-1',
      companyId: 'company-1',
    });

    await executeRun(runId, { plan: PLAN as any });

    const run = fakeDb.rows('agentOSRun').find((r) => r.id === runId)!;
    expect(run.status).toBe('failed');
    expect(run.error).toBeTruthy();
    expect(run.error.toLowerCase()).toContain('configuration required');
    // The failure is NOT presented as success anywhere
    expect(run.summary).not.toMatch(/completed \d+\/\d+ steps\. deliverable assembled/i);

    // The task records the failure too
    const task = fakeDb.rows('task')[0];
    expect(task.status).toBe('failed');

    // Events tell the truth
    const events = fakeDb.rows('runEvent').map((e) => e.type);
    expect(events).toContain('task.failed');
    expect(events).toContain('run.failed');
    expect(events).not.toContain('run.completed');

    // A failure-report artifact IS produced — it documents the failure honestly
    const artifacts = fakeDb.rows('artifact');
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].content.toLowerCase()).toContain('failed');
    expect(artifacts[0].content.toLowerCase()).toContain('configuration required');

    // The originating command, if any, is marked failed (not completed)
    const commands = fakeDb.rows('command');
    for (const cmd of commands) {
      expect(cmd.status).not.toBe('completed');
    }
  }, 60000);

  it('isConfigurationError recognises provider-configuration failures', () => {
    expect(isConfigurationError(new Error('OpenAI API key is required'))).toBe(true);
    expect(isConfigurationError(new Error('No providers are available'))).toBe(true);
    expect(isConfigurationError(new Error('provider is not configured'))).toBe(true);
    expect(isConfigurationError(new Error('some random runtime error'))).toBe(false);
    expect(configurationRequiredMessage(new Error('OpenAI API key is required'))).toContain('Configuration required');
  });
});
