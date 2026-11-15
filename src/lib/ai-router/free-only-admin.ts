/**
 * FREE-ONLY operating mode — Super Admin control plane.
 *
 * Persists the administrator's runtime override for the global FREE-ONLY
 * mode (see model-tiers.ts `freeOnlyModeEnabled` and router
 * `setFreeOnlyMode`) in the Settings table so it survives process restarts,
 * and records every change in the AuditEvent ledger.
 *
 * Fail-closed rules:
 * - A missing Settings row means "no override" — the environment flag decides.
 * - If persistence fails, the in-memory mode is left UNCHANGED (a disable
 *   that cannot be persisted keeps the mode ENABLED).
 * - Reading an invalid stored value is treated as "no override" (defer to
 *   the environment) and surfaced in the status so the disagreement is
 *   visible to the administrator.
 */

import { db } from '../db';
import { writeAuditEvent } from '../audit-events';
import { freeOnlyModeEnabled } from './model-tiers';
import type { AIRouter } from './router';

export const FREE_ONLY_SETTINGS_KEY = 'ai_router_free_only_mode';

export type FreeOnlySource = 'runtime_override' | 'environment' | 'default_off';

export interface FreeOnlyStatus {
  /** Global mode currently in force for routing decisions. */
  effective: boolean;
  source: FreeOnlySource;
  /** Raw stored override ('true' | 'false'), null when unset, 'invalid' when unreadable. */
  storedOverride: 'true' | 'false' | 'invalid' | null;
  /** What the deployment environment asks for. */
  environmentEnabled: boolean;
  /** True when the stored value disagrees with the environment setting. */
  configurationDisagreement: boolean;
}

async function readStoredOverride(): Promise<'true' | 'false' | 'invalid' | null> {
  const row = await db.settings.findUnique({ where: { key: FREE_ONLY_SETTINGS_KEY } });
  if (!row) return null;
  if (row.value === 'true') return 'true';
  if (row.value === 'false') return 'false';
  return 'invalid';
}

export async function getFreeOnlyStatus(): Promise<FreeOnlyStatus> {
  const stored = await readStoredOverride();
  const environmentEnabled = freeOnlyModeEnabled();
  const effective = stored === 'true' ? true : stored === 'false' ? false : environmentEnabled;
  const source: FreeOnlySource =
    stored === 'true' || stored === 'false'
      ? 'runtime_override'
      : environmentEnabled
        ? 'environment'
        : 'default_off';
  return {
    effective,
    source,
    storedOverride: stored,
    environmentEnabled,
    configurationDisagreement:
      (stored === 'true' && !environmentEnabled) || (stored === 'false' && environmentEnabled),
  };
}

/**
 * Apply the persisted override (if any) to a router instance. Used at sync
 * time so the mode survives restarts. Never disables the mode on read or
 * persistence errors — failure keeps whatever is currently in force.
 */
export async function applyPersistedFreeOnlyMode(router: AIRouter): Promise<void> {
  try {
    const stored = await readStoredOverride();
    router.setFreeOnlyMode(stored === 'true' ? true : stored === 'false' ? false : null);
  } catch {
    // Fail closed: leave the router's current mode untouched.
  }
}

export interface FreeOnlyChangeResult {
  status: FreeOnlyStatus;
}

export class FreeOnlyAdminError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = 'FREE_ONLY_ERROR',
  ) {
    super(message);
  }
}

/**
 * Enable or disable the global FREE-ONLY mode. Requires a Super Admin actor;
 * disabling additionally requires `confirm: true` so the global billing gate
 * cannot be opened accidentally.
 */
export async function setFreeOnlyMode(
  actor: { userId: string },
  enabled: boolean,
  options: { confirm?: boolean } = {},
): Promise<FreeOnlyChangeResult> {
  if (!enabled && options.confirm !== true) {
    throw new FreeOnlyAdminError(
      'Disabling FREE-ONLY re-opens paid provider routing and requires explicit confirmation (confirm: true).',
      400,
      'CONFIRMATION_REQUIRED',
    );
  }

  const previous = await getFreeOnlyStatus();

  // No-op: the stored value already matches. Re-apply the mode to the
  // in-memory router (covers a process restart) but skip persistence and
  // the audit ledger — a non-change is not an auditable change.
  if (previous.storedOverride === (enabled ? 'true' : 'false')) {
    const { aiRouter } = await import('./index');
    applyPersistedFreeOnlyModeToRouter(aiRouter, enabled);
    return { status: previous };
  }

  // Persist FIRST. If this fails the in-memory mode is left unchanged
  // (fail-closed for disable; enable simply does not take effect).
  await db.settings.upsert({
    where: { key: FREE_ONLY_SETTINGS_KEY },
    create: { key: FREE_ONLY_SETTINGS_KEY, value: enabled ? 'true' : 'false', type: 'boolean' },
    update: { value: enabled ? 'true' : 'false', type: 'boolean' },
  });

  const { aiRouter } = await import('./index');
  applyPersistedFreeOnlyModeToRouter(aiRouter, enabled);

  const status = await getFreeOnlyStatus();

  await writeAuditEvent({
    actorUserId: actor.userId,
    action: 'ai.free_only_mode_change',
    resource: 'ai-router/free-only',
    resourceId: FREE_ONLY_SETTINGS_KEY,
    details: {
      previous: previous.effective,
      previousSource: previous.source,
      next: status.effective,
      nextSource: status.source,
      environmentEnabled: status.environmentEnabled,
    },
  });

  return { status };
}

/** Direct, non-failing application for an already-known override value. */
function applyPersistedFreeOnlyModeToRouter(router: AIRouter, enabled: boolean): void {
  router.setFreeOnlyMode(enabled);
}

const AUDIT_ACTION = 'ai.free_only_mode_change';

/** Recent audit history for the Super Admin status view. */
export async function listFreeOnlyAudit(limit = 20) {
  const events = await db.auditEvent.findMany({
    where: { action: AUDIT_ACTION },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return events.map((event) => ({
    id: event.id,
    actorUserId: event.actorUserId,
    createdAt: event.createdAt.toISOString(),
    details: event.details,
  }));
}
