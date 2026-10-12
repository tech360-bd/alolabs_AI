import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'

interface MediaFile {
  id: string
  name: string
  url: string
  size: number
  type: string
  mimeType: string
  folder: string
  tags: string[]
  thumbnailUrl: string | null
  uploadedBy: string
  createdAt: string
  updatedAt: string
}

async function getAllMediaFiles(): Promise<MediaFile[]> {
  const records = await db.settings.findMany({
    where: {
      key: { startsWith: 'media:file:' },
    },
  })

  const files: MediaFile[] = []
  for (const record of records) {
    try {
      const parsed = JSON.parse(record.value) as MediaFile
      files.push(parsed)
    } catch {
      // skip malformed records
    }
  }

  return files.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

// GET: List media files with pagination, search, folder filter
export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)))
    const search = searchParams.get('search') || ''
    const folder = searchParams.get('folder') || ''
    const type = searchParams.get('type') || ''

    let files = await getAllMediaFiles()

    // Filter by folder
    if (folder && folder !== 'all') {
      if (['image', 'video', 'document'].includes(folder)) {
        files = files.filter((f) => f.type === folder)
      } else {
        files = files.filter((f) => f.folder === folder)
      }
    }

    // Filter by type
    if (type && type !== 'all') {
      files = files.filter((f) => f.type === type)
    }

    // Search by name and tags
    if (search) {
      const q = search.toLowerCase()
      files = files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    const total = files.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const start = (page - 1) * limit
    const paginatedFiles = files.slice(start, start + limit)

    return NextResponse.json({
      data: paginatedFiles,
      total,
      page,
      limit,
      totalPages,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Media GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete media files
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { ids } = body as { ids?: string[] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }

    let deleted = 0
    for (const id of ids) {
      try {
        await db.settings.delete({
          where: { key: `media:file:${id}` },
        })
        deleted++
      } catch {
        // skip if not found
      }
    }

    return NextResponse.json({
      data: { deleted, ids },
      message: `Deleted ${deleted} file(s)`,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Media DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT: Update media files (move to folder, add tags)
export async function PUT(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()
    const { ids, folder, tags } = body as { ids?: string[]; folder?: string; tags?: string[] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }

    let updated = 0
    for (const id of ids) {
      try {
        const record = await db.settings.findUnique({
          where: { key: `media:file:${id}` },
        })
        if (!record) continue

        const fileData = JSON.parse(record.value) as Record<string, unknown>
        if (folder) fileData.folder = folder
        if (tags) fileData.tags = [...new Set([...((fileData.tags as string[]) || []), ...tags])]
        fileData.updatedAt = new Date().toISOString()

        await db.settings.update({
          where: { key: `media:file:${id}` },
          data: { value: JSON.stringify(fileData) },
        })
        updated++
      } catch {
        // skip errors
      }
    }

    return NextResponse.json({
      data: { updated, ids },
      message: `Updated ${updated} file(s)`,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Media PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}