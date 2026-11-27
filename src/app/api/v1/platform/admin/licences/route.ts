/**
 * GET /api/v1/platform/admin/licences
 *
 * Runs `scripts/licence-inventory.mjs` and returns its JSON. The script reads
 * the installed dependency tree and the real LICENSE file, so the panel shows
 * the result of an inspection rather than a copy of a document that can drift.
 *
 * The script is executed with `execFile` (no shell) and a hard timeout, and its
 * output is parsed — never evaluated. A failure to run it is reported as such,
 * not swallowed.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { platformRoute, json, PlatformError } from '@/lib/platform/http';
import { requirePlatformAdmin } from '@/lib/platform/admin';

const execFileAsync = promisify(execFile);

export const GET = platformRoute({}, async ({ request, requestId }) => {
  await requirePlatformAdmin(request);

  const script = path.join(process.cwd(), 'scripts', 'licence-inventory.mjs');
  try {
    const { stdout } = await execFileAsync(process.execPath, [script], {
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      cwd: process.cwd(),
    });
    return json(JSON.parse(stdout) as unknown, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PlatformError(
      503, 'unavailable',
      'Licence inventory could not be generated',
      `The script failed to run: ${message.slice(0, 300)}`,
    );
  }
});
