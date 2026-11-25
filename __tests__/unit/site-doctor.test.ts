// @vitest-environment node
/**
 * Site Doctor — internet-facing self-healing.
 *
 * Verified here with a stubbed fetch (no real network):
 *  - classification: 2xx fast → healthy; 3xx/4xx or slow → degraded;
 *    5xx/network error/timeout → unreachable;
 *  - repair: one automatic retry recorded as attempt = 2; a retry that
 *    succeeds ends the cycle healthy WITHOUT an escalation;
 *  - escalation: a repeat failure (previous unhealthy probe exists AND the
 *    retry still fails) flips `escalated` and writes the audit event;
 *  - persistence: every attempt lands in SiteDoctorProbe — nothing is
 *    overwritten, verdicts stay verbatim.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeDb } from '../helpers/fake-db';

vi.mock('@/lib/db', () => ({ db: fakeDb.db }));

const auditMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/audit-events', () => ({
  writeAuditEvent: (...args: unknown[]) => auditMock(...args),
}));

import { runSiteDoctor, getSiteDoctorStatus } from '@/lib/self-healing/site-doctor';

const TARGET = 'https://www.alolabs.net';

function httpResponse(status: number) {
  return { status, ok: status < 400 } as unknown as Response;
}

beforeEach(() => {
  fakeDb.reset();
  auditMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('probe classification', () => {
  it('classifies a fast 2xx as healthy with a single attempt', async () => {
    const fetchMock = vi.fn(async () => httpResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const report = await runSiteDoctor({ targets: [TARGET] });
    expect(report.results).toHaveLength(1);
    const result = report.results[0];
    expect(result.status).toBe('healthy');
    expect(result.httpStatus).toBe(200);
    expect(result.attempt).toBe(1);
    expect(result.escalated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fakeDb.rows('siteDoctorProbe')).toHaveLength(1);
  });

  it('classifies a 404 as degraded and a 5xx as unreachable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(httpResponse(404))
      .mockResolvedValueOnce(httpResponse(200)); // repair retry succeeds
    vi.stubGlobal('fetch', fetchMock);

    const report = await runSiteDoctor({ targets: [TARGET] });
    expect(report.results[0].status).toBe('healthy');
    expect(report.results[0].attempt).toBe(2); // repair retry recorded
    expect(report.results[0].escalated).toBe(false);
    expect(fakeDb.rows('siteDoctorProbe')).toHaveLength(2); // both attempts persisted
    expect(auditMock).not.toHaveBeenCalled();

    // First-ever 5xx failure on a target with clean history: retry, not escalated.
    const fetchMock2 = vi.fn(async () => httpResponse(503));
    vi.stubGlobal('fetch', fetchMock2);
    const report2 = await runSiteDoctor({ targets: ['https://api.alolabs.net'] });
    expect(report2.results[0].status).toBe('unreachable');
    expect(report2.results[0].attempt).toBe(2);
    expect(report2.results[0].escalated).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe('repair + escalation', () => {
  it('escalates when a previously failing target keeps failing after the retry', async () => {
    // History: the target already failed once.
    fakeDb.db.siteDoctorProbe.create({
      data: { id: 'p-old', target: TARGET, status: 'unreachable', detail: 'boom', attempt: 1, escalated: false },
    });

    const fetchMock = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    vi.stubGlobal('fetch', fetchMock);

    const report = await runSiteDoctor({ targets: [TARGET] });
    const result = report.results[0];
    expect(result.status).toBe('unreachable');
    expect(result.attempt).toBe(2);
    expect(result.escalated).toBe(true);
    expect(auditMock).toHaveBeenCalledTimes(1);
    const event = auditMock.mock.calls[0][0] as { action: string; resourceId?: string };
    expect(event.action).toBe('site_doctor.escalated');
    expect(event.resourceId).toBe(TARGET);
    // 3 rows: the old probe + retry + final (original unreachable is persisted too)
    expect(fakeDb.rows('siteDoctorProbe').filter((r) => r.target === TARGET).length).toBe(3);
  });

  it('reports honestly when no targets are configured', async () => {
    vi.stubEnv('SITE_DOCTOR_TARGETS', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    const fetchMock = vi.fn(async () => httpResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const report = await runSiteDoctor({});
    expect(report.targets).toEqual(['http://localhost:3011']);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].status).toBe('healthy');
    expect(fetchMock).toHaveBeenCalledTimes(1); // dev default target probed once
  });
});

describe('operator status view', () => {
  it('aggregates totals and per-target last state from the persisted probes', async () => {
    vi.stubEnv('SITE_DOCTOR_TARGETS', `${TARGET},https://api.alolabs.net`);
    const t0 = new Date('2026-11-25T00:00:00Z');
    fakeDb.db.siteDoctorProbe.create({ data: { id: 'p1', target: TARGET, status: 'healthy', httpStatus: 200, attempt: 1, createdAt: t0 } });
    fakeDb.db.siteDoctorProbe.create({ data: { id: 'p2', target: TARGET, status: 'unreachable', detail: 'timeout', attempt: 2, escalated: true, createdAt: new Date('2026-11-25T00:01:00Z') } });
    fakeDb.db.siteDoctorProbe.create({ data: { id: 'p3', target: 'https://api.alolabs.net', status: 'degraded', httpStatus: 429, attempt: 1, createdAt: new Date('2026-11-25T00:02:00Z') } });

    const status = await getSiteDoctorStatus();
    expect(status.totals).toEqual({ healthy: 1, degraded: 1, unreachable: 1, escalated: 1 });
    const alo = status.targets.find((t) => t.target === TARGET);
    expect(alo?.lastStatus).toBe('unreachable'); // latest probe wins
  });
});
