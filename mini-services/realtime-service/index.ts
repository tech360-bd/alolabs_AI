/**
 * ALO Labs Real-Time Service
 * Socket.IO server for real-time event broadcasting.
 * Handles connection auth, room management, and Redis pub/sub for multi-instance scaling.
 */

import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import Redis from 'ioredis'

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.REALTIME_PORT || '3005', 10)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || '*'
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET
if (!JWT_SECRET) {
  console.error('[Realtime Service] FATAL: JWT_SECRET or SESSION_SECRET environment variable is required')
  process.exit(1)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string
    companyId?: string
    role?: string
    authenticated: boolean
  }
}

interface RoomJoinRequest {
  room: string
  companyId?: string
}

interface RoomLeaveRequest {
  room: string
}

interface NotificationPayload {
  type: string
  title: string
  message: string
  data?: Record<string, unknown>
  companyId?: string
  userId?: string
}

interface DashboardUpdatePayload {
  companyId: string
  widget?: string
  data?: Record<string, unknown>
}

interface AIResponsePayload {
  taskId: string
  companyId: string
  status: 'started' | 'progress' | 'completed' | 'error'
  content?: string
  progress?: number
  error?: string
}

interface QueueUpdatePayload {
  queueId: string
  status: string
  counts?: Record<string, number>
  itemId?: string
  itemStatus?: string
}

interface SocialEventPayload {
  platform: string
  eventType: string
  data: Record<string, unknown>
  companyId: string
}

interface WhatsAppMessagePayload {
  companyId: string
  conversationId: string
  message: {
    id: string
    from: string
    text: string
    timestamp: string
  }
}

interface EmailNewPayload {
  companyId: string
  email: {
    id: string
    from: string
    subject: string
    preview: string
    timestamp: string
  }
}

// ─── HTTP Server & Socket.IO ──────────────────────────────────────────────────

const httpServer = createServer()

const io = new Server(httpServer, {
  path: '/socket.io',
  cors: {
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ─── Redis Pub/Sub ────────────────────────────────────────────────────────────

let redisPublisher: Redis | null = null
let redisSubscriber: Redis | null = null
let redisAvailable = false

async function initRedis() {
  try {
    redisPublisher = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true })
    redisSubscriber = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true })

    await Promise.all([redisPublisher.connect(), redisSubscriber.connect()])

    // Subscribe to all realtime channels
    await redisSubscriber.subscribe('realtime:notification:new')
    await redisSubscriber.subscribe('realtime:dashboard:update')
    await redisSubscriber.subscribe('realtime:ai:response')
    await redisSubscriber.subscribe('realtime:queue:update')
    await redisSubscriber.subscribe('realtime:social:event')
    await redisSubscriber.subscribe('realtime:whatsapp:message')
    await redisSubscriber.subscribe('realtime:email:new')

    redisSubscriber.on('message', (channel: string, message: string) => {
      try {
        const data = JSON.parse(message)
        const eventName = channel.replace('realtime:', '')

        // Extract target info for room-based delivery
        const companyId = data.companyId
        const userId = data.userId
        const room = data.room

        if (room) {
          io.to(room).emit(eventName, data)
        } else if (companyId) {
          io.to(`company:${companyId}`).emit(eventName, data)
        } else if (userId) {
          io.to(`user:${userId}`).emit(eventName, data)
        } else {
          io.emit(eventName, data)
        }
      } catch (err) {
        console.error(`[Realtime Service] Error processing Redis message on ${channel}:`, err)
      }
    })

    redisAvailable = true
    console.log(`[Realtime Service] Redis connected: ${REDIS_URL}`)
  } catch (err) {
    redisAvailable = false
    redisPublisher = null
    redisSubscriber = null
    console.warn('[Realtime Service] Redis not available, running in single-instance mode:', err instanceof Error ? err.message : err)
  }
}

/**
 * Publish an event to Redis (for multi-instance fan-out).
 * Falls back to local emit if Redis is unavailable.
 */
function publishEvent(event: string, payload: Record<string, unknown>) {
  if (redisAvailable && redisPublisher) {
    const channel = `realtime:${event}`
    redisPublisher.publish(channel, JSON.stringify(payload)).catch(err => {
      console.error(`[Realtime Service] Redis publish error on ${channel}:`, err)
    })
  }
}

// ─── JWT / Session Verification ───────────────────────────────────────────────

/**
 * Verify a token (JWT or session token) and return user info.
 * Supports both standard JWT and the ALO Labs session token format.
 */
async function verifyToken(token: string): Promise<{ userId: string; companyId?: string; role?: string } | null> {
  try {
    // Try JWT decode (base64 payload)
    const parts = token.split('.')
    if (parts.length === 3) {
      // Standard JWT: header.payload.signature
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      if (payload.userId || payload.sub) {
        return {
          userId: payload.userId || payload.sub,
          companyId: payload.companyId,
          role: payload.role,
        }
      }
    }

    // Try session token via database lookup (if Prisma is available)
    try {
      const { PrismaClient } = await import('@prisma/client')
      const db = new PrismaClient()
      const session = await db.settings.findUnique({
        where: { key: `session:${token}` },
      })
      if (session) {
        const data = JSON.parse(session.value)
        if (data.userId) {
          return { userId: data.userId }
        }
      }
      await db.$disconnect()
    } catch {
      // Prisma not available, skip DB-based verification
    }

    return null
  } catch {
    return null
  }
}

