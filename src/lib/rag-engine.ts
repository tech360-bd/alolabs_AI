/**
 * RAG Engine - Enhanced
 * Provides document chunking, embedding generation, and hybrid search.
 * Integrates with Qdrant for vector storage and z-ai-web-dev-sdk for embeddings.
 */

import { db } from './db';
import type { Prisma } from '@prisma/client';
import { searchPoints, upsertPoints, createCollection, isQdrantConnected } from './qdrant';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChunkResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  position: number;
  embedding?: number[];
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
  position: number;
  source?: string;
}

export interface IngestResult {
  documentId: string;
  chunksCreated: number;
  chunksWithEmbeddings: number;
  errors: string[];
  durationMs: number;
}

export interface QueryResult {
  query: string;
  results: SearchResult[];
  totalFound: number;
  durationMs: number;
  collectionName?: string;
}

// ─── Text Chunking ────────────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 512;
const DEFAULT_CHUNK_OVERLAP = 50;
const DEFAULT_MAX_CHUNKS = 100;

export function chunkText(
  text: string,
  options?: { chunkSize?: number; overlap?: number; maxChunks?: number }
): { content: string; position: number }[] {
  const chunkSize = options?.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = options?.overlap || DEFAULT_CHUNK_OVERLAP;
  const maxChunks = options?.maxChunks || DEFAULT_MAX_CHUNKS;

  if (!text || text.trim().length === 0) return [];

  // Normalize whitespace
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  // Split by paragraphs first, then sentences
  const paragraphs = normalized.split(/\n\n+/).filter((p) => p.trim().length > 0);

  const chunks: { content: string; position: number }[] = [];
  let buffer = '';
  let position = 0;

  for (const para of paragraphs) {
    if (buffer.length + para.length > chunkSize && buffer.length > 0) {
      // Flush buffer as a chunk
      chunks.push({ content: buffer.trim(), position: position++ });
      // Keep overlap from end of buffer
      if (overlap > 0 && buffer.length > overlap) {
        const sentences = buffer.split(/(?<=[.!?])\s+/);
        let overlapText = '';
        for (let i = sentences.length - 1; i >= 0 && overlapText.length < overlap; i--) {
          overlapText = sentences[i] + ' ' + overlapText;
        }
        buffer = overlapText.trim();
      } else {
        buffer = '';
      }
    }

    buffer += (buffer ? '\n\n' : '') + para;

    // If a single paragraph is too long, split by sentences
    if (buffer.length > chunkSize * 1.5) {
      const sentences = buffer.split(/(?<=[.!?])\s+/);
      let subBuffer = '';
      for (const sentence of sentences) {
        if (subBuffer.length + sentence.length > chunkSize && subBuffer.length > 0) {
          chunks.push({ content: subBuffer.trim(), position: position++ });
          subBuffer = sentence;
        } else {
          subBuffer += ' ' + sentence;
        }
      }
      buffer = subBuffer.trim();
    }

    if (chunks.length >= maxChunks) break;
  }

  // Flush remaining buffer
  if (buffer.trim().length > 0 && chunks.length < maxChunks) {
    chunks.push({ content: buffer.trim(), position: position++ });
  }

  return chunks;
}

// ─── Embedding Generation ─────────────────────────────────────────────────────

