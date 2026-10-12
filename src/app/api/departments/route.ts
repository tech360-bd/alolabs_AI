import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const departments = await db.department.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { agents: true } },
      },
    });

    const data = departments.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      description: d.description,
      agentCount: d._count.agents,
      sortOrder: d.sortOrder,
      status: d.status,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const body = await request.json();
    const { name, slug, description, managerId, agentCount, sortOrder, status } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const departmentSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    if (!departmentSlug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const existing = await db.department.findUnique({ where: { slug: departmentSlug } });
    if (existing) {
      return NextResponse.json({ error: 'Department with this slug already exists' }, { status: 409 });
    }

    const department = await db.department.create({
      data: {
        name,
        slug: departmentSlug,
        description: description || null,
        managerId: managerId || null,
        agentCount: agentCount ?? 20,
        sortOrder: sortOrder ?? 0,
        status: status || 'active',
      },
    });

    return NextResponse.json(department, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}