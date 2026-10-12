import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || ''
    const search = searchParams.get('search') || ''

    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: 'prompt_vault:' } },
      orderBy: { updatedAt: 'desc' },
    })

    let prompts: Array<{
      id: string
      name: string
      category: string
      version: string
      locked: boolean
      createdAt: string
      updatedAt: string
      contentPreview: string
    }> = []

    for (const s of allSettings) {
      try {
        const parsed = JSON.parse(s.value)
        if (category && parsed.category !== category) continue
        if (search && !parsed.name.toLowerCase().includes(search.toLowerCase())) continue
        prompts.push({
          id: s.id,
          name: parsed.name || 'Untitled',
          category: parsed.category || 'system_prompts',
          version: parsed.version || '1.0.0',
          locked: !!parsed.locked,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          contentPreview: (parsed.content || '').slice(0, 80),
        })
      } catch {
        // skip bad entries
      }
    }

    return NextResponse.json({ prompts })
  } catch (error) {
    console.error('Prompts GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json()
    const { name, category, content, version } = body as {
      name: string
      category: string
      content: string
      version: string
    }

    if (!name || !category || !content) {
      return NextResponse.json({ error: 'name, category, and content are required' }, { status: 400 })
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const key = `prompt_vault:${slug}`

    const value = JSON.stringify({
      name,
      category,
      content,
      version: version || '1.0.0',
      locked: false,
      createdAt: new Date().toISOString(),
    })

    const setting = await db.settings.upsert({
      where: { key },
      update: { value, type: 'json', updatedAt: new Date() },
      create: { key, value, type: 'json' },
    })

    return NextResponse.json({ success: true, id: setting.id, key })
  } catch (error) {
    console.error('Prompts POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json()
    const { id, content, version, locked } = body as {
      id: string
      content?: string
      version?: string
      locked?: boolean
    }

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.settings.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
    }

    const parsed = JSON.parse(existing.value)

    if (parsed.locked && !locked) {
      return NextResponse.json({ error: 'Prompt is locked. Unlock first.' }, { status: 403 })
    }

    if (content !== undefined) parsed.content = content
    if (version !== undefined) parsed.version = version
    if (locked !== undefined) parsed.locked = locked
    parsed.updatedAt = new Date().toISOString()

    await db.settings.update({
      where: { id },
      data: { value: JSON.stringify(parsed), updatedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Prompts PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.settings.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
    }

    const parsed = JSON.parse(existing.value)
    if (parsed.locked) {
      return NextResponse.json({ error: 'Prompt is locked. Unlock first.' }, { status: 403 })
    }

    await db.settings.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Prompts DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}