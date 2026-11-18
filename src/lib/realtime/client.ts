'use client';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAppStore } from '@/store/app';
import type { PresenceInfo, RealTimeEvent, RealTimeEventType } from './types';

type Options = { url?: string; token?: string; path?: string };
type Connection = { url: string; token: string; socket: Socket; users: number };
const connections = new Map<string, Connection>();

/** One connecting OR connected socket per endpoint/session. Release on last unmount. */
function acquire(url: string, path: string, token: string) {
  const key = JSON.stringify([url, path]);
  let entry = connections.get(key);
  if (entry && entry.token !== token) { entry.socket.disconnect(); entry = undefined; }
  if (!entry) {
    entry = { url, token, users: 0, socket: io(url, { path, forceNew: true, auth: { token }, reconnectionAttempts: 5 }) };
    connections.set(key, entry);
  }
  entry.users++;
  const current = entry;
  return { socket: current.socket, release() {
    if (--current.users === 0 && connections.get(key) === current) { connections.delete(key); current.socket.disconnect(); }
  } };
}
export function disconnectRealtime(url: string) {
  for (const [key, entry] of connections) if (entry.url === url) { connections.delete(key); entry.socket.disconnect(); }
}
function useSession(options?: Options) {
  const token = useAppStore(s => s.token);
  return { token: options?.token ?? token, url: options?.url ?? (typeof window !== 'undefined' ? window.location.origin : ''), path: options?.path ?? '/socket.io' };
}
export function useRealtimeEvent<T = unknown>(type: RealTimeEventType, handler: (payload: T) => void, options?: Options) {
  const { url, token, path } = useSession(options);
  const fn = useRef(handler);
  useEffect(() => { fn.current = handler; }, [handler]);
  useEffect(() => {
    if (!token || !url) return;
    const { socket, release } = acquire(url, path, token);
    const onEvent = (event: RealTimeEvent) => { if (event.type === type) fn.current(event.payload as T); };
    socket.on('event', onEvent);
    return () => { socket.off('event', onEvent); release(); };
  }, [url, path, token, type]);
}
export function usePresence(roomId: string, options?: Options): PresenceInfo[] {
  const { url, token, path } = useSession(options);
  const [view, setView] = useState<{url: string; path: string; room: string; token: string; members: PresenceInfo[]} | null>(null);
  useEffect(() => {
    if (!token || !url) return;
    const { socket, release } = acquire(url, path, token);
    let active = true;
    const refresh = () => socket.emit('presence:get', roomId, (members: PresenceInfo[]) => { if (active) setView({url, path, room: roomId, token, members}); });
    const changed = (data: {roomId: string}) => { if (roomId === data.roomId) refresh(); };
    const clear = () => setView(null);
    socket.on('connect', refresh).on('disconnect', clear);
    const events = ['presence:changed', 'room:member:joined', 'room:member:left'];
    for (const e of events) socket.on(e, changed);
    if (socket.connected) refresh();
    return () => { active = false; socket.off('connect', refresh).off('disconnect', clear); for (const e of events) socket.off(e, changed); release(); };
  }, [url, path, token, roomId]);
  return view && view.url === url && view.path === path && view.room === roomId && view.token === token ? view.members : [];
}
export function useRoomMembers(roomId: string, options?: Options) { return usePresence(roomId, options).map(p => p.userId); }
