import { NextRequest, NextResponse } from 'next/server'
import { isRedisConnected, redisSet, redisDel } from '@/lib/redis'
import { requireRole } from '@/lib/api-auth'

// GET: List Redis keys
export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin')
    const { searchParams } = new URL(request.url)
    const pattern = searchParams.get('pattern') || '*'

    if (!isRedisConnected()) {
      return NextResponse.json({
        connected: false,
        message: 'Redis is not connected. Connect first via /api/infra/connect.',
        keys: [],
        pattern,
        fallback: true,
        fallbackInfo: 'In-memory cache is active but KEY scanning is not supported. Set/get keys via POST/DELETE.',
      })
    }

    return NextResponse.json({
      connected: true,
      message: 'Redis connected. Use POST to set keys, DELETE to remove keys.',
      keys: [],
      pattern,
      note: 'Key scanning not available via adapter. Use POST/DELETE for key operations.',
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 })
    }
    console.error('[Infra Redis Keys GET] Error:', error)
    return NextResponse.json({ error: 'Failed to list keys' }, { status: 500 })
  }
}

// POST: Set a key
export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin')
    const body = await request.json()
    const { key, value, ttl } = body as { key: string; value: string; ttl?: number }

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
    }

    if (typeof key !== 'string' || key.length === 0) {
      return NextResponse.json({ error: 'key must be a non-empty string' }, { status: 400 })
    }

    await redisSet(key, String(value), ttl)

    return NextResponse.json({
      success: true,
      key,
      ttl: ttl || null,
      message: ttl ? `Key set with ${ttl}s TTL` : 'Key set',
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 })
    }
    console.error('[Infra Redis Keys POST] Error:', error)
    return NextResponse.json({ error: 'Failed to set key' }, { status: 500 })
  }
}

// DELETE: Delete keys
export async function DELETE(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin')
    const body = await request.json()
    const { keys } = body as { keys: string[] }

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: 'keys array is required' }, { status: 400 })
    }

    const deleted = await redisDel(keys)

    return NextResponse.json({
      success: true,
      deleted,
      message: `${deleted} key(s) deleted`,
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 })
    }
    console.error('[Infra Redis Keys DELETE] Error:', error)
    return NextResponse.json({ error: 'Failed to delete keys' }, { status: 500 })
  }
}
