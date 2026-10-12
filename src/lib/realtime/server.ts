/**
 * Real-Time WebSocket Server
 * ALO Labs AIOS — Socket.IO-based real-time server for mini-services.
 *
 * Uses dynamic import('socket.io') so the module resolves at runtime
 * (in mini-service contexts) without causing a compile-time error in the
 * main Next.js project where socket.io (server) is not a dependency.
 *
 * Features:
 * - JWT authentication middleware
 * - Room management (join, leave, list)
 * - Presence tracking (online / away / busy / offline)
 * - Event broadcasting (all, per-user, per-room)
 * - Heartbeat / ping-pong (handled by Socket.IO natively)
 * - Reconnection support (client-driven; server persists presence)
 * - Events-per-second tracking
 */

import { createServer } from 'http';
import type { Server as HttpServer } from 'http';
import type {
  RealTimeServerOptions,
  RealTimeEventType,
  RealTimeServerStats,
  RealTimeEvent,
  PresenceInfo,
  PresenceStatus,
  AuthenticatedSocket,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal Socket.IO interface mirrors
// (avoids a static import of the socket.io package at compile time)
// ──────────────────────────────────────────────────────────────────────────────

interface SocketLike {
  id: string;
  data: Record<string, unknown>;
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
  };
  emit(event: string, ...args: unknown[]): void;
  on(event: string, fn: (...args: unknown[]) => void): SocketLike;
  off(event: string, fn?: (...args: unknown[]) => void): SocketLike;
  join(room: string): void;
  leave(room: string): void;
  disconnect(close?: boolean): void;
}

interface IoServerLike {
  use(fn: (socket: SocketLike, next: (err?: Error) => void) => void): void;
  on(event: string, fn: (socket: SocketLike) => void): void;
  emit(event: string, ...args: unknown[]): void;
  to(roomOrId: string): { emit(event: string, ...args: unknown[]): void };
  sockets: { sockets: Map<string, SocketLike> };
  disconnectSockets(close?: boolean): void;
  close(): void;
}

// ──────────────────────────────────────────────────────────────────────────────
// RealTimeServer
// ──────────────────────────────────────────────────────────────────────────────

export class RealTimeServer {
  private httpServer: HttpServer | null = null;
  private io: IoServerLike | null = null;
  private options: RealTimeServerOptions;

  /** socketId → authenticated user info */
  private sockets = new Map<string, AuthenticatedSocket>();

  /** userId → socketId (most recent connection wins) */
  private userSockets = new Map<string, string>();

  /** roomId → Set<socketId> */
  private rooms = new Map<string, Set<string>>();

  /** userId → PresenceInfo */
  private presence = new Map<string, PresenceInfo>();

  /** userId → Set<roomId> (for fast room lookup) */
  private userRooms = new Map<string, Set<string>>();

  /** Events-per-second tracking */
  private eventTimestamps: number[] = [];
  private readonly epsWindowMs = 10_000;

