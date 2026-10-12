import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { parseBody, parseQuery, paginationQuery } from '@/lib/validators';
import { createProject, listProjects } from '@/lib/projects';

/**
 * /api/projects — Project system (objective + runs + tasks + artifacts + memory).
 */

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  objective: z.string().max(10000).optional(),
  description: z.string().max(5000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const UpdateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  objective: z.string().max(10000).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const parsed = parseQuery(paginationQuery, new URL(request.url).searchParams);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { page, limit } = parsed.data;
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    const { projects, total } = await listProjects({
      ...(user.companyId ? { companyId: user.companyId } : {}),
      ownerId: user.userId,
      ...(status ? { status } : {}),
      limit,
      offset: (page - 1) * limit,
    });

    return NextResponse.json({
      data: projects,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/projects]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const body = await request.json();
    const parsed = parseBody(CreateProjectSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const project = await createProject({
      name: parsed.data.name,
      ...(parsed.data.objective !== undefined ? { objective: parsed.data.objective } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.settings ? { settings: parsed.data.settings } : {}),
      ...(user.companyId ? { companyId: user.companyId } : {}),
      ownerId: user.userId,
    });

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/projects]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const body = await request.json();
    const parsed = parseBody(UpdateProjectSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { id, ...updates } = parsed.data;
    const updated = await import('@/lib/projects').then((m) => m.updateProject(id, updates));
    if (!updated) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (updated.companyId && user.companyId && updated.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[PATCH /api/projects]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
