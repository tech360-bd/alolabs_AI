/**
 * Durable Commanding Center transcript (Phase C1).
 *
 * The agent used a module-level `Map` before this: history died on restart and
 * two instances disagreed. These tests pin the replacement's contract:
 * deterministic per-session conversation, tenant filter carried in the query,
 * explicit role mapping, and failures reported instead of silently swallowed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ConversationRow {
  id: string;
  userId: string;
  companyId: string;
  title: string;
  status: string;
}

interface MessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  model: string | null;
  metadata: string;
  createdAt: Date;
}

const state: {
  conversations: ConversationRow[];
  messages: MessageRow[];
  seq: number;
  failWrites: boolean;
  lastFindManyArgs: Record<string, unknown> | null;
} = {
  conversations: [],
  messages: [],
  seq: 0,
  failWrites: false,
  lastFindManyArgs: null,
};

vi.mock('@/lib/db', () => ({
  db: {
    conversation: {
      findFirst: async ({ where }: { where: { userId: string; companyId: string; title: string } }) =>
        state.conversations.find(
          (row) =>
            row.userId === where.userId &&
            row.companyId === where.companyId &&
            row.title === where.title &&
            row.status !== 'archived',
        ) ?? null,
      create: async ({ data }: { data: Omit<ConversationRow, 'id' | 'status'> & { status?: string } }) => {
        if (state.failWrites) throw new Error('storage down');
        const row: ConversationRow = { id: `conv_${++state.seq}`, status: 'active', ...data };
        state.conversations.push(row);
        return { id: row.id };
      },
    },
    conversationMessage: {
      findMany: async (args: { where: { conversationId: string; conversation?: { companyId?: string } }; take?: number }) => {
        state.lastFindManyArgs = args as unknown as Record<string, unknown>;
        const companyId = args.where.conversation?.companyId;
        return state.messages
          .filter((message) => {
            if (message.conversationId !== args.where.conversationId) return false;
            if (!companyId) return true;
            const conversation = state.conversations.find((row) => row.id === message.conversationId);
            return conversation?.companyId === companyId;
          })
          .slice(-(args.take ?? 20))
          .reverse();
      },
      create: async ({ data }: { data: Omit<MessageRow, 'id' | 'createdAt'> }) => {
        if (state.failWrites) throw new Error('storage down');
        const row: MessageRow = { id: `msg_${++state.seq}`, createdAt: new Date(), ...data };
        state.messages.push(row);
        return { id: row.id };
      },
      deleteMany: async ({ where }: { where: { conversationId: string } }) => {
        if (state.failWrites) throw new Error('storage down');
        const before = state.messages.length;
        state.messages = state.messages.filter((message) => message.conversationId !== where.conversationId);
        return { count: before - state.messages.length };
      },
    },
  },
}));

const {
  appendCommandTurn,
  clearCommandConversation,
  findCommandConversation,
  getOrCreateCommandConversation,
  loadCommandTurns,
  titleFor,
} = await import('@/lib/chat/command-session-store');

beforeEach(() => {
  state.conversations = [];
  state.messages = [];
  state.seq = 0;
  state.failWrites = false;
  state.lastFindManyArgs = null;
});

describe('command conversation identity', () => {
  it('creates one conversation per user + tenant + session', async () => {
    const first = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });
    const second = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });
    const other = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'beta' });

    expect(first?.id).toBe(second?.id);
    expect(other?.id).not.toBe(first?.id);
    expect(state.conversations).toHaveLength(2);
    expect(state.conversations[0].title).toBe(titleFor('alpha'));
    expect(state.conversations[0].title).toContain('Command Agent');
  });

  it('never reuses a conversation across tenants', async () => {
    const a = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });
    const b = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c2', sessionId: 'alpha' });
    expect(a?.id).not.toBe(b?.id);
  });

  it('find does not create a row on a read path', async () => {
    expect(await findCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'missing' })).toBeNull();
    expect(state.conversations).toHaveLength(0);
  });
});

describe('loadCommandTurns', () => {
  it('carries the tenant filter in the query and returns chronological turns', async () => {
    const conversation = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });
    await appendCommandTurn({ conversationId: conversation!.id, turn: { role: 'user', content: 'first' } });
    await appendCommandTurn({
      conversationId: conversation!.id,
      turn: { role: 'assistant', content: 'second', model: 'qwen/qwen3-32b', metadata: { status: 'completed' } },
    });

    const turns = await loadCommandTurns({ conversationId: conversation!.id, companyId: 'c1' });

    expect(turns.map((turn) => turn.content)).toEqual(['first', 'second']);
    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant']);
    expect(turns[1].metadata).toEqual({ status: 'completed' });
    expect(turns[1].model).toBe('qwen/qwen3-32b');
    expect(state.lastFindManyArgs).toMatchObject({
      where: { conversationId: conversation!.id, conversation: { companyId: 'c1' } },
    });
  });

  it('returns nothing for a different tenant even with the right conversation id', async () => {
    const conversation = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });
    await appendCommandTurn({ conversationId: conversation!.id, turn: { role: 'user', content: 'secret' } });

    expect(await loadCommandTurns({ conversationId: conversation!.id, companyId: 'c2' })).toEqual([]);
  });

  it('survives unreadable metadata rather than throwing', async () => {
    const conversation = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });
    state.messages.push({
      id: 'm1',
      conversationId: conversation!.id,
      role: 'agent',
      content: 'legacy',
      model: null,
      metadata: 'not-json',
      createdAt: new Date(),
    });

    const turns = await loadCommandTurns({ conversationId: conversation!.id, companyId: 'c1' });
    expect(turns[0].metadata).toEqual({});
  });
});

describe('persistence failure is reported, not hidden', () => {
  it('append returns false when the write fails', async () => {
    const conversation = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });
    state.failWrites = true;
    const saved = await appendCommandTurn({ conversationId: conversation!.id, turn: { role: 'user', content: 'hi' } });
    expect(saved).toBe(false);
  });

  it('conversation creation returns null when the write fails', async () => {
    state.failWrites = true;
    expect(await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' })).toBeNull();
  });

  it('clear returns 0 when the delete fails and does not throw', async () => {
    const conversation = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });
    await appendCommandTurn({ conversationId: conversation!.id, turn: { role: 'user', content: 'hi' } });
    state.failWrites = true;
    expect(await clearCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' })).toBe(0);
  });
});

describe('clearCommandConversation', () => {
  it('clears only the requested conversation and keeps the row', async () => {
    const alpha = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });
    const beta = await getOrCreateCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'beta' });
    await appendCommandTurn({ conversationId: alpha!.id, turn: { role: 'user', content: 'a' } });
    await appendCommandTurn({ conversationId: beta!.id, turn: { role: 'user', content: 'b' } });

    const cleared = await clearCommandConversation({ userId: 'u1', companyId: 'c1', sessionId: 'alpha' });

    expect(cleared).toBe(1);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toBe('b');
    expect(state.conversations).toHaveLength(2);
  });
});
