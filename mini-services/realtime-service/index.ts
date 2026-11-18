import Redis from 'ioredis';
import { db } from '../../src/lib/db';
import { channels, RealTimeServer } from '../../src/lib/realtime/server';
import { verifyInternalSessionToken, type SessionDb } from '../shared/internal-auth';

const port = Number(process.env.REALTIME_PORT || 3005);
if ((process.env.JWT_SECRET?.length ?? 0) < 32) throw Error('Configure the same JWT_SECRET as the app (32+ characters)');
const origins = (process.env.CORS_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || '').split(',').map(o => o.trim()).filter(o => o && o !== '*');
let subscriber: Redis | undefined;
const server = new RealTimeServer({ port, host: process.env.SOCKET_BIND_HOST,
  streamReady: () => subscriber?.status === 'ready',
  auth: { verifyToken: token => verifyInternalSessionToken(db as unknown as SessionDb, token, false) }, cors: { origin: origins } });
async function start() {
  await db.$connect();
  await server.start();
  console.log(`[Realtime] authenticated socket listening on ${port}`);
  if (!process.env.REDIS_URL) return;
  subscriber = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  subscriber.on('error', () => console.warn('[Realtime] Redis stream unavailable'));
  subscriber.on('message', (channel, message) => {
    const key = channel.slice('realtime:'.length);
    if (!Object.hasOwn(channels, key)) return;
    try { const data = JSON.parse(message); if (data && typeof data === 'object') server.deliver(key as keyof typeof channels, data); }
    catch { console.warn('[Realtime] invalid event ignored'); }
  });
  await subscriber.subscribe(...Object.keys(channels).map(k => `realtime:${k}`));
  console.log('[Realtime] subscribed to workspace events');
}
async function stop() { subscriber?.disconnect(); await server.stop(); await db.$disconnect(); }
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
start().catch(() => { console.error('[Realtime] startup failed'); process.exit(1); });
