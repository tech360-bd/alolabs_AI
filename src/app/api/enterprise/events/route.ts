import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { EVENTS, type EnterpriseEventSpec } from '@/lib/enterprise-spec'

interface EventResponse {
  id: string
  name: string
  category: string
  publisher: string
  subscribers: string[]
  priority: string
  trigger: string
  actionRequired: boolean
  sla: string
}

function mapEventToResponse(event: EnterpriseEventSpec): EventResponse {
  return {
    id: event.eventId,
    name: event.name,
    category: event.category,
    publisher: event.publisher,
    subscribers: event.subscribers,
    priority: event.priority,
    trigger: event.trigger,
    actionRequired: event.actionRequired,
    sla: event.sla,
  }
}

function buildStats() {
  const byPriority: Record<string, number> = {}
  const byCategory: Record<string, number> = {}

  for (const event of EVENTS) {
    byPriority[event.priority] = (byPriority[event.priority] || 0) + 1
    byCategory[event.category] = (byCategory[event.category] || 0) + 1
  }

  return {
    total: EVENTS.length,
    byPriority,
    byCategory,
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const limit = Math.min(Number(searchParams.get('limit') || 60), 200)
    const priority = searchParams.get('priority') || ''
    const category = searchParams.get('category') || ''
    const search = searchParams.get('search') || ''
    // Backward compat: 'severity' param maps to priority for legacy consumers
    const severity = searchParams.get('severity') || ''
    // Backward compat: 'type' param maps to category for legacy consumers
    const type = searchParams.get('type') || ''

    const filterPriority = priority || severity
    const filterCategory = category || type

    let filtered = EVENTS

    if (filterPriority && filterPriority !== 'all') {
      filtered = filtered.filter(
        (e) => e.priority.toUpperCase() === filterPriority.toUpperCase()
      )
    }
    if (filterCategory && filterCategory !== 'all') {
      filtered = filtered.filter(
        (e) => e.category.toLowerCase() === filterCategory.toLowerCase()
      )
    }
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.eventId.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q)
      )
    }

    const total = filtered.length
    const paged = filtered.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      events: paged.map(mapEventToResponse),
      stats: buildStats(),
      total,
      page,
      limit,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
