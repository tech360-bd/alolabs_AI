/**
 * Memory System — Persistent Database-Backed Implementation
 * ALO Labs AISMH — Enterprise Memory for AI Agents
 *
 * All storage goes through Prisma → SQLite (db/custom.db).
 * Short-term memories → MemoryShortTerm table.
 * Long-term / episodic / semantic / etc. → MemoryLongTerm table.
 *
 * Field mapping:
 *   MemoryShortTerm.sessionId  ↔ companyId
 *   MemoryShortTerm.taskId    ↔ key
 *   MemoryLongTerm.scope      ↔ scope
 *   MemoryLongTerm.scopeId    ↔ agentId | companyId (depends on scope)
 *   MemoryLongTerm.category   ↔ type (long_term, episodic, semantic, …)
 *   MemoryLongTerm.confidence ↔ rank / 100
 *   MemoryLongTerm.approvedBy ↔ userId
 *   MemoryLongTerm.source     ↔ key
 */

import type {
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
  MemoryScope,
  MemoryStoreConfig,
  MemoryType,
} from './types';
import { DEFAULT_MEMORY_CONFIG } from './types';
import { db } from '@/lib/db';

// ─── Scope mapping helpers ──────────────────────────────────────────

/** Map MemoryEntry.scope → DB scope value */
function entryScopeToDb(scope: string): string {
  switch (scope) {
    case 'private': return 'agent';
    case 'team':    return 'department';
    case 'company': return 'company';
    default:        return 'global';
  }
}

/** Map DB scope → MemoryEntry.scope */
function dbScopeToEntry(scope: string): 'private' | 'team' | 'company' | 'global' {
  switch (scope) {
    case 'agent':      return 'private';
    case 'department': return 'team';
    case 'company':    return 'company';
    default:           return 'global';
  }
}

/** Determine the DB scopeId and scope from a MemoryEntry */
function getDbScopeFields(entry: MemoryEntry): { scope: string; scopeId: string | null } {
  if (entry.agentId) {
    return { scope: entryScopeToDb(entry.scope), scopeId: entry.agentId };
  }
  if (entry.companyId && entry.scope === 'company') {
    return { scope: 'company', scopeId: entry.companyId };
  }
  if (entry.companyId && entry.scope === 'global') {
    return { scope: 'global', scopeId: entry.companyId };
  }
  return { scope: entryScopeToDb(entry.scope), scopeId: null };
}

// ─── Row → MemoryEntry converters ────────────────────────────────────

function shortTermRowToEntry(row: {
  id: string;
  sessionId: string;
  taskId: string | null;
  agentId: string | null;
  content: string;
  createdAt: Date;
  expiresAt: Date | null;
}): MemoryEntry {
  return {
    id: row.id,
    type: 'short_term',
    scope: 'private',
    agentId: row.agentId ?? undefined,
    companyId: row.sessionId,
    userId: undefined,
    key: row.taskId ?? row.id,
    content: row.content,
    rank: 70,
    accessCount: 1,
    compressed: false,
    expiresAt: row.expiresAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  };
}

