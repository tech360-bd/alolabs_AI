/**
 * AgentOS Planner — JSON extraction, heuristic fallback, LLM plan path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb, resetAgentOsMocks } from '../helpers/fake-db';

vi.mock('@/lib/db', () => ({ db: fakeDb.db }));

/** Router stub: configurable chat behaviour per test. */
const chat = vi.fn();
vi.mock('@/lib/ai-router', () => ({
  getRouter: () => ({ chat }),
}));

import { planObjective, heuristicPlan, extractJsonObject } from '@/lib/runs/planner';

beforeEach(() => {
  resetAgentOsMocks();
  chat.mockReset();
});

describe('extractJsonObject', () => {
  it('parses a bare JSON object', () => {
    expect(extractJsonObject('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses JSON inside a fenced code block', () => {
    const text = 'Here is the plan:\n```json\n{"steps": []}\n```\nDone.';
    expect(extractJsonObject(text)).toEqual({ steps: [] });
  });

  it('parses JSON embedded in prose', () => {
    expect(extractJsonObject('Sure! {"objective": "x"} hope that helps')).toEqual({ objective: 'x' });
  });

  it('returns null for non-JSON', () => {
    expect(extractJsonObject('no json here')).toBeNull();
  });
});

describe('heuristicPlan', () => {
  it('decomposes a research objective into ordered steps with dependencies', () => {
    const plan = heuristicPlan('Research the best UK universities for this student and prepare a counselor report.');
    expect(plan.strategy).toBe('heuristic');
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    // Later steps depend on earlier ones
    const later = plan.steps[plan.steps.length - 1];
    expect(later.dependsOn.length).toBeGreaterThan(0);
    // Every step is well-formed
    for (const step of plan.steps) {
      expect(step.id).toBeTruthy();
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.description.length).toBeGreaterThan(10);
      expect(Array.isArray(step.skills)).toBe(true);
      expect(Array.isArray(step.tools)).toBe(true);
    }
  });

  it('normalizes dependsOn references to real step ids', () => {
    const plan = heuristicPlan('Analyze this dataset and create an executive report.');
    const ids = new Set(plan.steps.map((s) => s.id));
    for (const step of plan.steps) {
      for (const dep of step.dependsOn) {
        expect(ids.has(dep)).toBe(true);
      }
    }
  });
});

describe('planObjective', () => {
  it('uses the LLM plan when the router returns valid JSON', async () => {
    chat.mockResolvedValue({
      content: JSON.stringify({
        reasoning: 'needs research then writing',
        steps: [
          { title: 'Research universities', description: 'Find and rank UK universities.', agent: 'researcher', skills: ['web-research'], tools: ['web_search'] },
          { title: 'Write report', description: 'Write the counselor report.', agent: 'writer', dependsOn: ['Research universities'] },
        ],
      }),
      model: 'stub',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    const plan = await planObjective('Research UK universities and write a report.', 'company-1');
    expect(plan.strategy).toBe('llm');
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[1].dependsOn).toEqual([plan.steps[0].id]);
  });

  it('falls back to the heuristic plan when the LLM is unavailable (no keys)', async () => {
    chat.mockRejectedValue(new Error('OpenAI API key is required'));

    const plan = await planObjective('Research UK universities and write a report.', 'company-1');
    expect(plan.strategy).toBe('heuristic');
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the heuristic plan when the LLM returns invalid JSON', async () => {
    chat.mockResolvedValue({ content: 'I cannot produce JSON right now.', model: 'stub' });

    const plan = await planObjective('Research UK universities.', 'company-1');
    expect(plan.strategy).toBe('heuristic');
  });
});
