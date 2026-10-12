import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getMarketingSkill, skillTriggers } from '@/lib/marketing-kit'
import { assetDoc, referenceDoc, skillBody, skillWithBody } from '@/lib/marketing-kit/content'

/**
 * GET /api/marketing-kit/:slug            → metadata + full playbook body
 * GET /api/marketing-kit/:slug?ref=<path>   → one reference document
 * GET /api/marketing-kit/:slug?asset=<path> → one text asset (template), as JSON
 * GET /api/marketing-kit/:slug?asset=<path>&download=1 → the raw file with its content type
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireAuth()
    const { slug } = await params
    const { searchParams } = new URL(request.url)
    const ref = searchParams.get('ref')
    const asset = searchParams.get('asset')

    const skill = getMarketingSkill(slug)
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    if (ref) {
      const doc = referenceDoc(slug, ref)
      if (!doc) return NextResponse.json({ error: 'Reference not found' }, { status: 404 })
      return NextResponse.json({ slug, reference: doc })
    }

    if (asset) {
      const doc = assetDoc(slug, asset)
      if (!doc) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
      if (searchParams.get('download') === '1') {
        const filename = doc.path.split('/').pop() ?? 'asset.txt'
        return new NextResponse(doc.content, {
          headers: {
            'Content-Type': doc.contentType,
            'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
            'X-Content-Type-Options': 'nosniff',
          },
        })
      }
      return NextResponse.json({ slug, asset: doc })
    }

    const withBody = skillWithBody(slug)
    if (!withBody) {
      return NextResponse.json({ error: 'Playbook body missing — re-run scripts/sync-marketing-kit.mjs' }, { status: 500 })
    }

    return NextResponse.json({
      ...withBody,
      body: withBody.body,
      triggers: skillTriggers(skill),
      hasBody: Boolean(skillBody(slug)),
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Marketing kit detail error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
