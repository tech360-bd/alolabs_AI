import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const allSettings = await db.settings.findMany({
      where: { key: { startsWith: 'funnel:' } },
      orderBy: { createdAt: 'desc' },
    });

    let funnels: Array<Record<string, unknown>> = [];

    for (const s of allSettings) {
      try {
        const parsed = JSON.parse(s.value);
        funnels.push({
          id: s.id,
          ...parsed,
          steps: parsed.steps || [],
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        });
      } catch {
        // skip
      }
    }

    const totalVisitors = funnels.reduce((sum, f) => sum + ((f.visitors as number) || 0), 0);
    const totalLeads = funnels.reduce((sum, f) => sum + ((f.leads as number) || 0), 0);
    const avgConversion =
      funnels.length > 0
        ? Math.round(
            funnels.reduce((sum, f) => {
              const visitors = (f.visitors as number) || 0;
              const leads = (f.leads as number) || 0;
              const rate = visitors > 0 ? (leads / visitors) * 100 : 0;
              return sum + rate;
            }, 0) / funnels.length
          )
        : 0;

    const stats = {
      total: funnels.length,
      avgConversionRate: avgConversion,
      totalVisitors,
      totalLeads,
    };

    return NextResponse.json({ funnels, stats });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Funnels GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { name, description, steps } = body as {
      name: string;
      description: string;
      steps: Array<{ title: string; content: string; type: string }>;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const ts = new Date().toISOString();
    const id = `funnel:${Date.now()}`;

    const normalizedSteps = (steps || []).map((step, idx) => ({
      title: step.title || `Step ${idx + 1}`,
      content: step.content || '',
      type: step.type || 'landing_page',
      visitors: 0,
      conversions: 0,
    }));

    const value = JSON.stringify({
      name: name.trim(),
      description: (description || '').trim(),
      steps: normalizedSteps,
      visitors: 0,
      leads: 0,
      status: 'draft',
      createdBy: user.name || user.email,
      createdAt: ts,
    });

    const setting = await db.settings.create({
      data: { key: id, value, type: 'json' },
    });

    return NextResponse.json({ success: true, id: setting.id });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Funnels POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { id, name, description, steps, visitors, leads, status } = body as {
      id: string;
      name?: string;
      description?: string;
      steps?: Array<Record<string, unknown>>;
      visitors?: number;
      leads?: number;
      status?: string;
    };

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.settings.findUnique({ where: { id } });
    if (!existing || !existing.key.startsWith('funnel:')) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    const parsed = JSON.parse(existing.value);
    const updates: Record<string, unknown> = {};

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (steps !== undefined) updates.steps = steps;
    if (visitors !== undefined) updates.visitors = visitors;
    if (leads !== undefined) updates.leads = leads;
    if (status !== undefined) updates.status = status;

    const newValue = { ...parsed, ...updates };
    await db.settings.update({
      where: { id },
      data: { value: JSON.stringify(newValue) },
    });

    return NextResponse.json({ id, key: existing.key, ...newValue });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Funnels PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.settings.findUnique({ where: { id } });
    if (!existing || !existing.key.startsWith('funnel:')) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    await db.settings.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Funnels DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}