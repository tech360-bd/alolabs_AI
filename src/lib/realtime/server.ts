/** Authenticated workspace transport. Only trusted server-side code publishes business events. */
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { PresenceInfo, PresenceStatus, RealTimeEventType, RealTimeServerOptions, RealTimeServerStats } from './types';
import { guardLiveSession } from './session-guard';
import { handshakeToken } from './handshake';
import { mayReadOperationalMetrics } from '../access/metrics-scrape';

export const channels = {
  'notification:new': 'notification', 'dashboard:update': 'dashboard.update',
  'ai:response': 'agent.event', 'queue:update': 'queue.update',
  'social:event': 'message', 'whatsapp:message': 'message', 'email:new': 'message',
} as const satisfies Record<string, RealTimeEventType>;

const workspaceRoom = (room: string) => /^(?:company|user):.+$/.test(room);
const idleAfterMs = 5 * 60_000;

function allowedRooms(socket: Socket): string[] {
  const { userId, companyId } = socket.data.identity;
  return [`user:${userId}`, ...(companyId ? [`company:${companyId}`] : [])];
}

export class RealTimeServer {
  private http = createServer();
  private io: Server;
  private awayTimer?: ReturnType<typeof setInterval>;
  private totalConnections = 0;
  private totalMessagesReceived = 0;
  private totalMessagesSent = 0;
  private eventsBySecond = new Map<number, number>();

