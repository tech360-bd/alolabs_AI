import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isPostgresConnected, getPostgresError } from '@/lib/postgres'
import { isRedisConnected, getRedisError } from '@/lib/redis'
import { isQdrantConnected, getQdrantError } from '@/lib/qdrant'
import { getMinioStatus, getMinioError } from '@/lib/minio'
import { requireRole } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    await requireRole('admin', 'super_admin');
    // Read all infra service records from DB
    const dbServices = await db.infraService.findMany({
      orderBy: { createdAt: 'asc' },
    })

    // Map of type -> connected state from live adapters
    const liveState: Record<string, { connected: boolean; error: string | null }> = {
      postgresql: { connected: isPostgresConnected(), error: getPostgresError() },
      redis: { connected: isRedisConnected(), error: getRedisError() },
      qdrant: { connected: isQdrantConnected(), error: getQdrantError() },
      minio: { connected: getMinioStatus() === 'connected', error: getMinioError() },
    }

    // Ensure all 4 services exist
    const defaultServices = ['postgresql', 'redis', 'qdrant', 'minio']
    const existingTypes = new Set(dbServices.map((s) => s.type))

    for (const type of defaultServices) {
      if (!existingTypes.has(type)) {
        dbServices.push({
          id: type,
          name: type.charAt(0).toUpperCase() + type.slice(1),
          type,
          host: 'localhost',
          port: type === 'postgresql' ? 5432 : type === 'redis' ? 6379 : type === 'qdrant' ? 6333 : 9000,
          status: 'disconnected',
          connectedAt: null,
          lastPingAt: null,
          latencyMs: 0,
          version: null,
          configJson: '{}',
          statsJson: '{}',
          errorCount: 0,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }
    }

    const services = defaultServices.map((type) => {
      const dbRecord = dbServices.find((s) => s.type === type)
      const live = liveState[type]
      let status = dbRecord?.status || 'disconnected'

      // If live adapter says disconnected but DB says connected, prefer live
      if (!live.connected && status === 'connected') {
        status = 'disconnected'
      }

      // For minio, also check the specific fallback status
      if (type === 'minio') {
        const minioStatus = getMinioStatus()
        if (minioStatus === 'fallback') status = 'fallback'
        if (minioStatus === 'connected') status = 'connected'
      }

      let config: { host: string; port: number } = { host: 'localhost', port: 0 }
      try {
        const parsed = JSON.parse(dbRecord?.configJson || '{}')
        config = {
          host: parsed.host || dbRecord?.host || 'localhost',
          port: parsed.port || dbRecord?.port || 0,
        }
      } catch {
        config = { host: dbRecord?.host || 'localhost', port: dbRecord?.port || 0 }
      }

      return {
        type,
        name: dbRecord?.name || type.charAt(0).toUpperCase() + type.slice(1),
        status,
        connected: live.connected,
        latencyMs: dbRecord?.latencyMs || 0,
        version: dbRecord?.version || null,
        lastPingAt: dbRecord?.lastPingAt?.toISOString() || null,
        errorCount: dbRecord?.errorCount || 0,
        lastError: live.error || dbRecord?.lastError || null,
        config,
      }
    })

    return NextResponse.json({ services })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('[Infra Status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch infrastructure status' },
      { status: 500 }
    )
  }
}