import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { parseBody, parseQuery, paginationQuery, buildWhereClause, buildOrderBy, paginatedResponse } from '@/lib/validators';

const roleCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional(),
});

const roleUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  permissionIds: z.array(z.string()).optional(),
});

// GET /api/roles
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const parsed = parseQuery(paginationQuery, new URL(request.url).searchParams);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { page, limit, sort, order, search } = parsed.data;
    const where = buildWhereClause(['name', 'description'], search);
    const orderBy = buildOrderBy(sort, order);

    const [roles, total] = await Promise.all([
      db.role.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          permissions: { include: { permission: true } },
        },
      }),
      db.role.count({ where }),
    ]);

    const data = roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((rp) => ({
        id: rp.permission.id,
        name: rp.permission.name,
        resource: rp.permission.resource,
        action: rp.permission.action,
      })),
    }));

    return NextResponse.json(paginatedResponse(data, page, limit, total));
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Roles GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/roles
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = parseBody(roleCreateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { name, description, permissionIds } = parsed.data;

    const role = await db.role.create({
      data: {
        name,
        description,
        permissions: permissionIds
          ? {
              create: permissionIds.map((pid) => ({
                permission: { connect: { id: pid } },
              })),
            }
          : undefined,
      },
      include: {
        permissions: { include: { permission: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'roles',
        details: JSON.stringify({ roleId: role.id, name: role.name }),
      },
    });

    return NextResponse.json({ data: role }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Roles POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/roles
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = parseBody(roleUpdateSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { id, name, description, permissionIds } = parsed.data;

    const existing = await db.role.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // If permissionIds provided, replace all permissions
    if (permissionIds !== undefined) {
      await db.rolePermission.deleteMany({ where: { roleId: id } });
      await db.rolePermission.createMany({
        data: permissionIds.map((pid) => ({ roleId: id, permissionId: pid })),
      });
    }

    const role = await db.role.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
      },
      include: {
        permissions: { include: { permission: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'roles',
        details: JSON.stringify({ roleId: id, changes: Object.keys(parsed.data).filter((k) => k !== 'id') }),
      },
    });

    return NextResponse.json({ data: role });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Roles PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/roles
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.role.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    await db.role.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'roles',
        details: JSON.stringify({ roleId: id, name: existing.name }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Roles DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
