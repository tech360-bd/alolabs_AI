import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getArtifact } from '@/lib/artifacts';

/**
 * /api/artifacts/:id/download — download the artifact content with the
 * correct MIME type and a checksum header.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.companyId) return new Response(JSON.stringify({ error: 'Company context required' }), { status: 403 });
    const { id } = await params;
    const artifact = await getArtifact(id);
    if (!artifact) {
      return new Response(JSON.stringify({ error: 'Artifact not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (artifact.companyId !== user.companyId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const safeName = artifact.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return new Response(artifact.content, {
      status: 200,
      headers: {
        'Content-Type': artifact.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'X-Artifact-Id': artifact.id,
        'X-Artifact-Version': String(artifact.version),
        'X-Artifact-Checksum': `sha256:${artifact.checksum}`,
        'X-Artifact-Size': String(artifact.size),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('[GET /api/artifacts/:id/download]', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
