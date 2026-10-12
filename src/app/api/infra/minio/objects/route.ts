import { NextRequest, NextResponse } from 'next/server'
import { isMinioConnected, listObjects, putObject } from '@/lib/minio'
import { requireRole } from '@/lib/api-auth'

// GET: List objects
export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin')
    const { searchParams } = new URL(request.url)
    const prefix = searchParams.get('prefix') || ''
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    const objects = await listObjects(prefix, limit)

    return NextResponse.json({
      connected: isMinioConnected(),
      objects,
      count: objects.length,
      prefix,
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 })
    }
    console.error('[Infra MinIO Objects GET] Error:', error)
    return NextResponse.json({ error: 'Failed to list objects' }, { status: 500 })
  }
}

// POST: Upload object (FormData with file + key)
export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin')
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const key = formData.get('key') as string | null

    if (!file) {
      return NextResponse.json({ error: 'file field is required in FormData' }, { status: 400 })
    }

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key field is required in FormData' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const contentType = file.type || 'application/octet-stream'

    const result = await putObject(key, buffer, contentType)

    return NextResponse.json({
      success: true,
      key: result.key,
      size: result.size,
      storageType: result.storageType,
      message: `Object uploaded to ${result.storageType}`,
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 })
    }
    console.error('[Infra MinIO Objects POST] Error:', error)
    return NextResponse.json({ error: 'Failed to upload object' }, { status: 500 })
  }
}
