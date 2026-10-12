/**
 * GET /api/enterprise/rbac
 * POST /api/enterprise/rbac
 * Role-Based Access Control — requires auth.
 * GET returns all roles with their permissions.
 * POST creates/updates a role-permission binding (requires admin role).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const AssignPermissionSchema = z.object({
  roleId: z.string().min(1, 'roleId is required'),
  permissionId: z.string().min(1, 'permissionId is required'),
});

const CreateRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const roles = await db.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const permissions = await db.permission.findMany({
      orderBy: { resource: 'asc' },
    });

    const mapped = roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        name: rp.permission.name,
        resource: rp.permission.resource,
        action: rp.permission.action,
      })),
      permissionCount: role.permissions.length,
    }));

    return NextResponse.json({ roles: mapped, permissions });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Enterprise RBAC GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole('admin', 'super_admin');

    const body = await request.json();

    // Support two actions: create role, or assign permission
    if (body.action === 'create_role') {
      const parsed = CreateRoleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { name, description } = parsed.data;

      const existing = await db.role.findUnique({ where: { name } });
      if (existing) {
        return NextResponse.json(
          { error: `Role "${name}" already exists` },
          { status: 409 },
        );
      }

      const role = await db.role.create({
        data: { name, description: description || null },
      });

      return NextResponse.json({
        role: { id: role.id, name: role.name, description: role.description },
      }, { status: 201 });
    }

    // Default action: assign permission to role
    const parsed = AssignPermissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { roleId, permissionId } = parsed.data;

    // Verify role and permission exist
    const [role, permission] = await Promise.all([
      db.role.findUnique({ where: { id: roleId } }),
      db.permission.findUnique({ where: { id: permissionId } }),
    ]);

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    if (!permission) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404 });
    }

    // Upsert the binding
    const binding = await db.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId, permissionId },
      },
      update: {},
      create: { roleId, permissionId },
    });

    return NextResponse.json({
      binding: { id: binding.id, roleId, permissionId },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Enterprise RBAC POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
