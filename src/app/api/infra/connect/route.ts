import { NextRequest, NextResponse } from 'next/server'
import { connectPostgres, disconnectPostgres } from '@/lib/postgres'
import { connectRedis, disconnectRedis } from '@/lib/redis'
import { connectQdrant } from '@/lib/qdrant'
import { connectMinio } from '@/lib/minio'
import { requireRole } from '@/lib/api-auth'

const VALID_TYPES = ['postgresql', 'redis', 'qdrant', 'minio'] as const
type InfraType = (typeof VALID_TYPES)[number]

export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin');
    const body = await request.json()
    const { type, config, action } = body as {
      type: InfraType
      config?: Record<string, unknown>
      action?: 'connect' | 'disconnect'
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid service type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Handle disconnect
    if (action === 'disconnect') {
      if (type === 'postgresql') {
        disconnectPostgres()
        return NextResponse.json({ success: true, message: 'PostgreSQL disconnected' })
      }
      if (type === 'redis') {
        disconnectRedis()
        return NextResponse.json({ success: true, message: 'Redis disconnected' })
      }
      // Qdrant and MinIO don't have explicit disconnect — clear state
      return NextResponse.json({ success: true, message: `${type} disconnect not supported` })
    }

    // Handle connect
    let result: { success: boolean; error?: string; latencyMs?: number; version?: string }

    switch (type) {
      case 'postgresql': {
        const pgConfig = config
          ? {
              host: String(config.host || 'localhost'),
              port: Number(config.port || 5432),
              database: String(config.database || 'agent_hub'),
              user: String(config.user || 'postgres'),
              password: String(config.password || ''),
              ssl: Boolean(config.ssl),
              maxConnections: Number(config.maxConnections || 10),
            }
          : undefined
        result = await connectPostgres(pgConfig)
        break
      }
      case 'redis': {
        const redisConfig = config
          ? {
              host: String(config.host || 'localhost'),
              port: Number(config.port || 6379),
              password: config.password ? String(config.password) : undefined,
              db: Number(config.db || 0),
              keyPrefix: config.prefix ? String(config.prefix) : 'alohub:',
            }
          : undefined
        result = await connectRedis(redisConfig)
        break
      }
      case 'qdrant': {
        const qdrantConfig = config
          ? {
              host: String(config.host || 'localhost'),
              port: Number(config.port || 6333),
              apiKey: config.api_key ? String(config.api_key) : undefined,
              timeoutMs: Number(config.timeoutMs || 10000),
            }
          : undefined
        result = await connectQdrant(qdrantConfig)
        break
      }
      case 'minio': {
        const minioConfig = config
          ? {
              endPoint: String(config.endpoint || 'localhost'),
              port: Number(config.port || 9000),
              accessKey: String(config.access_key || ''),
              secretKey: String(config.secret_key || ''),
              useSSL: Boolean(config.ssl),
              region: String(config.region || 'us-east-1'),
              bucket: String(config.bucket || 'agent-hub'),
            }
          : undefined
        result = await connectMinio(minioConfig)
        break
      }
      default:
        return NextResponse.json({ error: 'Invalid service type' }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('[Infra Connect] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500 }
    )
  }
}