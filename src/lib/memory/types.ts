/**
 * Memory System Type Definitions
 * ALO Labs AISMH — Enterprise Memory for AI Agents
 */

export type MemoryType =
  | 'short_term'    // Current conversation context
  | 'long_term'     // Persistent knowledge
  | 'semantic'      // Vector-searchable embeddings
  | 'episodic'      // Past interaction records
  | 'shared'        // Organization-wide memory
  | 'user'          // User-specific preferences
  | 'organization'  // Company-level knowledge
  | 'agent';        // Agent's own learned knowledge

export type MemoryScope = 'private' | 'team' | 'company' | 'global';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  agentId?: string;
  companyId: string;
  userId?: string;
  key: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  rank: number;          // 0-100 relevance score
  accessCount: number;
  lastAccessedAt?: Date;
  expiresAt?: Date;
  compressed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  highlights?: string[];
}

export interface MemoryQuery {
  text: string;
  type?: MemoryType;
  scope?: MemoryScope;
  agentId?: string;
  companyId: string;
  userId?: string;
  limit?: number;
  minRank?: number;
}

export interface MemoryStoreConfig {
  shortTermMaxAge: number;      // ms before short-term expires (default: 1 hour)
  shortTermMaxEntries: number;  // max short-term memories per agent
  longTermMaxEntries: number;
  compressionThreshold: number;  // entries before compression triggers
  defaultRank: number;
  rankDecayPerDay: number;       // how much rank decreases per day
}

export const DEFAULT_MEMORY_CONFIG: MemoryStoreConfig = {
  shortTermMaxAge: 3_600_000,      // 1 hour
  shortTermMaxEntries: 100,
  longTermMaxEntries: 10_000,
  compressionThreshold: 5_000,
  defaultRank: 50,
  rankDecayPerDay: 2,
};
