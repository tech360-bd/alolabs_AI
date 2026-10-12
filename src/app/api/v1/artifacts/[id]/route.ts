import { v1Handler, V1Error } from '@/lib/v1';
import { getArtifact, deleteArtifact, verifyChecksum } from '@/lib/artifacts';

/**
 * /api/v1/artifacts/:id — get (GET) or delete (DELETE) an artifact.
 */

export const GET = v1Handler(async ({ identity }, request) => {
  const id = decodeURIComponent(request.nextUrl.pathname.split('/').pop()!);
  const artifact = await getArtifact(id);
  if (!artifact) throw new V1Error('Artifact not found', 404, 'NOT_FOUND');
  if (artifact.companyId !== identity.companyId) {
    throw new V1Error('Forbidden', 403, 'FORBIDDEN');
  }
  return { ...artifact, checksumValid: verifyChecksum(artifact) };
});

export const DELETE = v1Handler(async ({ identity }, request) => {
  const id = decodeURIComponent(request.nextUrl.pathname.split('/').pop()!);
  const artifact = await getArtifact(id);
  if (!artifact) throw new V1Error('Artifact not found', 404, 'NOT_FOUND');
  if (artifact.companyId !== identity.companyId) {
    throw new V1Error('Forbidden', 403, 'FORBIDDEN');
  }
  await deleteArtifact(id);
  return { deleted: true, id };
});