  /** Auto-away threshold: ms of inactivity before marking "away" */
  private readonly AWAY_THRESHOLD_MS = 5 * 60_000;
  private awayTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RealTimeServerOptions) {
    this.options = {
      pingInterval: 25_000,
      pingTimeout: 60_000,
      path: '/realtime',
      ...options,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Start the HTTP + Socket.IO server.
   * Dynamically imports socket.io so this file compiles even when the
   * server-side socket.io package is not installed (e.g. the main Next.js app).
   */
  async start(): Promise<void> {
    this.httpServer = createServer();

    const corsOrigin = this.options.cors?.origin ?? '*';
    const corsMethods = this.options.cors?.methods ?? ['GET', 'POST'];
    const corsCredentials = this.options.cors?.credentials ?? false;

    // Dynamic import — socket.io is expected at runtime in mini-service contexts.
    // @ts-expect-error -- socket.io (server) is a mini-service dependency, not a main-app dependency.
    const { Server: IoServer } = await import('socket.io');

    this.io = new IoServer(this.httpServer, {
      cors: {
        origin: corsOrigin,
        methods: corsMethods,
        credentials: corsCredentials,
      },
      pingInterval: this.options.pingInterval,
      pingTimeout: this.options.pingTimeout,
      path: this.options.path,
    }) as unknown as IoServerLike;

    this.setupMiddleware();
    this.setupConnectionHandler();

    // Start auto-away checker
    this.awayTimer = setInterval(() => this.checkAutoAway(), 60_000);

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.options.port, () => resolve());
      this.httpServer!.on('error', reject);
    });
  }

  /**
   * Stop the server and clean up all state.
   */
  async stop(): Promise<void> {
    if (this.awayTimer) {
      clearInterval(this.awayTimer);
      this.awayTimer = null;
    }

    if (this.io) {
      this.io.disconnectSockets(true);
      this.io.close();
      this.io = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    this.sockets.clear();
    this.userSockets.clear();
    this.rooms.clear();
    this.presence.clear();
    this.userRooms.clear();
    this.eventTimestamps = [];
  }

  // ── Middleware ─────────────────────────────────────────────────────────────

  private setupMiddleware(): void {
    if (!this.io || !this.options.auth) return;

    const { verifyToken } = this.options.auth;

    this.io.use(async (socket, next) => {
      const authHeaders = socket.handshake.headers;
      const authObj = socket.handshake.auth;
      const token =
        (authObj.token as string | undefined) ??
        (typeof authHeaders.authorization === 'string'
          ? authHeaders.authorization.replace('Bearer ', '')
          : undefined);

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      try {
        const userId = await verifyToken(token);
        if (!userId) {
          return next(new Error('Invalid or expired token'));
        }

        // Attach userId to the socket for downstream handlers
        socket.data.userId = userId;
        next();
      } catch {
        next(new Error('Token verification failed'));
      }
    });
  }

  // ── Connection Handler ─────────────────────────────────────────────────────

  private setupConnectionHandler(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: SocketLike) => {
      const userId = socket.data.userId as string | undefined;

      // If auth is configured but user is not authenticated, disconnect
      if (this.options.auth && !userId) {
        socket.disconnect(true);
        return;
      }

      // Track connection
      const effectiveUserId = userId ?? socket.id;
      this.registerSocket(socket, effectiveUserId);

      // ── Client → Server Messages ─────────────────────────────────────────

      socket.on('room:join', (roomId: unknown) => {
        this.joinRoom(effectiveUserId, String(roomId));
      });

      socket.on('room:leave', (roomId: unknown) => {
        this.leaveRoom(effectiveUserId, String(roomId));
      });

      socket.on('presence:update', (status: unknown) => {
        this.updatePresence(effectiveUserId, status as PresenceStatus);
      });

      socket.on('presence:get', (roomId: unknown, ...rest: unknown[]) => {
        const callback = rest[0] as ((p: PresenceInfo[]) => void) | undefined;
        const result = this.getPresence(String(roomId));
        callback?.(result);
      });

      socket.on('disconnect', (_reason: unknown) => {
        this.handleDisconnect(socket, effectiveUserId);
      });

      // Send initial presence state
      this.updatePresence(effectiveUserId, 'online');

      // Acknowledge connection
      socket.emit('connected', {
        userId: effectiveUserId,
        socketId: socket.id,
        timestamp: Date.now(),
      });
    });
  }

  // ── Socket Registration ───────────────────────────────────────────────────

  private registerSocket(socket: SocketLike, userId: string): void {
    const info: AuthenticatedSocket = {
      userId,
      socketId: socket.id,
      joinedRooms: new Set(),
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };

    // If user had a previous socket, clean it up
    const prevSocketId = this.userSockets.get(userId);
    if (prevSocketId && prevSocketId !== socket.id) {
      this.cleanupSocket(prevSocketId);
    }

    this.sockets.set(socket.id, info);
    this.userSockets.set(userId, socket.id);
  }

  private cleanupSocket(socketId: string): void {
    const info = this.sockets.get(socketId);
    if (!info) return;

    // Leave all rooms
    for (const roomId of info.joinedRooms) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.delete(socketId);
        if (room.size === 0) this.rooms.delete(roomId);
      }
    }

    // Clean user-room mapping
    const userRoomSet = this.userRooms.get(info.userId);
    if (userRoomSet) {
      userRoomSet.clear();
      this.userRooms.delete(info.userId);
    }

    this.sockets.delete(socketId);
  }

  private handleDisconnect(socket: SocketLike, userId: string): void {
    this.cleanupSocket(socket.id);

    // If this was the user's active socket, mark them offline
    const activeSocketId = this.userSockets.get(userId);
    if (activeSocketId === socket.id) {
      this.userSockets.delete(userId);
      this.updatePresence(userId, 'offline');
    }
  }

  // ── Emit / Broadcast ──────────────────────────────────────────────────────

  /**
   * Emit an event. If targetUserId is provided, send only to that user.
   * Otherwise broadcast to all connected sockets.
   */
  emit(event: RealTimeEventType, payload: unknown, targetUserId?: string): void {
    if (!this.io) return;

    const rtEvent: RealTimeEvent = {
      type: event,
      payload,
      timestamp: Date.now(),
      source: 'server',
      targetUserId,
    };

    this.recordEvent();

    if (targetUserId) {
      const socketId = this.userSockets.get(targetUserId);
      if (socketId) {
        this.io.to(socketId).emit('event', rtEvent);
      }
    } else {
      this.io.emit('event', rtEvent);
    }
  }

  /**
   * Emit an event to all members of a specific room.
   */
  emitToRoom(roomId: string, event: string, data: unknown): void {
    if (!this.io) return;

    this.recordEvent();
    this.io.to(roomId).emit(event, data);
  }

  private recordEvent(): void {
    const now = Date.now();
    this.eventTimestamps.push(now);
    // Prune timestamps outside the EPS window
    const cutoff = now - this.epsWindowMs;
    while (this.eventTimestamps.length > 0 && this.eventTimestamps[0] < cutoff) {
      this.eventTimestamps.shift();
    }
  }

  // ── Room Management ────────────────────────────────────────────────────────

  /**
   * Add a user to a room. If the room doesn't exist, it is created.
   */
  joinRoom(userId: string, roomId: string): void {
    const socketId = this.userSockets.get(userId);
    if (!socketId || !this.io) return;

    const info = this.sockets.get(socketId);
    if (!info) return;

    // Socket.IO room
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(roomId);
    }

    info.joinedRooms.add(roomId);
    info.lastActivity = Date.now();

    // Internal room tracking
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(socketId);

    // User-room mapping
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId)!.add(roomId);

    // Notify room members
    this.emitToRoom(roomId, 'room:member:joined', { userId, roomId });
  }

  /**
   * Remove a user from a room.
   */
  leaveRoom(userId: string, roomId: string): void {
    const socketId = this.userSockets.get(userId);
    if (!socketId || !this.io) return;

    const info = this.sockets.get(socketId);
    if (!info) return;

    // Socket.IO room
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(roomId);
    }

    info.joinedRooms.delete(roomId);
    info.lastActivity = Date.now();

    // Internal room tracking
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(socketId);
      if (room.size === 0) this.rooms.delete(roomId);
    }

    // User-room mapping
    const userRoomSet = this.userRooms.get(userId);
    if (userRoomSet) {
      userRoomSet.delete(roomId);
      if (userRoomSet.size === 0) this.userRooms.delete(userId);
    }

    // Notify room members
    this.emitToRoom(roomId, 'room:member:left', { userId, roomId });
  }

  // ── Presence ───────────────────────────────────────────────────────────────

  /**
   * Update a user's presence status and broadcast to their rooms.
   */
  updatePresence(userId: string, status: PresenceStatus): void {
    this.presence.set(userId, {
      userId,
      status,
      lastSeen: Date.now(),
    });

    // Broadcast presence change to all rooms the user is in
    const userRoomSet = this.userRooms.get(userId);
    if (userRoomSet && this.io) {
      const presenceInfo = this.presence.get(userId)!;
      for (const roomId of userRoomSet) {
        this.emitToRoom(roomId, 'presence:changed', presenceInfo);
      }
    }
  }

  /**
   * Get presence information for all members of a room.
   */
  getPresence(roomId: string): PresenceInfo[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const result: PresenceInfo[] = [];
    for (const socketId of room) {
      const info = this.sockets.get(socketId);
      if (!info) continue;

      const p = this.presence.get(info.userId);
      if (p) {
        result.push(p);
      } else {
        result.push({
          userId: info.userId,
          status: 'offline',
          lastSeen: 0,
        });
      }
    }

    return result;
  }

  /**
   * Get all currently online user IDs.
   */
  getOnlineUsers(): string[] {
    const result: string[] = [];
    for (const [userId, p] of this.presence.entries()) {
      if (p.status === 'online' || p.status === 'busy') {
        result.push(userId);
      }
    }
    return result;
  }

  // ── Auto-Away ─────────────────────────────────────────────────────────────

  private checkAutoAway(): void {
    const now = Date.now();
    for (const [, info] of this.sockets.entries()) {
      if (now - info.lastActivity > this.AWAY_THRESHOLD_MS) {
        const current = this.presence.get(info.userId);
        if (current && current.status === 'online') {
          this.updatePresence(info.userId, 'away');
        }
      }
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  /**
   * Return current server statistics.
   */
  getStats(): RealTimeServerStats {
    const now = Date.now();
    const cutoff = now - this.epsWindowMs;
    // Count events within window
    let epsCount = 0;
    for (let i = this.eventTimestamps.length - 1; i >= 0; i--) {
      if (this.eventTimestamps[i] >= cutoff) {
        epsCount++;
      } else {
        break;
      }
    }
    const eventsPerSecond = epsCount / (this.epsWindowMs / 1000);

    return {
      connections: this.sockets.size,
      rooms: this.rooms.size,
      eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
    };
  }
}