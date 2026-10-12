/**
 * Real-Time Client Hooks
 * ALO Labs AIOS — React hooks for subscribing to WebSocket events.
 *
 * Requires socket.io-client (already a project dependency).
 * Auto-reconnects and cleans up subscriptions on unmount.
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  RealTimeEventType,
  PresenceInfo,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Connection Management (singleton per URL)
// ──────────────────────────────────────────────────────────────────────────────

const connections = new Map<string, Socket>();

function getSocket(url: string, token?: string): Socket {
  // Create a cache key that includes token presence (but not the token value)
  // so that re-connecting with a new token creates a fresh socket.
  const cacheKey = url;

  let socket = connections.get(cacheKey);
  if (!socket || !socket.connected) {
    const auth = token ? { token } : undefined;

    socket = io(url, {
      path: '/realtime',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      auth,
    });

    connections.set(cacheKey, socket);
  }

  return socket;
}

/**
 * Disconnect and remove a cached socket connection.
 * Call this on logout / token change.
 */
export function disconnectRealtime(url: string): void {
  const socket = connections.get(url);
  if (socket) {
    socket.disconnect();
    connections.delete(url);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// useRealtimeEvent
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to a real-time event type.
 *
 * @param eventType  The RealTimeEventType to listen for.
 * @param handler    Callback invoked with the event payload.
 * @param options    Optional: { url, token }
 */
export function useRealtimeEvent<T = unknown>(
  eventType: RealTimeEventType,
  handler: (payload: T) => void,
  options?: { url?: string; token?: string },
): void {
  const url = options?.url ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const token = options?.token;
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const socket = getSocket(url, token);

    const onEvent = (data: { type: string; payload: unknown; targetUserId?: string }) => {
      if (data.type === eventType) {
        handlerRef.current(data.payload as T);
      }
    };

    socket.on('event', onEvent);

    return () => {
      socket.off('event', onEvent);
    };
  }, [url, eventType, token]);
}

// ──────────────────────────────────────────────────────────────────────────────
// usePresence
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Track presence for a room. Returns the current presence array.
 *
 * @param roomId  The room to monitor presence in.
 * @param options Optional: { url, token }
 */
export function usePresence(
  roomId: string,
  options?: { url?: string; token?: string },
): PresenceInfo[] {
  const url = options?.url ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const token = options?.token;
  const [members, setMembers] = useState<PresenceInfo[]>([]);

  const updatePresence = useCallback(() => {
    const socket = getSocket(url, token);
    socket.emit('presence:get', roomId, (presenceList: PresenceInfo[]) => {
      setMembers(presenceList);
    });
  }, [url, roomId, token]);

  useEffect(() => {
    const socket = getSocket(url, token);

    // Request initial presence
    updatePresence();

    // Listen for presence changes
    const onPresenceChanged = (data: PresenceInfo) => {
      setMembers((prev) => {
        const idx = prev.findIndex((p) => p.userId === data.userId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data;
          return next;
        }
        return [...prev, data];
      });
    };

    const onMemberJoined = (data: { userId: string; roomId: string }) => {
      if (data.roomId === roomId) {
        updatePresence();
      }
    };

    const onMemberLeft = (data: { userId: string; roomId: string }) => {
      if (data.roomId === roomId) {
        setMembers((prev) =>
          prev.filter((p) => p.userId !== data.userId),
        );
      }
    };

    socket.on('presence:changed', onPresenceChanged);
    socket.on('room:member:joined', onMemberJoined);
    socket.on('room:member:left', onMemberLeft);

    return () => {
      socket.off('presence:changed', onPresenceChanged);
      socket.off('room:member:joined', onMemberJoined);
      socket.off('room:member:left', onMemberLeft);
    };
  }, [url, roomId, token, updatePresence]);

  return members;
}

// ──────────────────────────────────────────────────────────────────────────────
// useRoomMembers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get the list of user IDs in a room. Auto-updates on join/leave events.
 *
 * @param roomId  The room to monitor.
 * @param options Optional: { url, token }
 */
export function useRoomMembers(
  roomId: string,
  options?: { url?: string; token?: string },
): string[] {
  const url = options?.url ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const token = options?.token;
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const refreshMembers = useCallback(() => {
    const socket = getSocket(url, token);
    // Use presence data to derive member list
    socket.emit('presence:get', roomId, (presenceList: PresenceInfo[]) => {
      setMemberIds(presenceList.map((p) => p.userId));
    });
  }, [url, roomId, token]);

  useEffect(() => {
    const socket = getSocket(url, token);

    refreshMembers();

    const onJoined = (data: { userId: string; roomId: string }) => {
      if (data.roomId === roomId) {
        setMemberIds((prev) =>
          prev.includes(data.userId) ? prev : [...prev, data.userId],
        );
      }
    };

    const onLeft = (data: { userId: string; roomId: string }) => {
      if (data.roomId === roomId) {
        setMemberIds((prev) => prev.filter((id) => id !== data.userId));
      }
    };

    socket.on('room:member:joined', onJoined);
    socket.on('room:member:left', onLeft);

    return () => {
      socket.off('room:member:joined', onJoined);
      socket.off('room:member:left', onLeft);
    };
  }, [url, roomId, token, refreshMembers]);

  return memberIds;
}