const configuredVectorDimensions = Number(process.env.EMBEDDING_DIMENSIONS);
const VECTOR_DIMENSIONS = Number.isSafeInteger(configuredVectorDimensions) && configuredVectorDimensions > 0
  ? configuredVectorDimensions
  : 1536;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Generate a real vector from the configured OpenAI-compatible embedding provider. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddingApi = process.env.EMBEDDING_API_URL;
  const embeddingKey = process.env.EMBEDDING_API_KEY;
  if (!embeddingApi || !embeddingKey) {
    throw new Error('Embedding provider is not configured');
  }
  if (!text.trim()) throw new Error('Cannot generate an embedding for empty text');

  let response: Response;
  try {
    response = await fetch(embeddingApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${embeddingKey}`,
      },
      body: JSON.stringify({
        model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        input: text,
        dimensions: VECTOR_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Embedding provider request failed');
  }

  if (!response.ok) throw new Error(`Embedding provider returned HTTP ${response.status}`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Embedding provider returned invalid JSON');
  }
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.data[0])) {
    throw new Error('Embedding provider response did not contain a vector');
  }

  const rawVector = payload.data[0].embedding;
  if (!Array.isArray(rawVector)) throw new Error('Embedding provider response did not contain a vector');
  const vector = rawVector.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value),
  );
  if (vector.length !== rawVector.length || vector.length !== VECTOR_DIMENSIONS) {
    throw new Error(`Embedding provider returned an invalid vector dimension; expected ${VECTOR_DIMENSIONS}`);
  }
  return vector;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((text) => generateEmbedding(text)));
}

// ─── Document Ingestion ───────────────────────────────────────────────────────

export async function ingestDocument(
  collectionId: string,
  documentId: string,
  content: string,
  options?: {
    companyId?: string;
    source?: string;
    classification?: string;
    chunkSize?: number;
    overlap?: number;
    generateEmbeddings?: boolean;
  },
): Promise<IngestResult> {
  const startedAt = Date.now();
  try {
    const [collection, document] = await Promise.all([
      db.ragCollection.findUnique({ where: { id: collectionId } }),
      db.ragDocument.findUnique({ where: { id: documentId } }),
    ]);
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    if (!document) throw new Error(`Document ${documentId} not found`);
    if (document.collectionId !== collectionId) throw new Error('Document does not belong to the requested collection');

    const companyId = options?.companyId ?? document.companyId ?? collection.companyId ?? undefined;
    if (document.companyId && companyId !== document.companyId) throw new Error('Document company scope mismatch');
    if (collection.companyId && companyId !== collection.companyId) throw new Error('Collection company scope mismatch');

    const textChunks = chunkText(content, {
      chunkSize: options?.chunkSize,
      overlap: options?.overlap,
    });
    if (textChunks.length === 0) {
      return {
        documentId,
        chunksCreated: 0,
        chunksWithEmbeddings: 0,
        errors: ['No text content to chunk'],
        durationMs: Date.now() - startedAt,
      };
    }

    const shouldEmbed = options?.generateEmbeddings !== false;
    const embeddings = shouldEmbed
      ? await generateEmbeddings(textChunks.map((chunk) => chunk.content))
      : [];
    if (shouldEmbed && embeddings.length !== textChunks.length) {
      throw new Error('Embedding provider returned a different number of vectors than requested');
    }

    const createdChunks = await db.$transaction(async (transaction) => {
      const records = [];
      for (let index = 0; index < textChunks.length; index++) {
        const chunk = textChunks[index];
        records.push(await transaction.ragChunk.create({
          data: {
            documentId,
            companyId: companyId ?? null,
            content: chunk.content,
            position: chunk.position,
            embedding: embeddings[index] ? JSON.stringify(embeddings[index]) : null,
            metadata: JSON.stringify({
              chunkIndex: index,
              totalChunks: textChunks.length,
              source: options?.source ?? document.source,
              classification: options?.classification ?? document.classification,
              collectionName: collection.name,
              embeddingGenerated: Boolean(embeddings[index]),
            }),
          },
        }));
      }
      return records;
    });

    const errors: string[] = [];
    let vectorStore: 'qdrant' | 'mysql' | 'text_only' = shouldEmbed ? 'mysql' : 'text_only';
    if (embeddings.length > 0 && isQdrantConnected()) {
      try {
        await createCollection(collection.name, embeddings[0].length);
        await upsertPoints(collection.name, createdChunks.map((chunk, index) => ({
          id: chunk.id,
          vector: embeddings[index],
          payload: {
            chunkId: chunk.id,
            documentId,
            collectionId,
            companyId: companyId ?? null,
            collectionName: collection.name,
            content: chunk.content,
            position: chunk.position,
            source: options?.source ?? document.source,
          },
        })));
        vectorStore = 'qdrant';
      } catch (error) {
        errors.push(`Qdrant indexing failed; vectors remain stored in MySQL: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await db.ragDocument.update({
      where: { id: documentId },
      data: {
        status: vectorStore === 'qdrant' ? 'indexed' : vectorStore === 'mysql' ? 'indexed_local' : 'indexed_text_only',
        indexedAt: new Date(),
        chunkCount: textChunks.length,
      },
    });

    return {
      documentId,
      chunksCreated: createdChunks.length,
      chunksWithEmbeddings: embeddings.length,
      errors,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      documentId,
      chunksCreated: 0,
      chunksWithEmbeddings: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      durationMs: Date.now() - startedAt,
    };
  }
}

// ─── Hybrid Search ────────────────────────────────────────────────────────────

