import { createServer } from 'http'
import { Server } from 'socket.io'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const PORT = 3004

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

function formatItem(item: any) {
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

// ─── Socket.IO Connection ─────────────────────────────────────────────────────

io.on('connection', (socket) => {
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
      const { queue, jobType, payload, priority } = data

      // Find queue by name
      const queueRecord = await db.jobQueue.findUnique({ where: { name: queue } })
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
          jobType,
          priority: typeof priority === 'number' ? priority : 5,
          payload: payload ? JSON.stringify(payload) : '{}',
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
      const { queue } = data

      const queueRecord = await db.jobQueue.findUnique({ where: { name: queue } })
      if (!queueRecord) {
        socket.emit('job:error', { event: 'job:dequeue', error: `Queue "${queue}" not found` })
        return
      }

      if (!queueRecord.isActive) {
        socket.emit('job:error', { event: 'job:dequeue', error: `Queue "${queue}" is not active` })
        return
      }

      // Check concurrency
      const processingCount = await db.queueItem.count({
        where: { queueId: queueRecord.id, status: 'processing' },
      })

      if (processingCount >= queueRecord.concurrency) {
        socket.emit('job:error', {
          event: 'job:dequeue',
          error: `Queue "${queue}" is at max concurrency (${processingCount}/${queueRecord.concurrency})`,
        })
        return
      }

      // Find highest priority queued item
      const now = new Date()
      const item = await db.queueItem.findFirst({
        where: {
          queueId: queueRecord.id,
          status: 'queued',
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      })

      if (!item) {
        socket.emit('job:error', { event: 'job:dequeue', error: `No items available in "${queue}"` })
        return
      }

      const updated = await db.queueItem.update({
        where: { id: item.id },
        data: { status: 'processing', startedAt: new Date(), attempts: item.attempts + 1 },
      })

      const formatted = formatItem(updated)

      // Emit assigned event to requesting client
      socket.emit('job:assigned', { item: formatted, queue: queueRecord.name })

      // Broadcast updated status
      await broadcastQueueUpdate(queueRecord.id)

      console.log(`[Queue Service] Job dequeued: ${item.id} → processing in "${queue}"`)
    } catch (err) {
      console.error('[Queue Service] job:dequeue error:', err)
      socket.emit('job:error', { event: 'job:dequeue', error: 'Failed to dequeue job' })
    }
  })

  // ─── job:complete ─────────────────────────────────────────────────────────
  socket.on('job:complete', async (data: CompleteJob) => {
    try {
      const { itemId, result, error } = data

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

      let newStatus: string
      let updateData: any = { completedAt: new Date() }

      if (error) {
        // Handle failure with retry logic
        if (item.attempts < item.maxAttempts) {
          newStatus = 'queued'
          updateData = {
            status: 'queued',
            attempts: item.attempts,
            error: error,
            startedAt: null,
          }
        } else {
          newStatus = 'failed'
          updateData = {
            status: 'failed',
            error: error || 'Max attempts reached',
            completedAt: new Date(),
          }
        }
      } else {
        newStatus = 'completed'
        updateData = {
          status: 'completed',
          completedAt: new Date(),
        }
      }

      const updated = await db.queueItem.update({
        where: { id: itemId },
        data: updateData,
      })

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
      const { itemId } = data

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

      const updated = await db.queueItem.update({
        where: { id: itemId },
        data: { status: 'cancelled', completedAt: new Date() },
      })

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
      const { queue } = data
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

// ─── Background Worker ────────────────────────────────────────────────────────
// Jobs are dequeued and dispatched to registered handlers by jobType.
// The worker marks items as processing and awaits the handler result.

const jobHandlers: Record<string, (payload: Record<string, unknown>) => Promise<Record<string, unknown>>> = {}

export function registerHandler(jobType: string, handler: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  jobHandlers[jobType] = handler
}

async function backgroundWorker() {
  console.log('[Queue Service] Background worker started (processes every 5s)')

  const tick = async () => {
    try {
      const queues = await db.jobQueue.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      })

      for (const queue of queues) {
        const processingCount = await db.queueItem.count({
          where: { queueId: queue.id, status: 'processing' },
        })
        if (processingCount >= queue.concurrency) continue

        const now = new Date()
        const item = await db.queueItem.findFirst({
          where: {
            queueId: queue.id,
            status: 'queued',
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        })

        if (!item) continue

        const processing = await db.queueItem.update({
          where: { id: item.id },
          data: { status: 'processing', startedAt: new Date(), attempts: item.attempts + 1 },
        })

        const queueName = queue.name
        console.log(`[Worker] Processing job ${item.id} (${item.jobType}) from "${queueName}"`)

        io.emit('job:assigned', { item: formatItem(processing), queue: queueName })
        await broadcastQueueUpdate(queue.id)

        // Dispatch to registered handler or complete with no-handler result
        try {
          const payload = item.payload ? JSON.parse(item.payload as string) : {}
          const handler = jobHandlers[item.jobType]

          if (handler) {
            const result = await handler(payload)
            const completed = await db.queueItem.update({
              where: { id: item.id },
              data: { status: 'completed', completedAt: new Date() },
            })
            io.emit('job:completed', { item: formatItem(completed), result })
            console.log(`[Worker] Job ${item.id} → completed`)
          } else {
            // No handler registered — mark as completed with acknowledgement
            const completed = await db.queueItem.update({
              where: { id: item.id },
              data: { status: 'completed', completedAt: new Date() },
            })
            io.emit('job:completed', {
              item: formatItem(completed),
              result: { acknowledged: true, jobType: item.jobType, note: 'No dedicated handler registered' },
            })
            console.log(`[Worker] Job ${item.id} → completed (no handler, auto-acknowledged)`)
          }
        } catch (handlerErr) {
          const errMsg = handlerErr instanceof Error ? handlerErr.message : 'Handler error'
          const fresh = await db.queueItem.findUnique({ where: { id: item.id } })
          if (fresh && fresh.attempts < fresh.maxAttempts) {
            await db.queueItem.update({
              where: { id: item.id },
              data: { status: 'queued', startedAt: null, error: errMsg },
            })
            console.log(`[Worker] Job ${item.id} → requeued (${errMsg})`)
          } else {
            const failed = await db.queueItem.update({
              where: { id: item.id },
              data: { status: 'failed', completedAt: new Date(), error: errMsg },
            })
            io.emit('job:completed', { item: formatItem(failed), error: errMsg })
            console.log(`[Worker] Job ${item.id} → failed (${errMsg})`)
          }
        }

        await broadcastQueueUpdate(queue.id)
        break
      }
    } catch (err) {
      console.error('[Worker] Tick error:', err)
    }
  }

  setInterval(tick, 5000)
}

// ─── Start Server ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, async () => {
  console.log(`[Queue Service] Socket.IO server running on port ${PORT}`)
  await db.$connect()
  console.log('[Queue Service] Database connected')
  backgroundWorker()
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