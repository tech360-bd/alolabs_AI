import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const companyId = user.userId;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const category = searchParams.get('category');

    // Query RAG documents from database
    const where: Record<string, unknown> = { companyId };
    if (category) where.classification = category;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { source: { contains: search } },
      ];
    }

    const documents = await db.ragDocument.findMany({
      where,
      select: { id: true, name: true, classification: true, source: true, chunkCount: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Count by classification
    const categories = await db.ragDocument.groupBy({
      by: ['classification'],
      where: { companyId },
      _count: true,
    });

    // Count by source
    const sourceTypes = await db.ragDocument.groupBy({
      by: ['source'],
      where: { companyId },
      _count: true,
    });

    const data = {
      documents: documents.map(d => ({
        id: d.id,
        title: d.name,
        category: d.classification,
        sourceType: d.source,
        chunkCount: d.chunkCount,
        createdAt: d.createdAt,
      })),
      categories: categories.map(c => ({ name: c.classification, count: c._count })),
      sourceTypes: sourceTypes.map(s => ({ name: s.source, count: s._count })),
      templates: [
        { id: 'tmpl-report', name: 'Report Template', category: 'report', description: 'Standard report layout with sections' },
        { id: 'tmlp-proposal', name: 'Proposal Template', category: 'proposal', description: 'Business proposal with executive summary' },
        { id: 'tmpl-invoice', name: 'Invoice Template', category: 'invoice', description: 'Invoice with line items and totals' },
      ],
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Documents error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { action, title, content, category, sourceType } = body;

    if (action === 'create') {
      if (!title || !content) {
        return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
      }

      const doc = await db.ragDocument.create({
        data: {
          companyId: user.userId,
          name: title,
          source: sourceType ?? 'manual',
          classification: category ?? 'general',
          collectionId: 'default',
          chunkCount: 0,
        },
      });

      return NextResponse.json({ success: true, data: doc });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Documents POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
