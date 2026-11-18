/**
 * Real-Time System Types
 * ALO Labs AIOS — WebSocket event and state type definitions.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Event Types
// ──────────────────────────────────────────────────────────────────────────────

export type RealTimeEventType =
  | 'notification'
  | 'dashboard.update'
  | 'agent.event'
  | 'queue.update'
  | 'message'
  | 'presence'
  | 'system.alert';

export interface RealTimeEvent {
  type: RealTimeEventType;
  payload: unknown;
  timestamp: number;  // Unix ms
  source: string;     // identifier of the emitter
  targetUserId?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Presence
// ──────────────────────────────────────────────────────────────────────────────

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

export interface PresenceInfo {
  userId: string;
  status: PresenceStatus;
  lastSeen: number;  // Unix ms
}

// ──────────────────────────────────────────────────────────────────────────────
// Rooms
// ──────────────────────────────────────────────────────────────────────────────

export type RoomType = 'channel' | 'dm' | 'presence';

export interface RoomInfo {
  id: string;
  name: string;
  members: string[];
  type: RoomType;
}

// ──────────────────────────────────────────────────────────────────────────────
// WebSocket Messages
// ──────────────────────────────────────────────────────────────────────────────

export interface WSMessage {
  event: string;
  data: unknown;
  roomId?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Server Options
// ──────────────────────────────────────────────────────────────────────────────

export interface RealTimeServerOptions {
  port: number;
  host?: string;
  cors?: {
    origin: string | string[];
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
  };
  auth: {
    /** A legacy verifier returning only a user ID grants a personal room, never a company room or operational privileges. */
    verifyToken: (token: string) => Promise<{ userId: string; role: string; companyId?: string } | string | null>;
  };
  /** Optional readiness signal for the trusted Redis subscriber (operator metrics only). */
  streamReady?: () => boolean;
  /** Ping interval in ms (default 25 000). */
  pingInterval?: number;
  /** Ping timeout in ms (default 60 000). */
  pingTimeout?: number;
  /** Socket.IO path (default '/socket.io'). */
  path?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Server Stats
// ──────────────────────────────────────────────────────────────────────────────

export interface RealTimeServerStats {
  connections: number;
  rooms: number;
  eventsPerSecond: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Authenticated Socket
// ──────────────────────────────────────────────────────────────────────────────

export interface AuthenticatedSocket {
  userId: string;
  socketId: string;
  joinedRooms: Set<string>;
  connectedAt: number;
  lastActivity: number;
}