import { createHash, timingSafeEqual } from 'node:crypto'
import { cancelJob, completeJob, dequeue, failJob, type QueueItemData } from '../../src/lib/job-queue'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { mayOperateQueues } from '../../src/lib/access/queue'
import { guardLiveSession } from '../../src/lib/realtime/session-guard'
import { db } from '../../src/lib/db'
import { handshakeToken, verifyInternalSessionToken, type SessionDb } from '../shared/internal-auth'
import { pollRegisteredJobs } from './registered-handlers'
export { registerHandler } from './registered-handlers'

// Browsers allowed to open a socket. Same-origin deployments go through the
// gateway and need no entry; set QUEUE_CORS_ORIGIN for anything else.
const CORS_ORIGIN = (process.env.QUEUE_CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/queue/socket.io',
  serveClient: false,
  cors: {
    origin: CORS_ORIGIN.length ? CORS_ORIGIN : false,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const PORT = Number(process.env.QUEUE_PORT || 3004)

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueuedJob {
  queue: string
  jobType: string
  payload?: Record<string, unknown>
  priority?: number
}

interface DequeueRequest {
  queue: string
}

interface CompleteJob {
  itemId: string
  result?: Record<string, unknown>
  error?: string
}

interface CancelJob {
  itemId: string
}

interface SubscribeRequest {
  queue: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseQueueStatus(isActive: boolean): string {
  return isActive ? 'active' : 'paused'
}

async function getQueueWithCounts(queueId?: string) {
  const where = queueId ? { id: queueId } : {}
  const queues = await db.jobQueue.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  })

  const queueIds = queues.map((q) => q.id)
  const itemCounts = queueIds.length > 0
    ? await db.queueItem.groupBy({
        by: ['queueId', 'status'],
        where: { queueId: { in: queueIds } },
        _count: true,
      })
    : []

  const countMap: Record<string, Record<string, number>> = {}
  for (const c of itemCounts) {
    if (!countMap[c.queueId]) countMap[c.queueId] = {}
    countMap[c.queueId][c.status] = c._count
  }

  return queues.map((q) => {
    const counts = countMap[q.id] || {}
    return {
      id: q.id,
      name: q.name,
      description: q.description,
      status: parseQueueStatus(q.isActive),
      concurrency: q.concurrency,
      maxRetries: q.maxRetries,
      totalItems: Object.values(counts).reduce((a, b) => a + b, 0),
      pendingItems: counts.queued || 0,
      processingItems: counts.processing || 0,
      completedItems: counts.completed || 0,
      failedItems: counts.failed || 0,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    }
  })
}

async function getQueueItems(queueId: string, limit = 50) {
  return db.queueItem.findMany({
    where: { queueId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
}

function formatItem(item: QueueItemData) {
  return {
    id: item.id,
    queueId: item.queueId,
    jobId: item.jobId,
    jobType: item.jobType,
    priority: item.priority,
    payload: item.payload,
    status: item.status,
    attempts: item.attempts,
    maxAttempts: item.maxAttempts,
    error: item.error,
    startedAt: item.startedAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    scheduledAt: item.scheduledAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  }
}

async function broadcastQueueStatus() {
  const queues = await getQueueWithCounts()
  io.emit('queue:status', { queues })
}

async function broadcastQueueUpdate(queueId: string) {
  const queues = await getQueueWithCounts(queueId)
  const queue = queues[0] || null
  if (queue) {
    const items = await getQueueItems(queueId, 50)
    io.emit('queue:update', { queue, items: items.map(formatItem) })
  }
}

// ─── Authentication ───────────────────────────────────────────────────────────
//
// The job queue is internal infrastructure: its events describe how work is
// routed and executed inside ALO Labs. Every connection must present an
// INTERNAL session token in the handshake (`auth.token` or a Bearer header)
// before it receives a single event or may enqueue, dequeue or cancel a job.
// Client-portal sessions are refused. See ../shared/internal-auth.ts.
//
// Trusted workers that have no user session may use QUEUE_SERVICE_TOKEN
// (a long random secret shared out-of-band) instead.

function isServiceToken(token: string): boolean {
  const expected = process.env.QUEUE_SERVICE_TOKEN ?? ''
  if (expected.length < 32 || !token) return false
  const a = createHash('sha256').update(token).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

io.use(async (socket, next) => {
  const token = handshakeToken(socket.handshake)
  if (!token) return next(new Error('Authentication required'))
  if (isServiceToken(token)) {
    socket.data.userId = 'service'
    socket.data.role = 'service'
    return next()
  }
  const identity = await verifyInternalSessionToken(db as unknown as SessionDb, token)
  if (!identity || !mayOperateQueues(identity.role)) return next(new Error('Authentication required'))
  socket.data.userId = identity.userId
  socket.data.role = identity.role
  next()
})

// ─── Socket.IO Connection ─────────────────────────────────────────────────────

io.on('connection', (socket) => {
  const token = handshakeToken(socket.handshake)
  guardLiveSession(socket, async () => {
    if (socket.data.role === 'service') return isServiceToken(token)
    const identity = await verifyInternalSessionToken(db as unknown as SessionDb, token, false)
    return !!identity && identity.userId === socket.data.userId && identity.role === socket.data.role
  })
  console.log(`[Queue Service] Client connected: ${socket.id}`)

  // Send current status on connect
  ;(async () => {
    try {
      const queues = await getQueueWithCounts()
      socket.emit('queue:status', { queues })
      socket.emit('queue:stats', await getAggregateStats())
    } catch (err) {
      console.error('[Queue Service] Error sending initial status:', err)
    }
  })()

  // ─── job:enqueue ──────────────────────────────────────────────────────────
  socket.on('job:enqueue', async (data: QueuedJob) => {
    try {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        socket.emit('job:error', { event: 'job:enqueue', error: 'Invalid payload' })
        return
      }
      const { queue, jobType, payload, priority } = data
      if (typeof queue !== 'string' || !queue.trim() || queue.length > 120) {
        socket.emit('job:error', { event: 'job:enqueue', error: 'Invalid queue name' })
        return
      }
      if (typeof jobType !== 'string' || !jobType.trim() || jobType.length > 120) {
        socket.emit('job:error', { event: 'job:enqueue', error: 'Invalid jobType' })
        return
      }
      const serializedPayload = payload !== undefined ? JSON.stringify(payload) : '{}'
      if (serializedPayload.length > 262_144) {
        socket.emit('job:error', { event: 'job:enqueue', error: 'Payload exceeds 256 KB limit' })
        return
      }
      const normalizedPriority =
        typeof priority === 'number' && Number.isFinite(priority)
          ? Math.min(100, Math.max(0, Math.round(priority)))
          : 5

      // Find queue by name
      const queueRecord = await db.jobQueue.findUnique({ where: { name: queue.trim() } })
      if (!queueRecord) {
        socket.emit('job:error', { event: 'job:enqueue', error: `Queue "${queue}" not found` })
        return
      }

      if (!queueRecord.isActive) {
        socket.emit('job:error', { event: 'job:enqueue', error: `Queue "${queue}" is not active` })
        return
      }

      const item = await db.queueItem.create({
        data: {
          queueId: queueRecord.id,
          jobType: jobType.trim(),
          priority: normalizedPriority,
          payload: serializedPayload,
          status: 'queued',
          maxAttempts: queueRecord.maxRetries,
        },
      })

      const formatted = formatItem(item)

      // Broadcast queued event
      io.emit('job:queued', { item: formatted, queue: queueRecord.name })

      // Broadcast updated queue status
      await broadcastQueueUpdate(queueRecord.id)

      console.log(`[Queue Service] Job enqueued: ${item.id} (${jobType}) in "${queue}"`)
    } catch (err) {
      console.error('[Queue Service] job:enqueue error:', err)
      socket.emit('job:error', { event: 'job:enqueue', error: 'Failed to enqueue job' })
    }
  })

  // ─── job:dequeue ──────────────────────────────────────────────────────────
  socket.on('job:dequeue', async (data: DequeueRequest) => {
    try {
      if (!data || typeof data !== 'object' || typeof data.queue !== 'string' || !data.queue.trim()) {
        socket.emit('job:error', { event: 'job:dequeue', error: 'Invalid queue name' })
        return
      }
      const queue = data.queue.trim()

      const queueRecord = await db.jobQueue.findUnique({ where: { name: queue } })
      if (!queueRecord) {
        socket.emit('job:error', { event: 'job:dequeue', error: `Queue "${queue}" not found` })
        return
      }

      if (!queueRecord.isActive) {
        socket.emit('job:error', { event: 'job:dequeue', error: `Queue "${queue}" is not active` })
        return
      }

      const updated = await dequeue(queue, { workerId: `socket-${socket.id}` })
      if (!updated) {
        socket.emit('job:error', { event: 'job:dequeue', error: 'No item or queue slot available' })
        return
      }

      const formatted = formatItem(updated)

      // Emit assigned event to requesting client
      socket.emit('job:assigned', { item: formatted, queue: queueRecord.name })

      // Broadcast updated status
      await broadcastQueueUpdate(queueRecord.id)

      console.log(`[Queue Service] Job dequeued: ${updated.id} → processing in "${queue}"`)
    } catch (err) {
      console.error('[Queue Service] job:dequeue error:', err)
      socket.emit('job:error', { event: 'job:dequeue', error: 'Failed to dequeue job' })
    }
  })

  // ─── job:complete ─────────────────────────────────────────────────────────
  socket.on('job:complete', async (data: CompleteJob) => {
    try {
      if (!data || typeof data !== 'object' || typeof data.itemId !== 'string' || !data.itemId.trim()) {
        socket.emit('job:error', { event: 'job:complete', error: 'Invalid itemId' })
        return
      }
      const itemId = data.itemId.trim()
      const result = data.result
      const error = typeof data.error === 'string' && data.error.length > 0 ? data.error.slice(0, 4000) : undefined

      const item = await db.queueItem.findUnique({ where: { id: itemId } })
      if (!item) {
        socket.emit('job:error', { event: 'job:complete', error: `Item "${itemId}" not found` })
        return
      }

      if (item.status !== 'processing') {
        socket.emit('job:error', {
          event: 'job:complete',
          error: `Item must be in "processing" status. Current: ${item.status}`,
        })
        return
      }

      const claim = { lockedBy: `socket-${socket.id}`, attempts: item.attempts }
      const updated = error ? await failJob(itemId, error, { claim }) : await completeJob(itemId, result, claim)
      const newStatus = updated.status

      const formatted = formatItem(updated)

      io.emit('job:completed', {
        item: formatted,
        result: error ? undefined : result,
        error: error || undefined,
      })

      await broadcastQueueUpdate(item.queueId)

      console.log(
        `[Queue Service] Job ${itemId} → ${newStatus}${error ? ` (${error})` : ''}`
      )
    } catch (err) {
      console.error('[Queue Service] job:complete error:', err)
      socket.emit('job:error', { event: 'job:complete', error: 'Failed to complete job' })
    }
  })

  // ─── job:cancel ───────────────────────────────────────────────────────────
  socket.on('job:cancel', async (data: CancelJob) => {
    try {
      if (!data || typeof data !== 'object' || typeof data.itemId !== 'string' || !data.itemId.trim()) {
        socket.emit('job:error', { event: 'job:cancel', error: 'Invalid itemId' })
        return
      }
      const itemId = data.itemId.trim()

      const item = await db.queueItem.findUnique({ where: { id: itemId } })
      if (!item) {
        socket.emit('job:error', { event: 'job:cancel', error: `Item "${itemId}" not found` })
        return
      }

      if (item.status !== 'queued' && item.status !== 'processing') {
        socket.emit('job:error', {
          event: 'job:cancel',
          error: `Cannot cancel item in "${item.status}" status`,
        })
        return
      }

      const updated = await cancelJob(itemId, 'cancelled via queue socket')
      if (!updated) {
        socket.emit('job:error', {
          event: 'job:cancel',
          error: `Cannot cancel item in "${item.status}" status`,
        })
        return
      }

      const formatted = formatItem(updated)

      io.emit('job:cancelled', { item: formatted })

      await broadcastQueueUpdate(item.queueId)

      console.log(`[Queue Service] Job cancelled: ${itemId}`)
    } catch (err) {
      console.error('[Queue Service] job:cancel error:', err)
      socket.emit('job:error', { event: 'job:cancel', error: 'Failed to cancel job' })
    }
  })

  // ─── queue:subscribe ──────────────────────────────────────────────────────
  socket.on('queue:subscribe', async (data: SubscribeRequest) => {
    try {
      if (!data || typeof data !== 'object' || typeof data.queue !== 'string' || !data.queue.trim()) {
        socket.emit('job:error', { event: 'queue:subscribe', error: 'Invalid queue name' })
        return
      }
      const queue = data.queue.trim()
      const queueRecord = await db.jobQueue.findUnique({ where: { name: queue } })
      if (!queueRecord) {
        socket.emit('job:error', { event: 'queue:subscribe', error: `Queue "${queue}" not found` })
        return
      }

      socket.join(`queue:${queueRecord.id}`)
      console.log(`[Queue Service] Client ${socket.id} subscribed to queue: ${queue}`)

      // Send current items for this queue
      const items = await getQueueItems(queueRecord.id, 50)
      socket.emit('queue:items', {
        queueId: queueRecord.id,
        queueName: queue,
        items: items.map(formatItem),
      })
    } catch (err) {
      console.error('[Queue Service] queue:subscribe error:', err)
    }
  })

  // ─── queue:status ─────────────────────────────────────────────────────────
  socket.on('queue:status', async () => {
    try {
      const queues = await getQueueWithCounts()
      socket.emit('queue:status', { queues })
    } catch (err) {
      console.error('[Queue Service] queue:status error:', err)
    }
  })

  // ─── queue:stats ──────────────────────────────────────────────────────────
  socket.on('queue:stats', async () => {
    try {
      socket.emit('queue:stats', await getAggregateStats())
    } catch (err) {
      console.error('[Queue Service] queue:stats error:', err)
    }
  })

  // ─── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[Queue Service] Client disconnected: ${socket.id}`)
  })

  socket.on('error', (error) => {
    console.error(`[Queue Service] Socket error (${socket.id}):`, error)
  })
})

// ─── Aggregate Stats ──────────────────────────────────────────────────────────

async function getAggregateStats() {
  const counts = await db.queueItem.groupBy({
    by: ['status'],
    _count: true,
  })

  const stats: Record<string, number> = {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  }

  for (const c of counts) {
    stats[c.status] = c._count
    stats.total += c._count
  }

  const queueCount = await db.jobQueue.count()

  return {
    queues: queueCount,
    ...stats,
  }
}

// Monitor by default. An in-process extension can opt in to its own job types;
// core queues are owned by the app and unregistered jobs are never acknowledged.
// ─── Start Server ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, process.env.SOCKET_BIND_HOST || '127.0.0.1', async () => {
  console.log(`[Queue Service] Socket.IO server running on port ${PORT}`)
  await db.$connect()
  console.log('[Queue Service] Database connected')
  const timer = setInterval(() => {
    if (io.engine.clientsCount) void broadcastQueueStatus().catch(() => console.error('[Queue] status query failed'))
    void pollRegisteredJobs(async (item, queue, result) => {
      if (!io.sockets.sockets.size) return
      if (item.status === 'processing') io.emit('job:assigned', { item: formatItem(item), queue })
      if (item.status === 'completed') io.emit('job:completed', { item: formatItem(item), result })
      if (item.status === 'failed') io.emit('job:completed', { item: formatItem(item), error: item.error })
      await broadcastQueueUpdate(item.queueId)
    }).catch(() => console.error('[Queue] extension worker failed'))
  }, 5000)
  timer.unref()
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Queue Service] Received SIGTERM, shutting down...')
  await db.$disconnect()
  httpServer.close(() => {
    console.log('[Queue Service] Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', async () => {
  console.log('[Queue Service] Received SIGINT, shutting down...')
  await db.$disconnect()
  httpServer.close(() => {
    console.log('[Queue Service] Server closed')
    process.exit(0)
  })
})