// ─── Connection Metrics ───────────────────────────────────────────────────────

let totalConnections = 0
let activeConnections = 0
let totalMessagesReceived = 0
let totalMessagesSent = 0

function getConnectionMetrics() {
  return {
    activeConnections,
    totalConnections,
    totalMessagesReceived,
    totalMessagesSent,
    redisAvailable,
    uptime: process.uptime(),
    rooms: Object.keys(io.sockets.adapter.rooms).length,
  }
}

// ─── Socket.IO Connection Handler ─────────────────────────────────────────────

io.on('connection', (socket: AuthenticatedSocket) => {
  totalConnections++
  activeConnections++
  console.log(`[Realtime Service] Client connected: ${socket.id} (total: ${activeConnections})`)

  // Initialize socket data
  socket.data = { authenticated: false }

  // ─── Authentication ─────────────────────────────────────────────────────
  socket.on('auth:verify', async (data: { token: string }, callback?: (response: { success: boolean; error?: string; userId?: string }) => void) => {
    const { token } = data
    if (!token) {
      socket.emit('auth:error', { error: 'No token provided' })
      callback?.({ success: false, error: 'No token provided' })
      return
    }

    const user = await verifyToken(token)
    if (!user) {
      socket.emit('auth:error', { error: 'Invalid token' })
      callback?.({ success: false, error: 'Invalid token' })
      // Disconnect after a short delay
      setTimeout(() => {
        if (!socket.data.authenticated) socket.disconnect()
      }, 3000)
      return
    }

    socket.data.userId = user.userId
    socket.data.companyId = user.companyId
    socket.data.role = user.role
    socket.data.authenticated = true

    // Auto-join user room and company room
    socket.join(`user:${user.userId}`)
    if (user.companyId) {
      socket.join(`company:${user.companyId}`)
    }

    console.log(`[Realtime Service] User authenticated: ${user.userId} (socket: ${socket.id})`)
    socket.emit('auth:success', { userId: user.userId, companyId: user.companyId })
    callback?.({ success: true, userId: user.userId })
  })

  // ─── Room Management ───────────────────────────────────────────────────
  socket.on('room:join', (data: RoomJoinRequest, callback?: (response: { success: boolean; error?: string; room?: string }) => void) => {
    if (!socket.data.authenticated) {
      callback?.({ success: false, error: 'Not authenticated' })
      return
    }

    const roomName = data.room
    if (!roomName) {
      callback?.({ success: false, error: 'Room name is required' })
      return
    }

    // Only allow company-prefixed or user-prefixed rooms, plus specific system rooms
    const allowedPrefixes = ['company:', 'user:', 'dashboard:', 'ai:', 'queue:', 'social:', 'whatsapp:', 'email:']
    const isAllowed = allowedPrefixes.some(p => roomName.startsWith(p))

    if (!isAllowed && roomName !== 'notifications') {
      callback?.({ success: false, error: 'Invalid room name' })
      return
    }

    // If companyId is specified, verify the user belongs to that company
    if (data.companyId && socket.data.companyId && data.companyId !== socket.data.companyId) {
      callback?.({ success: false, error: 'Cannot join room for a different company' })
      return
    }

    socket.join(roomName)
    console.log(`[Realtime Service] Socket ${socket.id} joined room: ${roomName}`)
    callback?.({ success: true, room: roomName })
  })

  socket.on('room:leave', (data: RoomLeaveRequest, callback?: (response: { success: boolean; room?: string }) => void) => {
    const roomName = data.room
    if (roomName) {
      socket.leave(roomName)
      console.log(`[Realtime Service] Socket ${socket.id} left room: ${roomName}`)
      callback?.({ success: true, room: roomName })
    } else {
      callback?.({ success: false })
    }
  })

  socket.on('room:list', (_data: unknown, callback?: (response: { rooms: string[] }) => void) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id)
    callback?.({ rooms })
  })

  // ─── Event: notification:new ────────────────────────────────────────────
  socket.on('notification:new', (data: NotificationPayload) => {
    totalMessagesReceived++
    const enriched = {
      ...data,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      fromUserId: socket.data.userId,
    }

    // Emit to target
    if (data.userId) {
      io.to(`user:${data.userId}`).emit('notification:new', enriched)
    } else if (data.companyId) {
      io.to(`company:${data.companyId}`).emit('notification:new', enriched)
    } else {
      socket.broadcast.emit('notification:new', enriched)
    }

    // Also publish to Redis for multi-instance
    publishEvent('notification:new', enriched)
    totalMessagesSent++
  })

  // ─── Event: dashboard:update ───────────────────────────────────────────
  socket.on('dashboard:update', (data: DashboardUpdatePayload) => {
    totalMessagesReceived++
    const enriched = { ...data, timestamp: new Date().toISOString() }

    if (data.companyId) {
      io.to(`company:${data.companyId}`).emit('dashboard:update', enriched)
      if (data.widget) {
        io.to(`company:${data.companyId}:dashboard:${data.widget}`).emit('dashboard:update', enriched)
      }
    }

    publishEvent('dashboard:update', enriched)
    totalMessagesSent++
  })

  // ─── Event: ai:response ────────────────────────────────────────────────
  socket.on('ai:response', (data: AIResponsePayload) => {
    totalMessagesReceived++
    const enriched = { ...data, timestamp: new Date().toISOString() }

    // Target specific user or company room
    const targetRoom = data.taskId ? `ai:task:${data.taskId}` : `company:${data.companyId}`
    io.to(targetRoom).emit('ai:response', enriched)

    publishEvent('ai:response', enriched)
    totalMessagesSent++
  })

  // ─── Event: queue:update ───────────────────────────────────────────────
  socket.on('queue:update', (data: QueueUpdatePayload) => {
    totalMessagesReceived++
    const enriched = { ...data, timestamp: new Date().toISOString() }

    io.emit('queue:update', enriched)

    publishEvent('queue:update', enriched)
    totalMessagesSent++
  })

  // ─── Event: social:event ───────────────────────────────────────────────
  socket.on('social:event', (data: SocialEventPayload) => {
    totalMessagesReceived++
    const enriched = { ...data, timestamp: new Date().toISOString() }

    if (data.companyId) {
      io.to(`company:${data.companyId}`).emit('social:event', enriched)
      io.to(`company:${data.companyId}:social:${data.platform}`).emit('social:event', enriched)
    }

    publishEvent('social:event', enriched)
    totalMessagesSent++
  })

  // ─── Event: whatsapp:message ───────────────────────────────────────────
  socket.on('whatsapp:message', (data: WhatsAppMessagePayload) => {
    totalMessagesReceived++
    const enriched = { ...data, timestamp: new Date().toISOString() }

    if (data.companyId) {
      io.to(`company:${data.companyId}`).emit('whatsapp:message', enriched)
      io.to(`company:${data.companyId}:whatsapp`).emit('whatsapp:message', enriched)
      if (data.conversationId) {
        io.to(`conversation:${data.conversationId}`).emit('whatsapp:message', enriched)
      }
    }

    publishEvent('whatsapp:message', enriched)
    totalMessagesSent++
  })

  // ─── Event: email:new ──────────────────────────────────────────────────
  socket.on('email:new', (data: EmailNewPayload) => {
    totalMessagesReceived++
    const enriched = { ...data, timestamp: new Date().toISOString() }

    if (data.companyId) {
      io.to(`company:${data.companyId}`).emit('email:new', enriched)
      io.to(`company:${data.companyId}:email`).emit('email:new', enriched)
    }

    publishEvent('email:new', enriched)
    totalMessagesSent++
  })

  // ─── Metrics ───────────────────────────────────────────────────────────
  socket.on('metrics', (_data: unknown, callback?: (response: ReturnType<typeof getConnectionMetrics>) => void) => {
    callback?.(getConnectionMetrics())
  })

  // ─── Heartbeat / Ping-Pong ─────────────────────────────────────────────
  socket.on('ping', (_data: unknown, callback?: (response: { pong: boolean; latency?: number; ts: number }) => void) => {
    callback?.({ pong: true, ts: Date.now() })
  })

  // ─── Disconnect ────────────────────────────────────────────────────────
  socket.on('disconnect', (reason: string) => {
    activeConnections--
    console.log(`[Realtime Service] Client disconnected: ${socket.id} (${reason}, active: ${activeConnections})`)
  })

  socket.on('error', (error: Error) => {
    console.error(`[Realtime Service] Socket error (${socket.id}):`, error.message)
  })
})

// ─── Start Server ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, async () => {
  console.log(`[Realtime Service] Socket.IO server running on port ${PORT}`)
  console.log(`[Realtime Service] CORS origin: ${CORS_ORIGIN}`)
  await initRedis()
  console.log(`[Realtime Service] Ready — event types: notification:new, dashboard:update, ai:response, queue:update, social:event, whatsapp:message, email:new`)
})

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`[Realtime Service] Received ${signal}, shutting down...`)

  try {
    if (redisSubscriber) {
      await redisSubscriber.unsubscribe()
      redisSubscriber.disconnect()
    }
    if (redisPublisher) {
      redisPublisher.disconnect()
    }
  } catch {
    // Ignore Redis disconnect errors during shutdown
  }

  io.close()
  httpServer.close(() => {
    console.log(`[Realtime Service] Server closed`)
    process.exit(0)
  })

  // Force exit after 5s
  setTimeout(() => process.exit(0), 5000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// ─── Unhandled Rejection Guard ────────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
  console.error('[Realtime Service] Unhandled rejection:', reason)
})