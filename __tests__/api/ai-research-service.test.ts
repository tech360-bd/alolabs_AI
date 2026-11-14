import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ai-research service registration (Phase 14 — AI platform surface).
 *
 * Verifies:
 *  1. The /v1/ai/tasks request schema accepts `service: 'ai-research'`
 *     and still rejects unknown services.
 *  2. The service catalog seed registers ai-research with scope `ai:research`
 *     (guards against catalog/enum drift).
 *  3. The public task response contract preserves research artifacts such as
 *     citations while still stripping internal fields (agentId/model/runId).
 */

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/runs', () => ({ createRun: vi.fn() }));
vi.mock('@/lib/api/entitlements', () => ({
  requireEntitlement: vi.fn(),
  incrementUsage: vi.fn(),
}));

async function importTasksRoute(): Promise<any> {
  return await import('@/app/api/v1/ai/tasks/route');
}

describe('ai-research service registration', () => {
  it('accepts service "ai-research" in the task creation schema', async () => {
    const { CreateTaskSchema } = await importTasksRoute();
    const parsed = CreateTaskSchema.safeParse({
      service: 'ai-research',
      input: { query: 'ALO Labs platform market landscape', max_sources: 8 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.service).toBe('ai-research');
      expect(parsed.data.priority).toBe('normal');
    }
  });

  it('defaults service to "ai-tasks" when omitted (backward compatible)', async () => {
    const { CreateTaskSchema } = await importTasksRoute();
    const parsed = CreateTaskSchema.safeParse({ input: {} });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.service).toBe('ai-tasks');
  });

  it('rejects unknown service slugs', async () => {
    const { CreateTaskSchema } = await importTasksRoute();
    const parsed = CreateTaskSchema.safeParse({ service: 'ai-unknown', input: {} });
    expect(parsed.success).toBe(false);
  });

  it('seed registers ai-research with scope ai:research on /v1/ai/tasks', () => {
    const src = readFileSync(
      join(process.cwd(), 'scripts', 'seed-services.ts'),
      'utf8',
    );
    const row = src.split('\n').find((l) => l.includes("slug: 'ai-research'"));
    expect(row).toBeDefined();
    expect(row).toContain("scope: 'ai:research'");
    expect(row).toContain("endpoint: '/v1/ai/tasks'");
    expect(row).toContain("category: 'research'");
  });

  it('public task response preserves citations but strips internal fields', async () => {
    const { publicTaskResponse, containsLeakyFields } = await import('@/lib/api/public-response');
    const res = publicTaskResponse({
      requestId: 'req-r1',
      taskId: 'task-research-1',
      service: 'ai-research',
      status: 'completed',
      result: {
        summary: 'Synthesized answer ready.',
        answer: 'Short synthesis with inline references.',
        citations: [
          { title: 'Example Source', url: 'https://example.com/src', snippet: 'Relevant excerpt.' },
        ],
        output: { runId: 'run_hidden', model: 'gpt-x' },
      },
      usageUnits: 3,
      createdAt: '2026-11-14T00:00:00Z',
      completedAt: '2026-11-14T00:02:00Z',
    });
    expect(res.service).toBe('ai-research');
    expect(res.result.citations).toHaveLength(1);
    expect(res.result.citations[0].url).toBe('https://example.com/src');
    expect(containsLeakyFields(res)).toEqual([]);
    expect(JSON.stringify(res)).not.toMatch(/run_hidden|gpt-x/);
  });
});
