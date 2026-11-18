// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { channels, RealTimeServer } from '@/lib/realtime/server';

let server: RealTimeServer;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const client of sockets.splice(0)) client.disconnect();
  await server?.stop();
});

async function connect(token: string, path = '/socket.io') {
  const client = io(`http://127.0.0.1:${server.port}`, {
    path, auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false,
  });
  sockets.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connected', info => {
      expect(info).toEqual({ userId: expect.any(String), socketId: client.id, timestamp: expect.any(Number) });
      resolve();
    }).once('connect_error', reject).connect();
  });
  return client;
}

it('preserves the producer, room, presence and stats APIs without opening a global broadcast or roster', async () => {
  const identities = new Map([
    ['alice-session', { userId: 'alice', role: 'operator', companyId: 'north' }],
    ['bob-session', { userId: 'bob', role: 'operator', companyId: 'south' }],
  ]);
  server = new RealTimeServer({ port: 0, auth: { verifyToken: async token => identities.get(token) ?? null } });
  await server.start();
  const a = await connect('alice-session'), b = await connect('bob-session');
  expect(await a.timeout(2000).emitWithAck('auth:verify', { token: 'alice-session' })).toEqual({ success: true, userId: 'alice' });
  expect(await a.timeout(2000).emitWithAck('auth:verify', { token: 'bob-session' })).toMatchObject({ success: false });
  expect(await a.timeout(2000).emitWithAck('metrics', {})).toEqual({ error: 'Forbidden' });
  expect(await a.timeout(2000).emitWithAck('ping', {})).toEqual({ pong: true, ts: expect.any(Number) });
  expect(server.getStats()).toMatchObject({ connections: 2, rooms: 4 });
  expect(server.getOnlineUsers().sort()).toEqual(['alice', 'bob']);
  expect(await a.timeout(2000).emitWithAck('room:join', { room: 'company:south' })).toMatchObject({ success: false });
  expect(await a.timeout(2000).emitWithAck('presence:get', 'company:south')).toEqual([]);

  expect(await a.timeout(2000).emitWithAck('room:leave', { room: 'company:north' })).toMatchObject({ success: true });
  expect(await a.timeout(2000).emitWithAck('room:join', 'company:north')).toMatchObject({ success: true });
  server.leaveRoom('alice', 'company:north');
  expect(server.getPresence('company:north')).toEqual([]);
  expect((await a.timeout(2000).emitWithAck('room:list', {})).rooms).toEqual(['user:alice']);
  server.joinRoom('alice', 'company:south');
  expect(server.getPresence('company:south').map(p => p.userId)).toEqual(['bob']);
  server.joinRoom('alice', 'company:north');
  server.updatePresence('alice', 'busy');
  expect(await a.timeout(2000).emitWithAck('presence:get', 'company:north')).toEqual([
    { userId: 'alice', status: 'busy', lastSeen: expect.any(Number) },
  ]);

  const seenByB: string[] = [];
  b.on('event', e => seenByB.push(e.type));
  const targeted = new Promise(resolve => a.once('event', resolve));
  server.emit('notification', { message: 'personal' }, 'alice');
  expect(await targeted).toMatchObject({ type: 'notification', targetUserId: 'alice', payload: { message: 'personal' } });
  expect(() => server.emit('notification', {})).toThrow(/target user/i);
  // A subsequent frame on B is a delivery barrier (no sleep-based negative test).
  const south = new Promise(resolve => b.once('barrier', resolve));
  server.emitToRoom('company:south', 'barrier', 7);
  expect(await south).toBe(7);
  expect(seenByB).toEqual([]);
  expect(server.getStats().eventsPerSecond).toBeGreaterThan(0);
}, 15_000);

it('delivers all seven named events and hook envelopes to the intended room, never from a client publish', async () => {
  server = new RealTimeServer({ port: 0, streamReady: () => true, auth: {
    verifyToken: async token => token === 'staff' ? { userId: 'staff', role: 'infrastructure_admin', companyId: 'north' } : token === 'peer' ? { userId: 'peer', role: 'admin', companyId: 'north' } : null,
  } });
  await server.start();
  const staff = await connect('staff'), peer = await connect('peer');
  const peerEvents: unknown[] = [];
  peer.on('event', e => peerEvents.push(e));
  for (const channel of Object.keys(channels) as (keyof typeof channels)[]) {
    const named = new Promise(resolve => staff.once(channel, resolve));
    const envelope = new Promise(resolve => staff.once('event', resolve));
    const payload = { userId: 'staff', companyId: 'north', room: 'company:north', value: channel };
    server.deliver(channel, payload);
    expect(await named).toEqual(payload);
    expect(await envelope).toMatchObject({ type: channels[channel], payload });
  }
  staff.emit('notification:new', { userId: 'peer' });
  await staff.timeout(2000).emitWithAck('ping', {});
  const barrier = new Promise(resolve => peer.once('dashboard:update', resolve));
  server.deliver('dashboard:update', { room: 'company:north', value: 'barrier' });
  expect(await barrier).toMatchObject({ value: 'barrier' });
  // Wait for the final hook envelope, which follows the named event.
  await peer.timeout(2000).emitWithAck('ping', {});
  expect(peerEvents).toEqual([expect.objectContaining({ type: 'dashboard.update' })]);
  expect(await staff.timeout(2000).emitWithAck('metrics', {})).toMatchObject({ activeConnections: 2, totalConnections: 2, rooms: 3, redisAvailable: true, totalMessagesSent: expect.any(Number) });
}, 15_000);

it('supports a user-id verifier and /realtime path without granting tenant authority, and fails closed after revocation', async () => {
  let valid = true;
  server = new RealTimeServer({ port: 0, path: '/realtime', auth: { verifyToken: async token => valid && token === 'valid' ? 'alice' : null } });
  await server.start();
  await expect(connect('', '/realtime')).rejects.toThrow(/Authentication required/);
  const a = await connect('valid', '/realtime');
  expect((await a.timeout(2000).emitWithAck('room:list', {})).rooms).toEqual(['user:alice']);
  expect(await a.timeout(2000).emitWithAck('room:join', 'company:north')).toMatchObject({ success: false });
  valid = false;
  const disconnected = new Promise(resolve => a.once('disconnect', resolve));
  a.emit('presence:update', 'online');
  await disconnected;
  expect(server.getOnlineUsers()).toEqual([]);
}, 15_000);
