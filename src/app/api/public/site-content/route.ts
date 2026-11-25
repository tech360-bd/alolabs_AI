import { NextRequest, NextResponse } from 'next/server';
import { listSiteContentBlocks } from '@/lib/site-content';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/site-content?page=home — public read of DB-backed website
 * content blocks (written only through the audited supervisor tool
 * `set_site_content`). Returns block payloads only; no authorship or audit
 * internals. Missing page or DB failure = empty list, never an error page.
 */
export async function GET(request: NextRequest) {
  const page = request.nextUrl.searchParams.get('page') || undefined;
  if (page && (page.length > 120 || !/^[a-z0-9-]+$/i.test(page))) {
    return NextResponse.json({ error: 'Invalid page slug' }, { status: 400 });
  }
  try {
    const blocks = await listSiteContentBlocks(page);
    return NextResponse.json({
      success: true,
      blocks: blocks.map((block) => ({
        page: block.page,
        blockKey: block.blockKey,
        content: JSON.parse(block.content) as unknown,
        version: block.version,
        updatedAt: block.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[PublicSiteContent] read failed:', error);
    return NextResponse.json({ success: true, blocks: [] });
  }
}
