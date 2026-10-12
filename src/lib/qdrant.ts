import { createHash } from 'node:crypto'
import { db } from './db'
import type { Prisma } from '@prisma/client'

export interface QdrantConfig {
  host: string
  port: number
  protocol?: 'http' | 'https'
  apiKey?: string
  timeoutMs?: number
}

interface QdrantCollectionSummary {
  name: string
  vectors_count: number
  points_count: number
  status: string
}

interface QdrantPoint {
  id: string
  score: number
  payload: Record<string, unknown>
}

class QdrantRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'QdrantRequestError'
  }
}

let config: QdrantConfig | null = null
let connected = false
let connectionError: string | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getBaseUrl(): string {
  if (!config) throw new Error('Qdrant is not configured')
  const protocol = config.protocol ?? (config.port === 6333 ? 'http' : 'https')
  return `${protocol}://${config.host}:${config.port}`
}

function collectionPath(name: string): string {
  return `/collections/${encodeURIComponent(name)}`
}

async function qdrantRequest(path: string, options: RequestInit = {}): Promise<Response> {
  if (!config) throw new Error('Qdrant is not configured')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (config.apiKey) headers['api-key'] = config.apiKey

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new QdrantRequestError(response.status, text || `Qdrant returned HTTP ${response.status}`)
  }
  return response
}

export async function connectQdrant(
  cfg?: QdrantConfig,
): Promise<{ success: boolean; error?: string; latencyMs?: number; version?: string }> {
  const startedAt = Date.now()
  config = cfg ?? getDefaultConfig()
  if (!config) {
    connected = false
    connectionError = 'Qdrant configuration is missing'
    return { success: false, error: connectionError }
  }

  try {
    const response = await qdrantRequest('/collections')
    const payload: unknown = await response.json()
    const status = isRecord(payload) && isRecord(payload.status) ? payload.status : {}
    const result = isRecord(payload) && isRecord(payload.result) ? payload.result : {}
    const collections = Array.isArray(result.collections) ? result.collections : []
    const latencyMs = Date.now() - startedAt

    connected = true
    connectionError = null
    const version = typeof status.version === 'string' ? status.version : 'unknown'
    await db.infraService.upsert({
      where: { type: 'qdrant' },
      create: {
        name: 'Qdrant',
        type: 'qdrant',
        host: config.host,
        port: config.port,
        status: 'connected',
        connectedAt: new Date(),
        lastPingAt: new Date(),
        latencyMs,
        version,
        statsJson: JSON.stringify({ collections: collections.length }),
      },
      update: {
        host: config.host,
        port: config.port,
        status: 'connected',
        connectedAt: new Date(),
        lastPingAt: new Date(),
        latencyMs,
        version,
        statsJson: JSON.stringify({ collections: collections.length }),
        errorCount: 0,
        lastError: null,
      },
    }).catch(() => {})

    return { success: true, latencyMs, version }
  } catch (error) {
    connectionError = error instanceof Error ? error.message : 'Qdrant connection failed'
    connected = false
    await db.infraService.upsert({
      where: { type: 'qdrant' },
      create: { name: 'Qdrant', type: 'qdrant', status: 'error', lastError: connectionError, errorCount: 1 },
      update: { status: 'error', lastError: connectionError, errorCount: { increment: 1 } },
    }).catch(() => {})
    return { success: false, error: connectionError, latencyMs: Date.now() - startedAt }
  }
}

export function isQdrantConnected(): boolean {
  return connected
}

export function getQdrantError(): string | null {
  return connectionError
}

export async function createCollection(
  name: string,
  vectorSize = 1536,
  distance: 'cosine' | 'euclid' | 'dot' = 'cosine',
): Promise<void> {
  if (!connected) throw new Error('Qdrant is not connected')
  if (!Number.isSafeInteger(vectorSize) || vectorSize < 1) throw new Error('Vector size must be a positive integer')

  try {
    await qdrantRequest(collectionPath(name))
    return
  } catch (error) {
    if (!(error instanceof QdrantRequestError) || error.status !== 404) throw error
  }

  await qdrantRequest(collectionPath(name), {
    method: 'PUT',
    body: JSON.stringify({ vectors: { size: vectorSize, distance } }),
  })
}

