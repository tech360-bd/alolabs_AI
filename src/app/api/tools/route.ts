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
      where: { key: { startsWith: 'tool_registry:' } },
      orderBy: { updatedAt: 'desc' },
    })

    const tools: Array<Record<string, unknown>> = []
    for (const s of allSettings) {
      try {
        const parsed = JSON.parse(s.value)
        if (category && parsed.category !== category) continue
        if (search && !parsed.name.toLowerCase().includes(search.toLowerCase())) continue
        tools.push({
          id: s.id,
          ...parsed,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })
      } catch {
        // skip
      }
    }

    return NextResponse.json({ tools })
  } catch (error) {
    console.error('Tools GET error:', error)
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
    const { name, category, description, riskLevel, allowedDepartments, blockedDepartments } = body as {
      name: string
      category: string
      description: string
      riskLevel: string
      allowedDepartments: string[]
      blockedDepartments: string[]
    }

    if (!name || !category) {
      return NextResponse.json({ error: 'name and category are required' }, { status: 400 })
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const key = `tool_registry:${slug}`

    const value = JSON.stringify({
      name,
      category,
      description: description || '',
      riskLevel: riskLevel || 'low',
      allowedDepartments: allowedDepartments || [],
      blockedDepartments: blockedDepartments || [],
      status: 'active',
      createdAt: new Date().toISOString(),
    })

    const setting = await db.settings.upsert({
      where: { key },
      update: { value, type: 'json', updatedAt: new Date() },
      create: { key, value, type: 'json' },
    })

    return NextResponse.json({ success: true, id: setting.id, key })
  } catch (error) {
    console.error('Tools POST error:', error)
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
    await db.settings.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Tools DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}