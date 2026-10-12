/**
 * Real-Time System — Public API
 * ALO Labs AIOS — Exports all real-time classes, types, and React hooks.
 */

// Types
export type {
  RealTimeEventType,
  RealTimeEvent,
  PresenceStatus,
  PresenceInfo,
  RoomType,
  RoomInfo,
  WSMessage,
  RealTimeServerOptions,
  RealTimeServerStats,
  AuthenticatedSocket,
} from './types';

// Server (for mini-services)
export { RealTimeServer } from './server';

// Client hooks (for React components)
export {
  useRealtimeEvent,
  usePresence,
  useRoomMembers,
  disconnectRealtime,
} from './client';