export async function listCollections(): Promise<QdrantCollectionSummary[]> {
  if (connected) {
    const response = await qdrantRequest('/collections')
    const payload: unknown = await response.json()
    const result = isRecord(payload) && isRecord(payload.result) ? payload.result : {}
    const collections = Array.isArray(result.collections) ? result.collections : []
    return collections.flatMap((entry): QdrantCollectionSummary[] => {
      if (!isRecord(entry) || typeof entry.name !== 'string') return []
      const points = asNumber(entry.points_count) ?? 0
      return [{
        name: entry.name,
        vectors_count: asNumber(entry.vectors_count) ?? points,
        points_count: points,
        status: typeof entry.status === 'string' ? entry.status : 'unknown',
      }]
    })
  }

  const collections = await db.ragCollection.findMany({
    select: { name: true, documents: { select: { chunks: { select: { embedding: true } } } } },
  })
  return collections.map((collection) => {
    const chunks = collection.documents.flatMap((document) => document.chunks)
    return {
      name: collection.name,
      vectors_count: chunks.filter((chunk) => chunk.embedding !== null).length,
      points_count: chunks.length,
      status: 'mysql-local',
    }
  })
}

export async function deleteCollection(name: string): Promise<void> {
  if (!connected) throw new Error('Qdrant is not connected')
  await qdrantRequest(collectionPath(name), { method: 'DELETE' })
}

export async function upsertPoints(
  collection: string,
  points: Array<{ id: string; vector: number[]; payload?: Record<string, unknown> }>,
): Promise<void> {
  if (!connected) throw new Error('Qdrant is not connected; embeddings must be persisted in MySQL')
  for (const point of points) {
    if (point.vector.length === 0 || point.vector.some((value) => !Number.isFinite(value))) {
      throw new Error('Cannot upsert an invalid embedding vector')
    }
  }

  await qdrantRequest(`${collectionPath(collection)}/points`, {
    method: 'PUT',
    body: JSON.stringify({
      points: points.map((point) => ({
        id: toQdrantPointId(point.id),
        vector: point.vector,
        payload: { ...point.payload, chunkId: point.payload?.chunkId ?? point.id },
      })),
    }),
  })
}