function longTermRowToEntry(row: {
  id: string;
  scope: string;
  scopeId: string | null;
  category: string;
  content: string;
  source: string | null;
  confidence: number;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MemoryEntry {
  const entryScope = dbScopeToEntry(row.scope);
  let agentId: string | undefined;
  let companyId = '';

  if (row.scope === 'agent') {
    agentId = row.scopeId ?? undefined;
  } else if (row.scope === 'company') {
    companyId = row.scopeId ?? '';
  } else if (row.scope === 'department') {
    companyId = row.scopeId ?? '';
  }

  return {
    id: row.id,
    type: (row.category as MemoryType) || 'long_term',
    scope: entryScope,
    agentId,
    companyId,
    userId: row.approvedBy ?? undefined,
    key: row.source ?? row.category,
    content: row.content,
    rank: Math.round(row.confidence * 100),
    accessCount: 1,
    compressed: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── PersistentMemoryStore ──────────────────────────────────────────

class PersistentMemoryStore {
  private config: MemoryStoreConfig;

  constructor(config?: Partial<MemoryStoreConfig>) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
  }

  // ─── CRUD ─────────────────────────────────────────────────────

  async store(entry: MemoryEntry): Promise<MemoryEntry> {
    if (entry.type === 'short_term') {
      const row = await db.memoryShortTerm.create({
        data: {
          id: entry.id,
          sessionId: entry.companyId,
          taskId: entry.key,
          agentId: entry.agentId ?? null,
          content: entry.content,
          expiresAt: entry.expiresAt ?? new Date(Date.now() + this.config.shortTermMaxAge),
        },
      });
      return shortTermRowToEntry(row);
    }

    // All other types → MemoryLongTerm
    const { scope: dbScope, scopeId } = getDbScopeFields(entry);
    const row = await db.memoryLongTerm.create({
      data: {
        id: entry.id,
        scope: dbScope,
        scopeId,
        category: entry.type,
        content: entry.content,
        source: entry.key,
        confidence: entry.rank / 100,
        approvedBy: entry.userId ?? null,
      },
    });
    return longTermRowToEntry(row);
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    // Try short-term first (by ID prefix convention), then long-term
    const isShortTerm = id.startsWith('mem_st_');

    if (isShortTerm) {
      const row = await db.memoryShortTerm.findUnique({ where: { id } });
      if (row) return shortTermRowToEntry(row);
      return undefined;
    }

    const row = await db.memoryLongTerm.findUnique({ where: { id } });
    if (row) return longTermRowToEntry(row);
    return undefined;
  }

  async delete(id: string): Promise<boolean> {
    const isShortTerm = id.startsWith('mem_st_');

    if (isShortTerm) {
      try {
        await db.memoryShortTerm.delete({ where: { id } });
        return true;
      } catch {
        return false;
      }
    }

    try {
      await db.memoryLongTerm.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | undefined> {
    const isShortTerm = id.startsWith('mem_st_');

    if (isShortTerm) {
      const existing = await db.memoryShortTerm.findUnique({ where: { id } });
      if (!existing) return undefined;

      const row = await db.memoryShortTerm.update({
        where: { id },
        data: {
          sessionId: updates.companyId,
          taskId: updates.key,
          agentId: updates.agentId ?? null,
          content: updates.content,
          expiresAt: updates.expiresAt,
        },
      });
      return shortTermRowToEntry(row);
    }

    const existing = await db.memoryLongTerm.findUnique({ where: { id } });
    if (!existing) return undefined;

    const data: Record<string, unknown> = {
      content: updates.content,
      updatedAt: new Date(),
    };

    if (updates.scope !== undefined) {
      data.scope = entryScopeToDb(updates.scope);
      if (updates.agentId) data.scopeId = updates.agentId;
      else if (updates.companyId) data.scopeId = updates.companyId;
    }
    if (updates.key !== undefined) data.source = updates.key;
    if (updates.rank !== undefined) data.confidence = updates.rank / 100;
    if (updates.userId !== undefined) data.approvedBy = updates.userId;
    if (updates.type !== undefined) data.category = updates.type;

    const row = await db.memoryLongTerm.update({
      where: { id },
      data,
    });
    return longTermRowToEntry(row);
  }

  // ─── Query ─────────────────────────────────────────────────────

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];
    const queryLower = query.text.toLowerCase();
    const now = new Date();

    // ── Search MemoryShortTerm ──
    const stWhere: Record<string, unknown> = {
      content: { contains: query.text },
    };
    if (query.agentId) stWhere.agentId = query.agentId;
    if (query.companyId) stWhere.sessionId = query.companyId;
    if (query.type && query.type !== 'short_term') {
      // Skip short-term table if not looking for short_term
    } else {
      const stRows = await db.memoryShortTerm.findMany({
        where: {
          ...stWhere,
          ...(query.type === 'short_term' ? {} : {}),
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 20,
      });

      for (const row of stRows) {
        const entry = shortTermRowToEntry(row);
        if (query.scope && entry.scope !== query.scope) continue;
        if (query.minRank && entry.rank < query.minRank) continue;
        const textScore = this.computeTextScore(queryLower, row.content.toLowerCase(), entry.key.toLowerCase());
        if (textScore > 0) {
          results.push({ entry, score: textScore });
        }
      }
    }

    // ── Search MemoryLongTerm ──
    if (query.type === undefined || query.type !== 'short_term') {
      const ltWhere: Record<string, unknown> = {
        content: { contains: query.text },
      };

      if (query.agentId) {
        ltWhere.scope = 'agent';
        ltWhere.scopeId = query.agentId;
      } else if (query.companyId) {
        // Search company-scoped and global entries
        ltWhere.OR = [
          { scope: 'company', scopeId: query.companyId },
          { scope: 'global' },
        ];
      }

      if (query.type) {
        if (ltWhere.OR) {
          // Need to combine category filter with OR
          for (const cond of ltWhere.OR as Record<string, unknown>[]) {
            (cond as Record<string, unknown>).category = query.type;
          }
        } else {
          ltWhere.category = query.type;
        }
      }

      if (query.scope) {
        const dbScope = entryScopeToDb(query.scope);
        if (ltWhere.OR) {
          for (const cond of ltWhere.OR as Record<string, unknown>[]) {
            (cond as Record<string, unknown>).scope = dbScope;
          }
        } else {
          ltWhere.scope = dbScope;
        }
      }

      if (query.minRank) {
        const minConf = query.minRank / 100;
        if (ltWhere.OR) {
          for (const cond of ltWhere.OR as Record<string, unknown>[]) {
            (cond as Record<string, unknown>).confidence = { gte: minConf };
          }
        } else {
          ltWhere.confidence = { gte: minConf };
        }
      }

      const ltRows = await db.memoryLongTerm.findMany({
        where: ltWhere,
        orderBy: { updatedAt: 'desc' },
        take: (query.limit ?? 20) * 2, // fetch extra, we'll rank and slice
      });

      for (const row of ltRows) {
        const entry = longTermRowToEntry(row);
        if (query.userId && entry.userId !== query.userId) continue;
        const textScore = this.computeTextScore(queryLower, row.content.toLowerCase(), entry.key.toLowerCase());
        if (textScore > 0) {
          const ageHours = (Date.now() - row.updatedAt.getTime()) / 3_600_000;
          const recencyBoost = Math.max(0, 1 - ageHours / 168);
          const finalScore = textScore * (entry.rank / 100) * (0.5 + 0.5 * recencyBoost);
          results.push({
            entry,
            score: Math.round(finalScore * 1000) / 1000,
          });
        }
      }
    }

    // Sort by score descending, slice
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, query.limit ?? 20);
  }

  /** Get memories for a specific agent */
  async getByAgent(agentId: string, type?: MemoryType): Promise<MemoryEntry[]> {
    const allEntries: MemoryEntry[] = [];
    const now = new Date();

    if (!type || type === 'short_term') {
      const stRows = await db.memoryShortTerm.findMany({
        where: {
          agentId,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
      });
      for (const row of stRows) {
        allEntries.push(shortTermRowToEntry(row));
      }
    }

    if (!type || type !== 'short_term') {
      const ltWhere: Record<string, unknown> = {
        scope: 'agent',
        scopeId: agentId,
      };
      if (type) ltWhere.category = type;

      const ltRows = await db.memoryLongTerm.findMany({
        where: ltWhere,
        orderBy: { confidence: 'desc' },
      });
      for (const row of ltRows) {
        allEntries.push(longTermRowToEntry(row));
      }
    }

    return allEntries.sort((a, b) => b.rank - a.rank);
  }

  /** Get short-term memory (conversation context) for an agent */
  async getShortTerm(agentId: string): Promise<MemoryEntry[]> {
    const cutoff = new Date(Date.now() - this.config.shortTermMaxAge);
    const rows = await db.memoryShortTerm.findMany({
      where: {
        agentId,
        expiresAt: { gt: new Date() },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(shortTermRowToEntry);
  }

  /** Get long-term memory */
  async getLongTerm(agentId?: string, companyId?: string): Promise<MemoryEntry[]> {
    const where: Record<string, unknown> = {
      category: { in: ['long_term', 'semantic'] },
    };

    if (agentId) {
      where.scope = 'agent';
      where.scopeId = agentId;
    } else if (companyId) {
      where.OR = [
        { scope: 'company', scopeId: companyId },
        { scope: 'global' },
      ];
    }

    const rows = await db.memoryLongTerm.findMany({
      where,
      orderBy: { confidence: 'desc' },
    });
    return rows.map(longTermRowToEntry);
  }

  // ─── Memory Management ────────────────────────────────────────

  /** Store a short-term memory (auto-expires) */
  async addShortTerm(params: {
    agentId: string; companyId: string; userId?: string;
    key: string; content: string;
  }): Promise<MemoryEntry> {
    const id = `mem_st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const expiresAt = new Date(Date.now() + this.config.shortTermMaxAge);

    const row = await db.memoryShortTerm.create({
      data: {
        id,
        sessionId: params.companyId,
        taskId: params.key,
        agentId: params.agentId,
        content: params.content,
        expiresAt,
      },
    });

    return shortTermRowToEntry(row);
  }

  /** Store a long-term memory */
  async addLongTerm(params: {
    agentId?: string; companyId: string; userId?: string;
    key: string; content: string; scope?: 'private' | 'team' | 'company';
    rank?: number;
  }): Promise<MemoryEntry> {
    const id = `mem_lt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entryScope = params.scope ?? 'private';

    let dbScope: string;
    let scopeId: string | null = null;

    if (params.agentId) {
      dbScope = entryScopeToDb(entryScope);
      scopeId = params.agentId;
    } else if (entryScope === 'company') {
      dbScope = 'company';
      scopeId = params.companyId;
    } else {
      dbScope = entryScopeToDb(entryScope);
    }

    const row = await db.memoryLongTerm.create({
      data: {
        id,
        scope: dbScope,
        scopeId,
        category: 'long_term',
        content: params.content,
        source: params.key,
        confidence: (params.rank ?? this.config.defaultRank) / 100,
        approvedBy: params.userId ?? null,
      },
    });

    return longTermRowToEntry(row);
  }

  /** Store an episodic memory (interaction record) */
  async addEpisodic(params: {
    agentId: string; companyId: string; userId: string;
    content: string; metadata?: Record<string, unknown>;
  }): Promise<MemoryEntry> {
    const id = `mem_ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const row = await db.memoryLongTerm.create({
      data: {
        id,
        scope: 'agent',
        scopeId: params.agentId,
        category: 'episodic',
        content: params.content,
        source: `episodic_${Date.now()}`,
        confidence: 0.4, // rank=40
        approvedBy: params.userId,
      },
    });

    return longTermRowToEntry(row);
  }

  /** Decay ranks of old memories (long-term only) */
  async decayRanks(): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 86_400_000);

    const oldEntries = await db.memoryLongTerm.findMany({
      where: {
        updatedAt: { lt: oneDayAgo },
      },
    });

    let decayed = 0;
    const now = Date.now();

    for (const entry of oldEntries) {
      const ageDays = (now - entry.updatedAt.getTime()) / 86_400_000;
      const decay = Math.floor(ageDays * this.config.rankDecayPerDay);
      if (decay > 0) {
        const newConf = Math.max(0, entry.confidence - decay / 100);
        await db.memoryLongTerm.update({
          where: { id: entry.id },
          data: { confidence: newConf, updatedAt: new Date() },
        });
        decayed++;
      }
    }

    return decayed;
  }

  /** Expire old short-term memories */
  async expireShortTerm(): Promise<number> {
    const now = new Date();
    const result = await db.memoryShortTerm.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });
    return result.count;
  }

  /** Get memory stats */
  async getStats(): Promise<{ total: number; byType: Record<string, number>; oldest: Date | null }> {
    const [stCount, ltCount, ltByCategory, stOldest, ltOldest] = await Promise.all([
      db.memoryShortTerm.count(),
      db.memoryLongTerm.count(),
      db.memoryLongTerm.groupBy({ by: ['category'], _count: true }),
      db.memoryShortTerm.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      db.memoryLongTerm.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);

    const byType: Record<string, number> = { short_term: stCount };
    for (const row of ltByCategory) {
      byType[row.category] = row._count;
    }

    let oldest: Date | null = null;
    if (stOldest) oldest = stOldest.createdAt;
    if (ltOldest && (!oldest || ltOldest.createdAt < oldest)) oldest = ltOldest.createdAt;

    return { total: stCount + ltCount, byType, oldest };
  }

  /** Get total count */
  async getSize(): Promise<number> {
    const [stCount, ltCount] = await Promise.all([
      db.memoryShortTerm.count(),
      db.memoryLongTerm.count(),
    ]);
    return stCount + ltCount;
  }

  // ─── Internal ────────────────────────────────────────────────

  private computeTextScore(query: string, content: string, key: string): number {
    const queryWords = query.split(/\s+/).filter(w => w.length > 1);
    if (queryWords.length === 0) return 0;

    let matches = 0;
    for (const word of queryWords) {
      if (content.includes(word)) matches += 1;
      if (key.includes(word)) matches += 2;
    }
    return matches / queryWords.length;
  }
}

// Singleton
let _instance: PersistentMemoryStore | null = null;
export function getMemoryStore(config?: Partial<MemoryStoreConfig>): PersistentMemoryStore {
  if (!_instance) _instance = new PersistentMemoryStore(config);
  return _instance;
}

// Re-export the class for type references
export { PersistentMemoryStore };

// ─── Convenience Functions ────────────────────────────────────────────
// These wrap the PersistentMemoryStore singleton for simpler API usage.

export interface StoreMemoryOptions {
  type?: MemoryType;
  scope?: MemoryScope;
  companyId?: string;
  userId?: string;
  rank?: number;
  expiresAt?: Date;
}

/**
 * Get all memories for an agent (both short-term and long-term).
 */
export async function getMemory(agentId: string, type?: MemoryType): Promise<MemoryEntry[]> {
  return getMemoryStore().getByAgent(agentId, type);
}

/**
 * Store a memory for an agent with a given key.
 */
export async function storeMemory(
  agentId: string,
  key: string,
  value: string,
  options: StoreMemoryOptions = {},
): Promise<MemoryEntry> {
  const store = getMemoryStore();
  const isShortTerm = options.type === 'short_term' || !options.type;

  if (isShortTerm) {
    const id = `mem_st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: MemoryEntry = {
      id,
      type: 'short_term',
      scope: options.scope ?? 'private',
      agentId,
      companyId: options.companyId ?? '',
      userId: options.userId,
      key,
      content: value,
      rank: options.rank ?? 70,
      accessCount: 1,
      compressed: false,
      expiresAt: options.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return store.store(entry);
  }

  // Long-term memory
  const id = `mem_lt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const entry: MemoryEntry = {
    id,
    type: options.type ?? 'long_term',
    scope: options.scope ?? 'private',
    agentId,
    companyId: options.companyId ?? '',
    userId: options.userId,
    key,
    content: value,
    rank: options.rank ?? 50,
    accessCount: 1,
    compressed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return store.store(entry);
}

/**
 * Delete a memory by agent ID and key.
 * Returns true if a memory was deleted.
 */
export async function deleteMemory(agentId: string, key: string): Promise<boolean> {
  const store = getMemoryStore();

  // Try to find the memory first
  const memories = await store.getByAgent(agentId);
  const target = memories.find((m) => m.key === key);
  if (!target) return false;

  return store.delete(target.id);
}

/**
 * Get assembled context for an agent (short-term conversation + long-term knowledge).
 * Returns entries sorted by relevance (rank desc).
 */
export async function getContextForAgent(agentId: string, companyId?: string): Promise<MemoryEntry[]> {
  const store = getMemoryStore();
  const allEntries = await store.getByAgent(agentId);

  // Filter expired short-term
  const now = new Date();
  const valid = allEntries.filter((entry) => {
    if (entry.type === 'short_term' && entry.expiresAt && entry.expiresAt < now) {
      return false;
    }
    return true;
  });

  // Sort by rank descending (most relevant first)
  return valid.sort((a, b) => b.rank - a.rank);
}

export type {
  MemoryEntry,
  MemoryQuery,
  MemorySearchResult,
  MemoryType,
  MemoryScope,
  MemoryStoreConfig,
} from './types';
