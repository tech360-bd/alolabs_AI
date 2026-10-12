import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  parseBody,
  parseQuery,
  paginationQuery,
  buildWhereClause,
  buildOrderBy,
  paginatedResponse,
} from '@/lib/validators'
import { requireAuth } from '@/lib/api-auth'

const mcpCreateSchema = z.object({
  name: z.string().min(1),
  host: z.string().default('localhost'),
  port: z.number().int().default(3000),
  protocol: z.enum(['http', 'https', 'ws', 'wss']).default('http'),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(z.unknown()).optional(),
})

const mcpUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  host: z.string().optional(),
  port: z.number().int().optional(),
  protocol: z.enum(['http', 'https', 'ws', 'wss']).optional(),
  status: z.enum(['connected', 'disconnected', 'error']).optional(),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(z.unknown()).optional(),
  latencyMs: z.number().int().optional(),
  errorCount: z.number().int().optional(),
  lastError: z.string().optional(),
})

// GET /api/mcp-servers
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const parsed = parseQuery(paginationQuery, new URL(request.url).searchParams)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const { page, limit, sort, order, search } = parsed.data
    const where = buildWhereClause(['name', 'description'], search)
    const orderBy = buildOrderBy(sort, order)

    const [servers, total] = await Promise.all([
      db.mcpServer.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.mcpServer.count({ where }),
    ])

    return NextResponse.json(paginatedResponse(servers, page, limit, total))
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('MCP Servers GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/mcp-servers
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const parsed = parseBody(mcpCreateSchema, body)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const data = parsed.data
    const server = await db.mcpServer.create({
      data: {
        name: data.name,
        host: data.host,
        port: data.port,
        protocol: data.protocol,
        description: data.description,
        config: JSON.stringify(data.config || {}),
        tools: JSON.stringify(data.tools || []),
      },
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'mcp-servers',
        details: JSON.stringify({ mcpServerId: server.id, name: server.name }),
      },
    })

    return NextResponse.json({ data: server }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('MCP Servers POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/mcp-servers
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const parsed = parseBody(mcpUpdateSchema, body)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const { id, ...updateData } = parsed.data

    const existing = await db.mcpServer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (updateData.name !== undefined) data.name = updateData.name
    if (updateData.host !== undefined) data.host = updateData.host
    if (updateData.port !== undefined) data.port = updateData.port
    if (updateData.protocol !== undefined) data.protocol = updateData.protocol
    if (updateData.status !== undefined) data.status = updateData.status
    if (updateData.description !== undefined) data.description = updateData.description
    if (updateData.config !== undefined) data.config = JSON.stringify(updateData.config)
    if (updateData.tools !== undefined) data.tools = JSON.stringify(updateData.tools)
    if (updateData.latencyMs !== undefined) data.latencyMs = updateData.latencyMs
    if (updateData.errorCount !== undefined) data.errorCount = updateData.errorCount
    if (updateData.lastError !== undefined) data.lastError = updateData.lastError

    if (updateData.status === 'connected') {
      data.lastPingAt = new Date()
    }

    const server = await db.mcpServer.update({
      where: { id },
      data,
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'mcp-servers',
        details: JSON.stringify({ mcpServerId: id, changes: Object.keys(updateData) }),
      },
    })

    return NextResponse.json({ data: server })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('MCP Servers PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/mcp-servers
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.mcpServer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    await db.mcpServer.delete({ where: { id } })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'mcp-servers',
        details: JSON.stringify({ mcpServerId: id, name: existing.name }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('MCP Servers DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