export async function searchPoints(
  collection: string,
  vector: number[],
  limit = 5,
  filter?: Record<string, unknown>,
): Promise<QdrantPoint[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Search limit must be a positive integer')
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error('Query embedding is invalid')
  }

  if (!connected) return fallbackVectorSearch(vector, limit, filter)

  const qdrantFilter = buildQdrantFilter(filter)
  const response = await qdrantRequest(`${collectionPath(collection)}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector,
      limit: Math.min(limit, 1000),
      with_payload: true,
      ...(qdrantFilter ? { filter: qdrantFilter } : {}),
    }),
  })
  const payload: unknown = await response.json()
  const results = isRecord(payload) && Array.isArray(payload.result) ? payload.result : []
  return results.flatMap((entry): QdrantPoint[] => {
    if (!isRecord(entry)) return []
    const score = asNumber(entry.score)
    if (score === undefined) return []
    const rawId = typeof entry.id === 'string' || typeof entry.id === 'number' ? String(entry.id) : ''
    const pointPayload = isRecord(entry.payload) ? entry.payload : {}
    const id = typeof pointPayload.chunkId === 'string' ? pointPayload.chunkId : rawId
    if (!id) return []
    return [{ id, score, payload: pointPayload }]
  })
}

export async function deletePoints(collection: string, ids: string[]): Promise<void> {
  if (!connected) throw new Error('Qdrant is not connected')
  if (ids.length === 0) return
  await qdrantRequest(`${collectionPath(collection)}/points/delete`, {
    method: 'POST',
    body: JSON.stringify({ points: ids.map((id) => toQdrantPointId(id)) }),
  })
}

function buildQdrantFilter(filter?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!filter) return undefined
  const must: Array<Record<string, unknown>> = []
  for (const key of ['companyId', 'collectionId']) {
    const value = filter[key]
    if (typeof value === 'string') must.push({ key, match: { value } })
  }
  return must.length > 0 ? { must } : undefined
}

function toQdrantPointId(id: string): string {
  const characters = createHash('sha256').update(id).digest('hex').slice(0, 32).split('')
  characters[12] = '5'
  characters[16] = ((Number.parseInt(characters[16], 16) & 0x3) | 0x8).toString(16)
  const hex = characters.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function fallbackVectorSearch(
  queryVector: number[],
  limit: number,
  filter?: Record<string, unknown>,
): Promise<QdrantPoint[]> {
  const companyId = typeof filter?.companyId === 'string' ? filter.companyId : undefined
  const collectionId = typeof filter?.collectionId === 'string' ? filter.collectionId : undefined
  const where: Prisma.RagChunkWhereInput = {
    embedding: { not: null },
    ...(companyId ? { companyId } : {}),
    ...(collectionId ? { document: { is: { collectionId } } } : {}),
  }
  const chunks = await db.ragChunk.findMany({
    where,
    include: { document: { select: { collectionId: true, name: true, source: true } } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })

  const results: QdrantPoint[] = []
  for (const chunk of chunks) {
    if (!chunk.embedding) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(chunk.embedding)
    } catch {
      continue
    }
    if (!Array.isArray(parsed)) continue
    const storedVector = parsed.filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
    )
    if (storedVector.length !== parsed.length || storedVector.length !== queryVector.length) continue
    results.push({
      id: chunk.id,
      score: cosineSimilarity(queryVector, storedVector),
      payload: {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        collectionId: chunk.document.collectionId,
        companyId: chunk.companyId,
        collectionName: chunk.document.name,
        content: chunk.content,
        position: chunk.position,
        source: chunk.document.source,
      },
    })
  }

  return results.sort((left, right) => right.score - left.score).slice(0, limit)
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] * left[index]
    rightMagnitude += right[index] * right[index]
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)
  return denominator === 0 ? 0 : dot / denominator
}

export async function getQdrantStats(): Promise<{
  connected: boolean
  version?: string
  collectionsCount?: number
  totalPoints?: number
  totalVectors?: number
}> {
  if (!connected) return { connected: false }
  try {
    const response = await qdrantRequest('/collections')
    const payload: unknown = await response.json()
    const status = isRecord(payload) && isRecord(payload.status) ? payload.status : {}
    const result = isRecord(payload) && isRecord(payload.result) ? payload.result : {}
    const collections = Array.isArray(result.collections) ? result.collections : []
    const summaries = collections.flatMap((entry) => isRecord(entry) ? [entry] : [])
    const totalPoints = summaries.reduce((sum, collection) => sum + (asNumber(collection.points_count) ?? 0), 0)
    const totalVectors = summaries.reduce((sum, collection) => sum + (asNumber(collection.vectors_count) ?? asNumber(collection.points_count) ?? 0), 0)
    return {
      connected: true,
      ...(typeof status.version === 'string' ? { version: status.version } : {}),
      collectionsCount: summaries.length,
      totalPoints,
      totalVectors,
    }
  } catch (error) {
    connected = false
    connectionError = error instanceof Error ? error.message : 'Qdrant statistics query failed'
    return { connected: false }
  }
}

export async function pingQdrant(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  if (!connected || !config) return { success: false, latencyMs: 0, error: 'Not connected' }
  const startedAt = Date.now()
  try {
    await qdrantRequest('/healthz')
    const latencyMs = Date.now() - startedAt
    await db.infraService.update({
      where: { type: 'qdrant' },
      data: { lastPingAt: new Date(), latencyMs, status: 'connected' },
    }).catch(() => {})
    return { success: true, latencyMs }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Qdrant health check failed'
    connected = false
    connectionError = message
    await db.infraService.update({
      where: { type: 'qdrant' },
      data: { status: 'error', lastError: message, errorCount: { increment: 1 } },
    }).catch(() => {})
    return { success: false, latencyMs: Date.now() - startedAt, error: message }
  }
}

function getDefaultConfig(): QdrantConfig | null {
  if (process.env.QDRANT_URL) {
    try {
      const url = new URL(process.env.QDRANT_URL)
      const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 6333
      return {
        host: url.hostname,
        port,
        protocol: url.protocol === 'https:' ? 'https' : 'http',
        apiKey: process.env.QDRANT_API_KEY || url.password || undefined,
      }
    } catch {
      return null
    }
  }

  if (process.env.QDRANT_HOST) {
    const port = Number.parseInt(process.env.QDRANT_PORT || '6333', 10)
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) return null
    return {
      host: process.env.QDRANT_HOST,
      port,
      protocol: process.env.QDRANT_PROTOCOL === 'https' ? 'https' : 'http',
      apiKey: process.env.QDRANT_API_KEY || undefined,
      timeoutMs: Number.parseInt(process.env.QDRANT_TIMEOUT || '10000', 10),
    }
  }
  return null
}

export function getQdrantConfig(): QdrantConfig | null {
  return config ?? getDefaultConfig()
}
