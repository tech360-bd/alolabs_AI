// @vitest-environment node
/**
 * A deployment that has failed before must not disappear for good.
 *
 * `recordOutcome` marks a deployment `unreachable` after three consecutive
 * failures. That health record has no decay timer and no recovery probe. The
 * availability builder used to turn it into `selectable: false`, and because
 * `selectCandidates` drops non-selectable deployments entirely, one transient
 * outage removed a deployment from every later request — permanently, even
 * after the provider came back.
 *
 * In production that silently shrinks the fallback chain: a failover that got a
 * backend through one bad hour would never route to it again. This was also the
 * cause of an intermittent CI failure — a suite that left `unreachable` behind in
 * shared routing state made a later chain test find only one candidate, so the
 * request failed with no fallback to observe.
 *
 * The invariant: health may order and describe deployments, but liveness is
 * decided by the live probe. A reachable endpoint is always selectable.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:net';
import { createRealDb, type RealDb } from '../helpers/real-db';
import { useRealFetch } from '../helpers/real-fetch';

let real: RealDb;

/** Allocate a port that nothing is listening on: the "provider is down" case. */
async function deadPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('could not allocate a port')));
      }
    });
  });
}

beforeAll(async () => {
  real = await createRealDb('stale-health');
}, 120_000);

afterAll(async () => {
  await real?.cleanup();
});

describe('a deployment marked unreachable is not excluded forever', () => {
  it('stays selectable once the endpoint answers again', async () => {
    // The shared setup stubs global fetch to return `{}` for every URL, which
    // would make every probe look healthy. This test is about reachability, so
    // it needs real sockets.
    const restoreFetch = useRealFetch();
    const port = await deadPort();
    process.env.ALO_PLATFORM_LOCAL_URL = `http://127.0.0.1:${port}`;
    process.env.ALO_PLATFORM_LOCAL_PRIORITY = '5';

    vi.resetModules();
    const { recordOutcome, getHealth } = await import('@/lib/platform/routing-state');
    const { describeAvailability, invalidateReachability } = await import('@/lib/platform/model-registry');

    // Three real failures — this is what an outage does, not a fabricated state.
    for (let i = 0; i < 3; i++) {
      await recordOutcome('platform-local', 'alo-local-tiny', {
        ok: false,
        errorClass: 'server_error',
        error: 'inference crashed',
      });
    }
    const health = await getHealth('platform-local', 'alo-local-tiny');
    expect(health.status).toBe('unreachable');
    expect(health.consecutiveFailures).toBeGreaterThanOrEqual(3);

    // With the endpoint genuinely down, the deployment must not be selectable.
    invalidateReachability();
    const down = await describeAvailability();
    const downEntry = down.find((d) => d.model === 'alo-local-tiny');
    expect(downEntry, 'the local deployment should be in the catalogue').toBeDefined();
    expect(downEntry!.selectable).toBe(false);
    expect(downEntry!.blockedReason).toMatch(/not answering|unreachable/i);

    // Now the endpoint answers. This is the regression: the stale health record
    // used to keep it unselectable with no way back short of editing the store.
    process.env.ALO_PLATFORM_LOCAL_URL = `http://127.0.0.1:${await livePortWithTags()}`;
    invalidateReachability();
    const up = await describeAvailability();
    const upEntry = up.find((d) => d.model === 'alo-local-tiny');
    expect(upEntry!.reachable).toBe(true);
    expect(upEntry!.selectable, 'a reachable endpoint must not be excluded by stale health').toBe(true);
    expect(upEntry!.blockedReason).toBeUndefined();

    // ...while the history is still visible, so the admin page can explain it.
    expect(upEntry!.health.status).toBe('unreachable');

    restoreFetch();
  }, 60_000);
});

/** Start a throw-away server whose /api/tags answers 200. */
async function livePortWithTags(): Promise<number> {
  const { createServer: createHttpServer } = await import('node:http');
  const server = createHttpServer((request, response) => {
    if (request.url === '/api/tags') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ models: [] }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('no port');
  liveServers.push(server);
  return address.port;
}

const liveServers: import('node:http').Server[] = [];

afterAll(async () => {
  for (const server of liveServers) await new Promise<void>((resolve) => server.close(() => resolve()));
});
