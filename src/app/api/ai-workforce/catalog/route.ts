import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireCompanyAuth, requireRole } from '@/lib/api-auth'

const CreateCatalogItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.string().trim().min(1).max(80),
  subcategory: z.string().trim().max(80).optional(),
  description: z.string().trim().max(5000).default(''),
  capabilities: z.array(z.string().trim().min(1)).default([]),
  requiredTools: z.array(z.string().trim().min(1)).default([]),
  systemPrompt: z.string().default(''),
  configTemplate: z.record(z.string(), z.unknown()).default({}),
  icon: z.string().trim().min(1).max(80).default('Bot'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#003ABC'),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await requireCompanyAuth()
    const category = req.nextUrl.searchParams.get('category')
    const where: Prisma.AgentCatalogItemWhereInput = { isActive: true }
    if (category) where.category = category

    const items = await db.agentCatalogItem.findMany({
      where,
      orderBy: { installCount: 'desc' },
      include: { _count: { select: { reviews: true, installs: true } } },
    })
    const ratings = await db.agentCatalogReview.groupBy({
      by: ['catalogId'],
      where: { catalogId: { in: items.map((item) => item.id) } },
      _avg: { rating: true },
    })
    const ratingByCatalogId = new Map(ratings.map((rating) => [rating.catalogId, rating._avg.rating ?? 0]))
    const data = items.map((item) => ({ ...item, avgRating: ratingByCatalogId.get(item.id) ?? 0 }))
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('super_admin')
    const parsed = CreateCatalogItemSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }
    const item = parsed.data
    const data = await db.agentCatalogItem.create({
      data: {
        ...item,
        capabilities: JSON.stringify(item.capabilities),
        requiredTools: JSON.stringify(item.requiredTools),
        configTemplate: JSON.stringify(item.configTemplate),
      },
    })
    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
