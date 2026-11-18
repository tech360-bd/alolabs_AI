import type { Socket } from 'socket.io';

/** Fail closed before each action, and evict idle listeners after revocation. */
export function guardLiveSession(socket: Socket, verify: () => Promise<boolean>) {
  let inFlight: Promise<boolean> | undefined;
  const check = () => inFlight ??= verify().catch(() => false).finally(() => { inFlight = undefined; });
  const timer = setInterval(async () => { if (!(await check())) socket.disconnect(true); }, 30_000);
  timer.unref();
  socket.once('disconnect', () => clearInterval(timer));
  socket.use(async (_packet, next) => {
    if (await check()) return next();
    next(new Error('Session expired'));
    socket.disconnect(true);
  });
}
