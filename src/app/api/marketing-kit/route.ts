import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import {
  MARKETING_CATALOG,
  marketingCategories,
  marketingKitStats,
  searchMarketingSkills,
} from '@/lib/marketing-kit'
import { skillBody } from '@/lib/marketing-kit/content'

/**
 * GET /api/marketing-kit
 *   ?q=            free-text search across slug, title, description
 *   ?category=     exact category name
 *   ?limit=        cap the result set
 *   ?stats=true    header statistics only
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? ''
    const category = searchParams.get('category') ?? ''
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined

    if (searchParams.get('stats') === 'true') {
      return NextResponse.json({ stats: marketingKitStats(), categories: marketingCategories() })
    }

    const data = searchMarketingSkills({ q, category, limit })
    return NextResponse.json({
      data,
      total: data.length,
      catalogTotal: MARKETING_CATALOG.totalSkills,
      categories: marketingCategories(),
      stats: marketingKitStats(),
      source: MARKETING_CATALOG.source,
      license: MARKETING_CATALOG.license,
      syncedAt: MARKETING_CATALOG.syncedAt,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Marketing kit GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/marketing-kit
 * Install playbooks into the Skills Registry so agents can be granted them.
 * Body: { slugs: string[], status?: 'private' | 'approved', requiresApproval?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const slugs: string[] = Array.isArray(body.slugs) ? body.slugs : []
    if (!slugs.length) {
      return NextResponse.json({ error: 'slugs[] is required' }, { status: 400 })
    }

    const status = body.status === 'approved' ? 'approved' : 'private'
    const requiresApproval = body.requiresApproval ?? true
    const results: { slug: string; id: string; created: boolean }[] = []

    for (const slug of slugs) {
      const skill = MARKETING_CATALOG.skills.find((s) => s.slug === slug)
      if (!skill) continue
      const content = skillBody(slug) ?? ''
      const existing = await db.skill.findUnique({ where: { slug: `mk-${slug}` } })

      const payload = {
        name: skill.title,
        slug: `mk-${slug}`,
        category: skill.category,
        categorySlug: skill.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: skill.title,
        version: skill.version,
        status,
        riskLevel: 'low',
        requiresApproval,
        description: skill.description.slice(0, 2000),
        runtime: 'builtin',
        allowedTools: JSON.stringify([]),
        forbiddenTools: JSON.stringify([]),
        purpose: `Marketing Kit playbook — ${skill.category}. Source: ${MARKETING_CATALOG.source} (${skill.license}).`,
        content,
        inputs: JSON.stringify(['product context', 'brand voice', 'target segment']),
        outputs: JSON.stringify(['plan', 'copy', 'audit', 'recommendations']),
      }

      if (existing) {
        const updated = await db.skill.update({ where: { id: existing.id }, data: payload })
        results.push({ slug, id: updated.id, created: false })
      } else {
        const created = await db.skill.create({
          data: { ...payload, validationRules: '{}', securityRules: '{}', costPolicy: '{}' },
        })
        results.push({ slug, id: created.id, created: true })
      }
    }

    return NextResponse.json({
      installed: results.length,
      created: results.filter((r) => r.created).length,
      updated: results.filter((r) => !r.created).length,
      results,
      installedBy: user.userId,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Marketing kit POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
