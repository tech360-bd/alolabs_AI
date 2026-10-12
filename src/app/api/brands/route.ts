import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import {
  parseBody,
  parseQuery,
  paginationQuery,
  buildWhereClause,
  buildOrderBy,
  paginatedResponse,
} from '@/lib/validators';

const brandCreateSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(255),
  logoUrl: z.string().optional(),
  primaryColor: z.string().default('#003ABC'),
  secondaryColor: z.string().default('#10B981'),
  accentColor: z.string().default('#F59E0B'),
  fontFamily: z.string().default('Inter'),
  customCss: z.string().default(''),
  faviconUrl: z.string().optional(),
  emailLogoUrl: z.string().optional(),
});

// GET /api/brands — return brand configurations with pagination
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const parsed = parseQuery(paginationQuery, new URL(request.url).searchParams);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { page, limit, sort, order, search } = parsed.data;
    const where = buildWhereClause(['name'], search);
    const orderBy = buildOrderBy(sort, order);

    const [brands, total] = await Promise.all([
      db.brand.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.brand.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(brands, page, limit, total));
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Brands GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/brands — create a brand configuration
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = parseBody(brandCreateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const data = parsed.data;

    const brand = await db.brand.create({ data });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'brands',
        details: JSON.stringify({ brandId: brand.id, name: brand.name }),
      },
    });

    return NextResponse.json({ data: brand }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Brands POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/brands — update a brand configuration
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.brand.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    const brand = await db.brand.update({
      where: { id },
      data: updateData,
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'brands',
        details: JSON.stringify({ brandId: id, changes: Object.keys(updateData) }),
      },
    });

    return NextResponse.json({ data: brand });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Brands PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/brands — delete a brand configuration
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.brand.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    await db.brand.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'brands',
        details: JSON.stringify({ brandId: id, name: existing.name }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Brands DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