export async function hybridSearch(
  query: string,
  options?: {
    collectionId?: string;
    collectionName?: string;
    companyId?: string;
    userId?: string;
    limit?: number;
    vectorWeight?: number;
    keywordWeight?: number;
  },
): Promise<QueryResult> {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(options?.limit ?? 5, 1), 50);
  const vectorWeight = Math.max(options?.vectorWeight ?? 0.7, 0);
  const keywordWeight = Math.max(options?.keywordWeight ?? 0.3, 0);
  const collectionWhere: Prisma.RagCollectionWhereInput = {
    ...(options?.companyId ? { companyId: options.companyId } : {}),
    ...(options?.collectionId ? { id: options.collectionId } : {}),
    ...(options?.collectionName ? { name: options.collectionName } : {}),
  };
  const collections = await db.ragCollection.findMany({
    where: collectionWhere,
    select: { id: true, name: true },
    take: 100,
  });
  const collectionIds = collections.map((collection) => collection.id);
  const collectionNames = options?.collectionName
    ? collections.filter((collection) => collection.name === options.collectionName)
    : collections;

  const chunkWhere: Prisma.RagChunkWhereInput = {
    ...(options?.companyId ? { companyId: options.companyId } : {}),
    ...(options?.collectionId || options?.collectionName
      ? { document: { is: { collectionId: { in: collectionIds } } } }
      : {}),
  };
  const keywords = query.toLowerCase().split(/\s+/).filter((word) => word.length > 2).slice(0, 8);
  type SearchChunk = Prisma.RagChunkGetPayload<{
    include: { document: { select: { id: true; collectionId: true; name: true; source: true } } }
  }>
  let keywordChunks: SearchChunk[] = [];
  if (collectionIds.length === 0 && (options?.collectionId || options?.collectionName)) {
    keywordChunks = [];
  } else if (keywords.length > 0) {
    keywordChunks = await db.ragChunk.findMany({
      where: {
        ...chunkWhere,
        OR: keywords.map((keyword) => ({ content: { contains: keyword } })),
      },
      include: { document: { select: { id: true, collectionId: true, name: true, source: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit * 10,
    });
  } else {
    keywordChunks = await db.ragChunk.findMany({
      where: chunkWhere,
      include: { document: { select: { id: true, collectionId: true, name: true, source: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit * 10,
    });
  }

  const vectorScores = new Map<string, number>();
  const embeddingProviderConfigured = Boolean(process.env.EMBEDDING_API_URL && process.env.EMBEDDING_API_KEY);
  if (embeddingProviderConfigured && collectionNames.length > 0 && vectorWeight > 0) {
    try {
      const queryVector = await generateEmbedding(query);
      const vectorMatches = await Promise.all(collectionNames.map((collection) =>
        searchPoints(collection.name, queryVector, limit * 2, {
          ...(options?.companyId ? { companyId: options.companyId } : {}),
          collectionId: collection.id,
        }),
      ));
      const allMatches = vectorMatches.flat();
      const chunkIds = [...new Set(allMatches.flatMap((match) =>
        typeof match.payload.chunkId === 'string' ? [match.payload.chunkId] : [],
      ))];
      if (chunkIds.length > 0) {
        const vectorChunks = await db.ragChunk.findMany({
          where: { ...chunkWhere, id: { in: chunkIds } },
          include: { document: { select: { id: true, collectionId: true, name: true, source: true } } },
        });
        const allowedIds = new Set(vectorChunks.map((chunk) => chunk.id));
        for (const match of allMatches) {
          const chunkId = typeof match.payload.chunkId === 'string' ? match.payload.chunkId : undefined;
          if (chunkId && allowedIds.has(chunkId)) {
            vectorScores.set(chunkId, Math.max(vectorScores.get(chunkId) ?? Number.NEGATIVE_INFINITY, match.score));
          }
        }
      }
    } catch {
      // Vector search is unavailable for this query; keyword results remain real and usable.
    }
  }

  const chunksById = new Map(keywordChunks.map((chunk) => [chunk.id, chunk]));
  if (vectorScores.size > 0) {
    const missingVectorIds = [...vectorScores.keys()].filter((id) => !chunksById.has(id));
    if (missingVectorIds.length > 0) {
      const vectorChunks = await db.ragChunk.findMany({
        where: { ...chunkWhere, id: { in: missingVectorIds } },
        include: { document: { select: { id: true, collectionId: true, name: true, source: true } } },
      });
      for (const chunk of vectorChunks) chunksById.set(chunk.id, chunk);
    }
  }

  const scoredResults: SearchResult[] = [];
  for (const [id, chunk] of chunksById) {
    const vectorScore = vectorScores.get(id);
    const keywordScore = calculateKeywordScore(chunk.content, keywords);
    const normalizedWeight = vectorWeight + keywordWeight;
    const score = typeof vectorScore === 'number' && keywordScore > 0 && normalizedWeight > 0
      ? (vectorScore * vectorWeight + keywordScore * keywordWeight) / normalizedWeight
      : typeof vectorScore === 'number'
        ? vectorScore
        : keywordScore;
    let metadata: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(chunk.metadata || '{}');
      if (isRecord(parsed)) metadata = parsed;
    } catch {
      // Malformed optional metadata does not affect the stored text.
    }
    scoredResults.push({
      id,
      content: chunk.content,
      score,
      metadata: {
        ...metadata,
        documentId: chunk.document.id,
        collectionId: chunk.document.collectionId,
        documentName: chunk.document.name,
        companyId: chunk.companyId,
      },
      position: chunk.position,
      ...(chunk.document.source ? { source: chunk.document.source } : {}),
    });
  }

  scoredResults.sort((left, right) => right.score - left.score);
  const sortedResults = scoredResults.slice(0, limit);
  const durationMs = Date.now() - startedAt;
  const ragQuery = await db.ragQuery.create({
    data: {
      companyId: options?.companyId ?? null,
      userId: options?.userId ?? null,
      query,
      collectionId: options?.collectionId ?? null,
      resultCount: sortedResults.length,
      status: sortedResults.length > 0 ? 'success' : 'no_results',
      durationMs,
    },
  });

  const answerContent = sortedResults.length > 0
    ? `Retrieved excerpts (not a synthesized answer):\n\n${sortedResults.map((result, index) =>
        `[${index + 1}] (relevance ${result.score.toFixed(3)}) ${result.content.substring(0, 300)}${result.content.length > 300 ? '...' : ''}`,
      ).join('\n\n')}`
    : 'No matching documents were found.';
  await db.ragAnswer.create({
    data: {
      queryId: ragQuery.id,
      companyId: options?.companyId ?? null,
      content: answerContent,
      chunks: JSON.stringify(sortedResults.map((result) => result.id)),
      confidence: 0,
    },
  });

  return {
    query,
    results: sortedResults,
    totalFound: scoredResults.length,
    durationMs,
    ...(collectionNames.length === 1 ? { collectionName: collectionNames[0].name } : {}),
  };
}

function calculateKeywordScore(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const lower = content.toLowerCase();
  let matches = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) matches++;
  }
  return matches / keywords.length;
}

// ─── Document Management ──────────────────────────────────────────────────────

export async function deleteDocumentChunks(documentId: string): Promise<number> {
  // Delete from Qdrant first
  if (isQdrantConnected()) {
    try {
      const chunks = await db.ragChunk.findMany({
        where: { documentId },
        select: { id: true },
      });
      const { deletePoints } = await import('./qdrant');
      // Get collection name from document
      const doc = await db.ragDocument.findUnique({ where: { id: documentId } });
      if (doc) {
        const collection = await db.ragCollection.findUnique({ where: { id: doc.collectionId } });
        if (collection) {
          await deletePoints(collection.name, chunks.map((c) => c.id));
        }
      }
    } catch {
      // Ignore Qdrant errors
    }
  }

  const result = await db.ragChunk.deleteMany({ where: { documentId } });
  return result.count;
}

export async function getRagEngineStats(): Promise<{
  collections: number;
  documents: number;
  chunks: number;
  qdrantConnected: boolean;
  averageChunksPerDoc: number;
  totalQueries: number;
  averageQueryDurationMs: number;
}> {
  const [collections, documents, chunks, queries] = await Promise.all([
    db.ragCollection.count(),
    db.ragDocument.count(),
    db.ragChunk.count(),
    db.ragQuery.aggregate({ _avg: { durationMs: true }, _count: true }),
  ]);

  return {
    collections,
    documents,
    chunks,
    qdrantConnected: isQdrantConnected(),
    averageChunksPerDoc: documents > 0 ? Math.round(chunks / documents) : 0,
    totalQueries: queries._count,
    averageQueryDurationMs: Math.round(queries._avg.durationMs || 0),
  };
}