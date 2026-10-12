import { jsonResponse, secureRoute } from '@/lib/api/secure-route'
import { pingPostgres } from '@/lib/postgres'
import { pingRedis } from '@/lib/redis'
import { pingQdrant } from '@/lib/qdrant'
import { pingMinio } from '@/lib/minio'

/**
 * Infrastructure reachability probe.
 *
 * This endpoint opens connections to internal datastores and reports their
 * latency and error text, so it is an administrator-only operation (it was
 * previously callable by anyone).
 */
export const POST = secureRoute(
  {
    resource: 'infra.ping',
    action: 'execute',
    roles: ['super_admin', 'admin'],
    rateLimit: { limit: 30, windowMs: 60_000 },
  },
  async (context) => {
    const [postgresql, redis, qdrant, minio] = await Promise.all([
      pingPostgres().catch((err) => ({
        success: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : 'Ping failed',
      })),
      pingRedis().catch((err) => ({
        success: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : 'Ping failed',
      })),
      pingQdrant().catch((err) => ({
        success: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : 'Ping failed',
      })),
      pingMinio().catch((err) => ({
        success: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : 'Ping failed',
      })),
    ])

    return jsonResponse(
      {
        results: {
          postgresql: { success: postgresql.success, latencyMs: postgresql.latencyMs, error: postgresql.error },
          redis: { success: redis.success, latencyMs: redis.latencyMs, error: redis.error },
          qdrant: { success: qdrant.success, latencyMs: qdrant.latencyMs, error: qdrant.error },
          minio: { success: (minio as { success: boolean }).success, latencyMs: (minio as { latencyMs: number }).latencyMs, error: (minio as { error?: string }).error },
        },
      },
      context.requestId,
    );
  },
);