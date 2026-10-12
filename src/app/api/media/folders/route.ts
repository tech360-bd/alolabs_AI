import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'

interface FolderRecord {
  id: string
  name: string
  type: string
  createdAt: string
}

async function getAllFolders(): Promise<FolderRecord[]> {
  const records = await db.settings.findMany({
    where: {
      key: { startsWith: 'media:folder:' },
    },
  })

  const folders: FolderRecord[] = []
  for (const record of records) {
    try {
      const parsed = JSON.parse(record.value) as FolderRecord
      folders.push(parsed)
    } catch {
      // skip malformed
    }
  }

  return folders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

async function getFileCountsByFolder(): Promise<Record<string, number>> {
  const records = await db.settings.findMany({
    where: {
      key: { startsWith: 'media:file:' },
    },
  })

  const counts: Record<string, number> = {
    all: 0,
    image: 0,
    video: 0,
    document: 0,
    other: 0,
  }

  for (const record of records) {
    try {
      const file = JSON.parse(record.value)
      counts.all = (counts.all || 0) + 1

      if (file.type) {
        counts[file.type] = (counts[file.type] || 0) + 1
      }

      if (file.folder && file.folder !== 'all' && !['image', 'video', 'document'].includes(file.type)) {
        counts[file.folder] = (counts[file.folder] || 0) + 1
      }
    } catch {
      // skip
    }
  }

  return counts
}

// GET: List folders
export async function GET() {
  try {
    await requireAuth()

    const folders = await getAllFolders()
    const counts = await getFileCountsByFolder()

    const folderData = folders.map((f) => ({
      id: f.name,
      name: f.name,
      type: 'custom' as const,
      count: counts[f.name] || 0,
      createdAt: f.createdAt,
    }))

    // Always include built-in type counts
    return NextResponse.json({
      data: folderData,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Media folders GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create folder
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { name } = body as { name?: string }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const folderName = name.trim()

    // Check for duplicate
    const existing = await db.settings.findUnique({
      where: { key: `media:folder:${folderName}` },
    })

    if (existing) {
      return NextResponse.json({ error: 'Folder already exists' }, { status: 409 })
    }

    const folderData = {
      id: folderName,
      name: folderName,
      type: 'custom',
      createdBy: user.userId,
      createdAt: new Date().toISOString(),
    }

    await db.settings.create({
      data: {
        key: `media:folder:${folderName}`,
        value: JSON.stringify(folderData),
        type: 'json',
      },
    })

    return NextResponse.json({ data: folderData }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Media folders POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT: Rename folder
export async function PUT(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()
    const { oldName, newName } = body as { oldName?: string; newName?: string }

    if (!oldName || !newName || !newName.trim()) {
      return NextResponse.json({ error: 'oldName and newName are required' }, { status: 400 })
    }

    const trimmedNew = newName.trim()

    // Find old folder
    const oldFolder = await db.settings.findUnique({
      where: { key: `media:folder:${oldName}` },
    })

    if (!oldFolder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // Check new name doesn't conflict
    const existing = await db.settings.findUnique({
      where: { key: `media:folder:${trimmedNew}` },
    })

    if (existing) {
      return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })
    }

    // Update all files in this folder
    const fileRecords = await db.settings.findMany({
      where: { key: { startsWith: 'media:file:' } },
    })

    for (const record of fileRecords) {
      try {
        const file = JSON.parse(record.value)
        if (file.folder === oldName) {
          file.folder = trimmedNew
          await db.settings.update({
            where: { key: record.key },
            data: { value: JSON.stringify(file) },
          })
        }
      } catch {
        // skip
      }
    }

    // Delete old folder record
    await db.settings.delete({ where: { key: `media:folder:${oldName}` } })

    // Create new folder record
    const folderData = {
      id: trimmedNew,
      name: trimmedNew,
      type: 'custom',
      createdAt: new Date().toISOString(),
    }

    await db.settings.create({
      data: {
        key: `media:folder:${trimmedNew}`,
        value: JSON.stringify(folderData),
        type: 'json',
      },
    })

    return NextResponse.json({ data: folderData })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Media folders PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete folder
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()
    const { name } = body as { name?: string }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    // Move files in this folder back to 'all'
    const fileRecords = await db.settings.findMany({
      where: { key: { startsWith: 'media:file:' } },
    })

    for (const record of fileRecords) {
      try {
        const file = JSON.parse(record.value)
        if (file.folder === name) {
          file.folder = 'all'
          await db.settings.update({
            where: { key: record.key },
            data: { value: JSON.stringify(file) },
          })
        }
      } catch {
        // skip
      }
    }

    // Delete folder record
    try {
      await db.settings.delete({ where: { key: `media:folder:${name}` } })
    } catch {
      // may not exist
    }

    return NextResponse.json({
      data: { deleted: true, name },
      message: `Folder "${name}" deleted. Files moved to root.`,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Media folders DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}