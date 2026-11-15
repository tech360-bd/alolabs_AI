/**
 * AI request idempotency
 * ALO Labs AgentOS — prevents a single AI task from executing twice.
 *
 * WHY THIS EXISTS
 * ---------------
 * Provider failover, client retries, browser double-submits and queue
 * redelivery can all cause the same logical AI call to reach the platform more
 * than once. Executing it twice would double-charge quotas, duplicate side
 * effects on tool-using agents, and corrupt usage metrics.
 *
 * The existing `IdempotencyKey` model (scope: taskId) covers task submission,
 * and `QueueItem.idempotencyKey` covers durable queue delivery. Neither covers
 * a direct AI call (`executeCompanyAIChat`). This module adds that coverage
 * WITHOUT a schema change by using the existing `ModelUsageRecord` table:
 *
 *   - the caller supplies an idempotency key (server-generated, e.g. derived
 *     from runId + agentId + step, or explicitly passed by an internal caller);
 *   - the key is stored on `ModelUsageRecord.correlationId` for the FIRST
 *     attempt of that logical call;
 *   - a second call with the same tenant + key finds the first record and is
 *     refused before any provider request starts.
 *
 * IMPORTANT: failover *within* one logical call must reuse the same
 * correlationId — that is exactly how one call fans out across providers while
 * still being a single execution. Only a *separate* call with the same key is
 * refused.
 *
 * Failover itself never re-executes a completed attempt: the service loop stops
 * at the first success and re-throws after the last eligible candidate.
 */

import { db } from '@/lib/db';

export interface AIIdempotencyRequest {
  companyId: string;
  /** Caller-supplied key identifying the logical AI call (not the attempt). */
  idempotencyKey: string;
  /** Requested profile, recorded for diagnostics. */
  profile: string;
}

export interface AIIdempotencyReservation {
  /** True when this call created the reservation (it may proceed). */
  acquired: boolean;
  /** Id of the pre-existing record when the key was already used. */
  existingRecordId?: string;
  /** Status of the pre-existing record: success | running | failure | deferred | blocked. */
  existingStatus?: string;
  /** Prior successful response tokens, when the key completed successfully. */
  existingTotalTokens?: number;
}

/**
 * Atomically reserve an idempotency key for an AI call.
 *
 * Returns `acquired: false` when the key was already reserved by an earlier
 * call for the same tenant. The caller must then refuse to start a provider
 * request (it may still return the previous result, which is the caller's
 * decision — this module never fabricates a response).
 */
export async function reserveAIIdempotencyKey(
  request: AIIdempotencyRequest,
): Promise<AIIdempotencyReservation> {
  const key = request.idempotencyKey.trim();
  if (key === '') throw new Error('idempotencyKey must not be empty');

  // A record in a *terminal, non-successful* state does not block a deliberate
  // retry: operators must be able to re-run a deferred or failed task. Only an
  // in-flight or already-succeeded execution refuses a duplicate.
  const existing = await db.modelUsageRecord.findFirst({
    where: {
      companyId: request.companyId,
      correlationId: key,
      status: { in: ['running', 'success'] },
    },
    select: { id: true, status: true, totalTokens: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) {
    return {
      acquired: false,
      existingRecordId: existing.id,
      existingStatus: existing.status,
      existingTotalTokens: existing.totalTokens,
    };
  }

  // Create the reservation row. A concurrent caller may win the race; because
  // `correlationId` is not unique at the DB level (attempts share it), the
  // re-read below resolves the race deterministically.
  const row = await db.modelUsageRecord.create({
    data: {
      requestId: key,
      correlationId: key,
      companyId: request.companyId,
      profile: request.profile,
      status: 'running',
      usageSource: 'unknown',
    },
    select: { id: true },
  });

  const winner = await db.modelUsageRecord.findFirst({
    where: { companyId: request.companyId, correlationId: key, status: { in: ['running', 'success'] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (winner && winner.id !== row.id) {
    // Another call reserved first: release ours and refuse.
    await db.modelUsageRecord.delete({ where: { id: row.id } }).catch(() => undefined);
    return { acquired: false, existingRecordId: winner.id, existingStatus: 'running' };
  }
  return { acquired: true, existingRecordId: row.id };
}

/**
 * Release a reservation that never reached a provider (e.g. routing was
 * deferred before any attempt). Keeps the audit trail by marking the row
 * `deferred` rather than deleting it.
 */
export async function releaseAIIdempotencyKey(
  recordId: string,
  finalStatus: 'deferred' | 'blocked' | 'failure' = 'deferred',
): Promise<void> {
  await db.modelUsageRecord
    .update({
      where: { id: recordId },
      data: { status: finalStatus, completedAt: new Date() },
    })
    .catch(() => undefined);
}
