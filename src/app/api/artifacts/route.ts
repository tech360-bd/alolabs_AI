import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { parseBody, parseQuery, paginationQuery } from '@/lib/validators';
import { createArtifact, listArtifacts } from '@/lib/artifacts';

/**
 * /api/artifacts — Artifact system (final deliverables of runs/tasks).
 *
 * GET:  list artifacts (filter by projectId, taskId, runId, type)
 * POST: create an artifact (content is checksummed + versioned)
 */

const CreateArtifactSchema = z.object({
  name: z.string().trim().min(1).max(300),
  type: z.string().trim().min(1).max(50),
  content: z.string().max(5_000_000),
  projectId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const parsed = parseQuery(paginationQuery, new URL(request.url).searchParams);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const { page, limit } = parsed.data;
    const q = new URL(request.url).searchParams;
    const { artifacts, total } = await listArtifacts({
      ...(user.companyId ? { companyId: user.companyId } : {}),
      ...(q.get('projectId') ? { projectId: q.get('projectId')! } : {}),
      ...(q.get('taskId') ? { taskId: q.get('taskId')! } : {}),
      ...(q.get('runId') ? { runId: q.get('runId')! } : {}),
      ...(q.get('type') ? { type: q.get('type')! } : {}),
      limit,
      offset: (page - 1) * limit,
    });

    return NextResponse.json({
      data: artifacts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/artifacts]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const body = await request.json();
    const parsed = parseBody(CreateArtifactSchema, body);
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status });

    const artifact = await createArtifact({
      ...parsed.data,
      metadata: parsed.data.metadata ?? {},
      ...(user.companyId ? { companyId: user.companyId } : {}),
      createdBy: user.userId,
    });

    return NextResponse.json({ success: true, data: artifact }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/artifacts]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
