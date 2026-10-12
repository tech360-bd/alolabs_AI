/**
 * Session Cleanup — P5
 * ALO Labs AISMH
 *
 * Background cleanup job for expired sessions.
 * Can be called from a cron job or triggered manually via API.
 */

import { cleanupExpiredSessions } from './session-manager';

/**
 * Run session cleanup. Returns the number of cleaned sessions.
 */
export async function runSessionCleanup(): Promise<{ cleaned: number }> {
  const cleaned = await cleanupExpiredSessions();
  return { cleaned };
}
