/**
 * Site Doctor — internet-facing self-healing.
 *
 * The Command Agent / SelfHealingEngine recover *internal* agents; the site
 * doctor watches what the outside world sees: the public website and any
 * other configured public target. A cycle:
 *
 *   1. PROBE   — real HTTP GET with a hard timeout against each target.
 *   2. CLASSIFY— healthy (2xx), degraded (3xx/4xx or latency > SLOW_MS),
 *                unreachable (5xx, network error, timeout).
 *   3. REPAIR  — one automatic retry with backoff (recorded as attempt = 2).
 *   4. PERSIST — every attempt is written to SiteDoctorProbe (immutable).
 *   5. ESCALATE— repeated failure (≥ 2 unhealthy attempts in history) flips
 *                `escalated` on the probe and writes an AuditEvent. No repair
 *                is ever reported as done when it did not happen.
 *
 * Targets come from SITE_DOCTOR_TARGETS (comma-separated URLs). Default:
 * NEXT_PUBLIC_SITE_URL (or http://localhost:3011 in development). Empty
 * target list = an honest "no targets configured" report, not a fake pass.
 */

import { db } from '@/lib/db';
import { writeAuditEvent } from '@/lib/audit-events';

const PROBE_TIMEOUT_MS = 10_000;
const SLOW_MS = 3_000;
const REPAIR_BACKOFF_MS = 1_500;
const USER_AGENT = 'ALOLabs-SiteDoctor/1.0 (+https://www.alolabs.net)';

export type ProbeStatus = 'healthy' | 'degraded' | 'unreachable';

export interface ProbeResult {
  target: string;
  status: ProbeStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  detail: string;
  /** Attempt 1 = first probe, 2 = automatic repair retry. */
  attempt: number;
  escalated: boolean;
}

export interface SiteDoctorReport {
  startedAt: string;
  finishedAt: string;
  targets: string[];
  results: ProbeResult[];
}

function configuredTargets(): string[] {
  const raw = process.env.SITE_DOCTOR_TARGETS?.trim();
  if (raw) {
    return raw.split(',').map((t) => t.trim()).filter((t) => /^https?:\/\//i.test(t)).slice(0, 5);
  }
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.NODE_ENV === 'production' ? 'https://www.alolabs.net' : 'http://localhost:3011');
  return [base.replace(/\/+$/, '')];
}

async function probeOnce(target: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
      cache: 'no-store',
    });
    const latencyMs = Date.now() - startedAt;
    const status: ProbeStatus =
      response.status >= 500 ? 'unreachable' :
      response.status >= 300 || latencyMs > SLOW_MS ? 'degraded' : 'healthy';
    return {
      target,
      status,
      httpStatus: response.status,
      latencyMs,
      detail: status === 'healthy' ? 'OK' : status === 'degraded'
        ? `HTTP ${response.status}${latencyMs > SLOW_MS ? `, slow (${latencyMs}ms)` : ''}`
        : `HTTP ${response.status} server error`,
      attempt: 1,
      escalated: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      target,
      status: 'unreachable',
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      detail: message === 'This operation was aborted' ? `Timeout after ${PROBE_TIMEOUT_MS}ms` : message,
      attempt: 1,
      escalated: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function persistProbe(result: ProbeResult): Promise<void> {
  await db.siteDoctorProbe.create({
    data: {
      target: result.target.slice(0, 500),
      status: result.status,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
      detail: result.detail.slice(0, 2_000),
      attempt: result.attempt,
      escalated: result.escalated,
    },
  });
}

async function hadRecentFailure(target: string): Promise<boolean> {
  const previous = await db.siteDoctorProbe.findMany({
    where: { target, status: { in: ['degraded', 'unreachable'] } },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  return previous.length > 0;
}

/** Run one probe + repair cycle over the given (or configured) targets. */
export async function runSiteDoctor(options: {
  targets?: string[];
  actorUserId?: string;
} = {}): Promise<SiteDoctorReport> {
  const targets = options.targets?.length ? options.targets : configuredTargets();
  const results: ProbeResult[] = [];
  const startedAt = new Date();

  for (const target of targets) {
    const first = await probeOnce(target);
    // Escalation is judged against history BEFORE this cycle is persisted —
    // otherwise every first-time failure would immediately look "repeated".
    const repeat = first.status !== 'healthy' ? await hadRecentFailure(target) : false;
    await persistProbe(first);
    let final = first;

    if (first.status !== 'healthy') {
      // Repair attempt: one automatic retry after a short backoff, recorded
      // as attempt = 2. The verdict stays whatever the retry really produced.
      await new Promise((resolve) => setTimeout(resolve, REPAIR_BACKOFF_MS));
      const retry = await probeOnce(target);
      retry.attempt = 2;
      if (retry.status !== 'healthy' && repeat) {
        retry.escalated = true;
        await writeAuditEvent({
          actorUserId: options.actorUserId ?? null,
          action: 'site_doctor.escalated',
          resource: 'site-target',
          resourceId: target,
          details: {
            firstStatus: first.status,
            retryStatus: retry.status,
            detail: retry.detail,
          },
        });
      }
      await persistProbe(retry);
      final = retry;
    }

    results.push(final);
  }

  const finishedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    targets,
    results,
  };
}

/** Latest recorded probe per target + aggregate counts (operator view). */
export async function getSiteDoctorStatus(): Promise<{
  targets: Array<{ target: string; lastStatus: ProbeStatus | 'unknown'; lastAt: string | null; lastDetail: string | null }>;
  totals: { healthy: number; degraded: number; unreachable: number; escalated: number };
}> {
  const targets = configuredTargets();
  const perTarget: Array<{ target: string; lastStatus: ProbeStatus | 'unknown'; lastAt: string | null; lastDetail: string | null }> = await Promise.all(targets.map(async (target: string) => {
    const last = await db.siteDoctorProbe.findFirst({
      where: { target },
      orderBy: { createdAt: 'desc' },
    });
    return {
      target,
      lastStatus: (last?.status as ProbeStatus | undefined) ?? 'unknown',
      lastAt: last?.createdAt ? new Date(last.createdAt).toISOString() : null,
      lastDetail: last?.detail ?? null,
    };
  }));
  const totals = {
    healthy: await db.siteDoctorProbe.count({ where: { status: 'healthy' } }),
    degraded: await db.siteDoctorProbe.count({ where: { status: 'degraded' } }),
    unreachable: await db.siteDoctorProbe.count({ where: { status: 'unreachable' } }),
    escalated: await db.siteDoctorProbe.count({ where: { escalated: true } }),
  };
  return { targets: perTarget, totals };
}