  constructor(private options: RealTimeServerOptions) {
    this.io = new Server(this.http, { path: options.path ?? '/socket.io', serveClient: false, maxHttpBufferSize: 64 * 1024,
      cors: { ...options.cors, origin: options.cors?.origin ?? false }, pingTimeout: options.pingTimeout ?? 60000, pingInterval: options.pingInterval ?? 25000 });
    this.io.use(async (socket, next) => {
      try {
        const token = handshakeToken(socket.handshake);
        const resolve = async () => {
          const verified = await this.options.auth.verifyToken(token);
          return typeof verified === 'string' ? { userId: verified, role: '', companyId: undefined } : verified;
        };
        const identity = token ? await resolve() : null;
        if (!identity?.userId) return next(Error('Authentication required'));
        socket.data.identity = identity;
        socket.data.presence = { userId: identity.userId, status: 'online', lastSeen: Date.now() };
        socket.data.authorized = async () => {
          const current = await resolve();
          return !!current && current.userId === identity.userId && current.role === identity.role && current.companyId === identity.companyId;
        };
        next();
      } catch { next(Error('Authentication unavailable')); }
    });
    this.io.on('connection', socket => {
      this.totalConnections++;
      guardLiveSession(socket, socket.data.authorized);
      const { userId, companyId } = socket.data.identity;
      const rooms = allowedRooms(socket);
      for (const room of rooms) this.changeMembership(socket, room, true);
      const authenticated = { userId, companyId };
      socket.emit('auth:success', authenticated);
      socket.emit('connected', { userId, socketId: socket.id, timestamp: Date.now() });
      socket.onAny(() => { socket.data.lastActivity = Date.now(); this.totalMessagesReceived++; });
      // Legacy acknowledgement for already authenticated clients. This must
      // never admit an anonymous connection or switch a socket's identity.
      socket.on('auth:verify', (data, reply) => {
        const ok = typeof data?.token === 'string' && data.token === handshakeToken(socket.handshake);
        if (ok) socket.emit('auth:success', authenticated);
        else socket.emit('auth:error', { error: 'Session mismatch' });
        if (typeof reply === 'function') reply(ok ? { success: true, userId } : { success: false, error: 'Session mismatch' });
      });
      socket.on('metrics', (_data, reply) => {
        if (typeof reply !== 'function') return;
        if (!mayReadOperationalMetrics(socket.data.identity.role)) return reply({ error: 'Forbidden' });
        const stats = this.getStats();
        reply({ activeConnections: stats.connections, totalConnections: this.totalConnections,
          totalMessagesReceived: this.totalMessagesReceived, totalMessagesSent: this.totalMessagesSent,
          redisAvailable: this.options.streamReady?.() ?? false, uptime: process.uptime(), rooms: stats.rooms });
      });
      socket.on('room:list', (_data, reply) => {
        if (typeof reply === 'function') reply({ rooms: rooms.filter(r => socket.rooms.has(r)) });
      });
      for (const [event, join] of [['room:join', true], ['room:leave', false]] as const) {
        socket.on(event, (data, reply) => {
          const room = typeof data === 'string' ? data : data?.room;
          const ok = typeof room === 'string' && this.changeMembership(socket, room, join);
          if (typeof reply === 'function') reply(ok ? { success: true, room } : { success: false, error: 'Room unavailable' });
        });
      }
      socket.on('presence:get', (room, reply) => {
        if (typeof reply === 'function') reply(rooms.includes(room) && socket.rooms.has(room) ? this.getPresence(room) : []);
      });
      socket.on('presence:update', (status: PresenceStatus) => {
        if (['online', 'busy', 'away', 'offline'].includes(status)) this.setPresence(socket, status);
      });
      socket.on('ping', (_data, reply) => { if (typeof reply === 'function') reply({ pong: true, ts: Date.now() }); });
      socket.on('error', () => console.warn('[Realtime] socket action rejected'));
      socket.on('disconnecting', () => {
        for (const roomId of rooms) if (socket.rooms.has(roomId)) socket.to(roomId).emit('room:member:left', { userId, roomId });
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.options.port, this.options.host ?? '127.0.0.1', () => { this.http.off('error', reject); resolve(); });
    });
    this.awayTimer = setInterval(() => this.checkAutoAway(), 30_000);
    this.awayTimer.unref();
  }

  /** The bound port (also useful when port 0 was requested). */
  get port(): number | undefined {
    const address = this.http.address();
    return address && typeof address === 'object' ? address.port : undefined;
  }

  async stop(): Promise<void> {
    clearInterval(this.awayTimer);
    await this.io.close();
    this.eventsBySecond.clear();
    this.totalConnections = this.totalMessagesReceived = this.totalMessagesSent = 0;
  }

  private changeMembership(socket: Socket, roomId: string, join: boolean): boolean {
    // Membership derives from the verified identity, never from a requested room name.
    if (!allowedRooms(socket).includes(roomId)) return false;
    if (socket.rooms.has(roomId) !== join) {
      if (join) socket.join(roomId); else socket.leave(roomId);
      socket.to(roomId).emit(join ? 'room:member:joined' : 'room:member:left', { userId: socket.data.identity.userId, roomId });
    }
    return true;
  }

  joinRoom(userId: string, roomId: string): void {
    for (const s of this.io.sockets.sockets.values()) if (s.data.identity.userId === userId) this.changeMembership(s, roomId, true);
  }

  leaveRoom(userId: string, roomId: string): void {
    for (const s of this.io.sockets.sockets.values()) if (s.data.identity.userId === userId) this.changeMembership(s, roomId, false);
  }

  private setPresence(socket: Socket, status: PresenceStatus): void {
    const presence: PresenceInfo = { userId: socket.data.identity.userId, status, lastSeen: Date.now() };
    socket.data.presence = presence;
    for (const roomId of allowedRooms(socket)) if (socket.rooms.has(roomId)) this.emitToRoom(roomId, 'presence:changed', { ...presence, roomId });
  }

  updatePresence(userId: string, status: PresenceStatus): void {
    for (const s of this.io.sockets.sockets.values()) if (s.data.identity.userId === userId) this.setPresence(s, status);
  }

  private checkAutoAway(): void {
    const since = Date.now() - idleAfterMs;
    for (const s of this.io.sockets.sockets.values()) {
      const p: PresenceInfo = s.data.presence;
      if (p.status === 'online' && Math.max(p.lastSeen, s.data.lastActivity ?? 0) < since) this.setPresence(s, 'away');
    }
  }

  getPresence(roomId: string): PresenceInfo[] {
    if (!workspaceRoom(roomId)) return [];
    const members = new Map<string, PresenceInfo>();
    for (const id of this.io.sockets.adapter.rooms.get(roomId) ?? []) {
      const p: PresenceInfo | undefined = this.io.sockets.sockets.get(id)?.data.presence;
      if (p && (!members.has(p.userId) || members.get(p.userId)!.lastSeen <= p.lastSeen)) members.set(p.userId, { ...p });
    }
    return [...members.values()];
  }

  /** Server-local query; do not expose a cross-tenant roster on the socket. */
  getOnlineUsers(): string[] {
    const online = new Set<string>();
    for (const s of this.io.sockets.sockets.values()) {
      const p: PresenceInfo = s.data.presence;
      if (p.status === 'online' || p.status === 'busy') online.add(p.userId);
    }
    return [...online];
  }

  private eventWindow(): number {
    const second = Math.floor(Date.now() / 1000);
    for (const t of this.eventsBySecond.keys()) if (t <= second - 10 || t > second) this.eventsBySecond.delete(t);
    return second;
  }

  getStats(): RealTimeServerStats {
    this.eventWindow();
    return {
      connections: this.io.sockets.sockets.size,
      rooms: [...this.io.sockets.adapter.rooms.keys()].filter(workspaceRoom).length,
      eventsPerSecond: [...this.eventsBySecond.values()].reduce((sum, n) => sum + n, 0) / 10,
    };
  }

  emitToRoom(roomId: string, event: string, data: unknown): void {
    if (!workspaceRoom(roomId)) throw new Error('A scoped workspace room is required');
    const second = this.eventWindow();
    this.totalMessagesSent++;
    this.eventsBySecond.set(second, (this.eventsBySecond.get(second) ?? 0) + 1);
    this.io.to(roomId).emit(event, data);
  }

  /** Preserve the trusted producer API, not its former unaddressed broadcast. */
  emit(type: RealTimeEventType, payload: unknown, targetUserId?: string): void {
    if (!targetUserId) throw new Error('A target user is required');
    this.emitToRoom(`user:${targetUserId}`, 'event', { type, payload, timestamp: Date.now(), source: 'server', targetUserId });
  }

  deliver(channel: keyof typeof channels, data: Record<string, unknown>) {
    // A personal recipient always wins, including over a supplied room.
    const room = typeof data.userId === 'string' && data.userId ? `user:${data.userId}` : typeof data.companyId === 'string' && data.companyId ? `company:${data.companyId}` : typeof data.room === 'string' && workspaceRoom(data.room) ? data.room : null;
    if (!room) return;
    this.emitToRoom(room, channel, data);
    this.emitToRoom(room, 'event', { type: channels[channel], payload: data, timestamp: Date.now(), source: 'workspace' });
  }
}
