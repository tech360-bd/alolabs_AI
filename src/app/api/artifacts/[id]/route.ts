import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getArtifact, deleteArtifact, createArtifactVersion, verifyChecksum } from '@/lib/artifacts';

/**
 * /api/artifacts/:id — get, version, or delete an artifact.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;
    const artifact = await getArtifact(id);
    if (!artifact) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    if (artifact.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({
      success: true,
      data: { ...artifact, checksumValid: verifyChecksum(artifact) },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/artifacts/:id]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;
    const existing = await getArtifact(id);
    if (!existing) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    if (existing.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === 'string' ? body.content : '';
    const artifact = await createArtifactVersion(id, content, {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(body.metadata && typeof body.metadata === 'object' ? { metadata: body.metadata as Record<string, unknown> } : {}),
    });
    return NextResponse.json({ success: true, data: artifact }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[POST /api/artifacts/:id]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return NextResponse.json({ error: 'Company context required' }, { status: 403 });
    const { id } = await params;
    const existing = await getArtifact(id);
    if (!existing) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    if (existing.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await deleteArtifact(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[DELETE /api/artifacts/:id]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
