/**
 * Command-run timeline storage (Phase C2).
 *
 * The timeline is only useful if it is (a) tenant-scoped, (b) finalised with a
 * real terminal status, (c) bounded, and (d) readable after a reload. These
 * tests pin those four properties against a mocked Prisma client.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

interface ArtifactRow {
  id: string;
  companyId: string;
  content: string;
  metadata: string;
  createdAt: Date;
  updatedAt: Date;
}

const state: {
  rows: ArtifactRow[];
  createFails: boolean;
  updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>;
} = { rows: [], createFails: false, updates: [] };

vi.mock('@/lib/db', () => ({
  db: {
    artifact: {
      create: async ({ data }: { data: Omit<ArtifactRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        if (state.createFails) throw new Error('storage down');
        const row: ArtifactRow = {
          id: `art_${state.rows.length + 1}`,
          createdAt: new Date('2026-11-25T10:00:00Z'),
          updatedAt: new Date('2026-11-25T10:00:00Z'),
          ...data,
        };
        state.rows.push(row);
        return { id: row.id };
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.rows.find(
          (row) =>
            (!where.id || row.id === where.id) &&
            (!where.companyId || row.companyId === where.companyId) &&
            (!where.type || true),
        ) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        state.updates.push({ where, data });
        const row = state.rows.find((candidate) => candidate.id === where.id && candidate.companyId === where.companyId);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  },
}));

import {
  MAX_STORED_EVENTS,
  createEventCollector,
  finishCommandRun,
  getCommandRun,
  startCommandRun,
} from '@/lib/command-agent/run-store';

beforeEach(() => {
  state.rows.length = 0;
  state.updates.length = 0;
  state.createFails = false;
});

describe('startCommandRun', () => {
  it('creates a company-scoped json artifact marked as a command run', async () => {
    const started = await startCommandRun({
      companyId: 'co_1',
      userId: 'user_1',
      sessionId: 'session-a',
      profile: 'free_general',
      messageChars: 42,
    });

    expect(started?.id).toBe('art_1');
    const row = state.rows[0];
    expect(row.companyId).toBe('co_1');
    expect(JSON.parse(row.metadata)).toMatchObject({
      kind: 'command_run',
      sessionId: 'session-a',
      profile: 'free_general',
      messageChars: 42,
    });
  });

  it('returns null instead of failing the command when storage is down', async () => {
    state.createFails = true;
    const started = await startCommandRun({
      companyId: 'co_1',
      userId: 'user_1',
      sessionId: 's',
      profile: 'free_general',
      messageChars: 1,
    });
    expect(started).toBeNull();
  });
});

describe('finishCommandRun', () => {
  it('writes a checksummed body and refuses cross-tenant finalisation', async () => {
    await startCommandRun({ companyId: 'co_1', userId: 'u', sessionId: 's', profile: 'p', messageChars: 3 });

    const refused = await finishCommandRun({
      runId: 'art_1',
      companyId: 'co_other',
      status: 'completed',
      events: [{ seq: 1, at: new Date().toISOString(), type: 'final', data: {} }],
    });
    expect(refused).toBe(false);
    expect(state.updates).toHaveLength(0);

    const collector = createEventCollector();
    collector.emit('run_started', { runId: 'art_1' });
    collector.emit('final', { status: 'completed' });

    const ok = await finishCommandRun({
      runId: 'art_1',
      companyId: 'co_1',
      status: 'completed',
      events: collector.events,
      provider: 'groq',
      model: 'llama-free',
      durationMs: 1200,
    });
    expect(ok).toBe(true);

    const row = state.rows[0];
    expect(row.content).toContain('"status":"completed"');
    const parsed = JSON.parse(row.content);
    expect(parsed.events).toHaveLength(2);
    const update = state.updates[0];
    expect(update.where).toEqual({ id: 'art_1', companyId: 'co_1' });
    expect(update.data.checksum).toBe(createHash('sha256').update(row.content).digest('hex'));
    expect(JSON.parse(String(update.data.metadata))).toMatchObject({
      kind: 'command_run',
      status: 'completed',
      eventCount: 2,
      provider: 'groq',
    });
  });

  it('bounds the stored event list', async () => {
    await startCommandRun({ companyId: 'co_1', userId: 'u', sessionId: 's', profile: 'p', messageChars: 3 });
    const collector = createEventCollector();
    for (let index = 0; index < MAX_STORED_EVENTS + 20; index += 1) {
      collector.emit('tool', { index });
    }
    await finishCommandRun({ runId: 'art_1', companyId: 'co_1', status: 'completed', events: collector.events });

    const parsed = JSON.parse(state.rows[0].content);
    expect(parsed.events).toHaveLength(MAX_STORED_EVENTS);
    expect(parsed.events[0].data.index).toBe(20);
    expect(JSON.parse(String(state.updates[0].data.metadata)).eventCount).toBe(MAX_STORED_EVENTS);
  });
});

describe('getCommandRun', () => {
  it('returns the stored timeline for its own tenant only', async () => {
    await startCommandRun({ companyId: 'co_1', userId: 'u', sessionId: 'session-a', profile: 'free_general', messageChars: 3 });
    await finishCommandRun({
      runId: 'art_1',
      companyId: 'co_1',
      status: 'completed',
      events: [{ seq: 1, at: '2026-11-25T10:00:00Z', type: 'final', data: { status: 'completed' } }],
      provider: 'groq',
      model: 'llama-free',
    });

    const run = await getCommandRun('art_1', 'co_1');
    expect(run?.status).toBe('completed');
    expect(run?.events).toHaveLength(1);
    expect(run?.sessionId).toBe('session-a');
    expect(run?.provider).toBe('groq');

    expect(await getCommandRun('art_1', 'co_other')).toBeNull();
  });

  it('refuses a json artifact that is not a command run', async () => {
    state.rows.push({
      id: 'art_report',
      companyId: 'co_1',
      content: JSON.stringify({ hello: 'world' }),
      metadata: JSON.stringify({ kind: 'research_report' }),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await getCommandRun('art_report', 'co_1')).toBeNull();
  });
});

describe('createEventCollector', () => {
  it('sequences events and survives a throwing sink', () => {
    const seen: number[] = [];
    const collector = createEventCollector((event) => {
      seen.push(event.seq);
      if (event.seq === 2) throw new Error('consumer down');
    });

    collector.emit('run_started', {});
    collector.emit('model', {});
    collector.emit('final', {});

    expect(seen).toEqual([1, 2, 3]);
    expect(collector.events.map((event) => event.type)).toEqual(['run_started', 'model', 'final']);
    expect(collector.events.map((event) => event.seq)).toEqual([1, 2, 3]);
  });
});
