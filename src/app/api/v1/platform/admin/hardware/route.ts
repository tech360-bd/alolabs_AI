/**
 * GET /api/v1/platform/admin/hardware
 *
 * Measured host capability. This is what turns "you can run a 7B model" from a
 * marketing claim into a checkable statement: the response reports what was
 * detected, how it was detected, and what that implies.
 */

import { platformRoute, json } from '@/lib/platform/http';
import { requirePlatformAdmin } from '@/lib/platform/admin';
import { hardwareSnapshot } from '@/lib/platform/hardware';

export const GET = platformRoute({}, async ({ request, requestId }) => {
  await requirePlatformAdmin(request);
  return json({ hardware: hardwareSnapshot(), capturedAt: new Date().toISOString() }, requestId);
});
