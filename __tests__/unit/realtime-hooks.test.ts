import { EventEmitter } from 'node:events';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';
import { disconnectRealtime, usePresence, useRealtimeEvent, useRoomMembers } from '@/lib/realtime/client';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));
class Connection extends EventEmitter {
  connected = true;
  disconnect = vi.fn(() => { this.connected = false; this.emit('disconnect'); });
}
const opened: Connection[] = [];
beforeEach(() => {
  opened.length = 0;
  vi.mocked(io).mockReset().mockImplementation(() => {
    const socket = new Connection();
    opened.push(socket);
    socket.on('presence:get', (room, reply) => reply([{ userId: room, status: 'online', lastSeen: 1 }]));
    return socket as unknown as ReturnType<typeof io>;
  });
});

it('shares a connection during connect, refreshes the right room and releases only on last unmount', () => {
  const options = { url: 'https://workspace.invalid', token: 'alpha' };
  const presence = renderHook(() => usePresence('company:one', options));
  opened[0].connected = false;
  const members = renderHook(() => useRoomMembers('company:one', options));
  expect(opened).toHaveLength(1);
  expect(members.result.current).toEqual([]);
  act(() => { opened[0].connected = true; opened[0].emit('connect'); });
  expect(members.result.current).toEqual(['company:one']);
  expect(presence.result.current[0].status).toBe('online');
  const refresh = vi.fn(); opened[0].on('presence:get', refresh);
  act(() => { opened[0].emit('room:member:joined', { roomId: 'company:other' }); });
  expect(refresh).not.toHaveBeenCalled();
  act(() => { opened[0].emit('room:member:left', { roomId: 'company:one' }); });
  expect(refresh).toHaveBeenCalledTimes(2);
  presence.unmount(); expect(opened[0].disconnect).not.toHaveBeenCalled();
  members.unmount(); expect(opened[0].disconnect).toHaveBeenCalledOnce();
});

it('uses the chosen socket path, filters payloads, and does not reuse an old session on rotation', () => {
  const url = 'https://workspace.invalid', handle = vi.fn();
  const hook = renderHook(({ token }) => useRealtimeEvent('notification', handle, { url, token, path: '/realtime' }), { initialProps: { token: 'alpha' } });
  expect(io).toHaveBeenCalledWith(url, expect.objectContaining({ path: '/realtime', auth: { token: 'alpha' } }));
  act(() => { opened[0].emit('event', { type: 'message', payload: 0 }); opened[0].emit('event', { type: 'notification', payload: 1 }); });
  hook.rerender({ token: 'beta' });
  expect(opened[0].disconnect).toHaveBeenCalledOnce();
  act(() => { opened[0].emit('event', { type: 'notification', payload: 2 }); opened[1].emit('event', { type: 'notification', payload: 3 }); });
  expect(handle.mock.calls).toEqual([[1], [3]]);
  act(() => disconnectRealtime(url));
  hook.unmount(); expect(opened[1].disconnect).toHaveBeenCalledOnce();
});
