// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { previewLearning } from '../../scripts/shared/learning-preview';

describe('offline learning simulation', () => {
  it('retains all eight department fixtures, sessions, maturity and protection calculations without a database', () => {
    const rows = [...previewLearning(8)];
    expect(rows.map(r => r.department)).toEqual(['Engineering', 'Marketing', 'Sales', 'Support', 'Finance', 'HR', 'Operations', 'Research']);
    for (const [i, row] of rows.entries()) {
      expect(row.kind).toBe('synthetic-learning-preview');
      const agentId = `preview:${i + 1}`;
      expect(row.evolution).toMatchObject({ agentId, totalKnowledge: row.knowledge.length, totalSessions: row.sessions.length });
      expect(row.evolution.knowledgeDensity).toBe(row.knowledge.length / row.sessions.length);
      expect(row.knowledge.every(k => k.agentId === agentId && k.content.startsWith(`[${row.department}]`))).toBe(true);
      expect(row.sessions.every(s => s.agentId === agentId && s.knowledgeAfter === row.knowledge.length)).toBe(true);
      expect(JSON.parse(row.protection.allowedDomains)).toEqual([row.department.toLowerCase()]);
    }
  });
  it('refuses unbounded or invalid previews', () => {
    for (const n of [0, -1, 2.5, 2001, NaN]) expect(() => previewLearning(n).next()).toThrow(/integer/);
  });
});
