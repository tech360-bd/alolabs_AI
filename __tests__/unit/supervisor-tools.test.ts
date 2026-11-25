// @vitest-environment node
/**
 * Supervisor tools — the ONLY mutation path of the Command Agent.
 *
 * Verified here:
 *  - the gate: non-super_admin roles are refused before any tool runs;
 *  - confirmation: mutation tools without {"confirm": "confirm"} are refused;
 *  - set_primary_ai_provider: target becomes priority 10 + enabled, others
 *    demoted to standby (100); AuditEvent carries before → after;
 *  - set_site_content: upsert with version increment, JSON-object payload
 *    enforced;
 *  - run_self_healing_recovery: the engine verdict is passed through
 *    verbatim — a 'failed' recovery surfaces as ok:false, never as success.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb } from '../helpers/fake-db';

vi.mock('@/lib/db', () => ({ db: fakeDb.db }));

const auditMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/audit-events', () => ({
  writeAuditEvent: (...args: unknown[]) => auditMock(...args),
}));

vi.mock('@/lib/self-healing/site-doctor', () => ({
  runSiteDoctor: vi.fn(async () => ({
    startedAt: '2026-11-25T00:00:00.000Z',
    finishedAt: '2026-11-25T00:00:01.000Z',
    targets: ['https://www.alolabs.net'],
    results: [{ target: 'https://www.alolabs.net', status: 'healthy', httpStatus: 200, latencyMs: 90, detail: 'OK', attempt: 1, escalated: false }],
  })),
}));

const recoverMock = vi.fn();
vi.mock('@/lib/self-healing', () => ({
  getSelfHealingEngine: () => ({ recover: (...args: unknown[]) => recoverMock(...args) }),
}));

import { executeSupervisorTool, type SupervisorActor } from '@/lib/command-agent/supervisor-tools';

const superAdmin: SupervisorActor = { userId: 'user-1', role: 'super_admin', companyId: 'company-1' };
const plainAdmin: SupervisorActor = { userId: 'user-2', role: 'admin', companyId: 'company-1' };

function seedProviders() {
  fakeDb.db.aIProviderConfig.create({
    data: { id: 'prov-target', provider: 'groq', name: 'Groq primary', isEnabled: false, priority: 50 },
  });
  fakeDb.db.aIProviderConfig.create({
    data: { id: 'prov-other', provider: 'openrouter', name: 'OpenRouter :free', isEnabled: true, priority: 20 },
  });
}

beforeEach(() => {
  fakeDb.reset();
  auditMock.mockClear();
  recoverMock.mockReset();
});

describe('supervisor tool gate', () => {
  it('refuses non-super_admin actors before touching anything', async () => {
    seedProviders();
    const result = await executeSupervisorTool(plainAdmin, 'set_ai_provider_enabled', {
      providerId: 'prov-target', enabled: false, confirm: 'confirm',
    });
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/super_admin/i);
    expect(fakeDb.rows('aIProviderConfig').find((r) => r.id === 'prov-target')?.priority).toBe(50); // untouched
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('refuses mutation without the confirmation argument', async () => {
    seedProviders();
    const result = await executeSupervisorTool(superAdmin, 'set_ai_provider_enabled', {
      providerId: 'prov-target', enabled: false,
    });
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/confirm/i);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('rejects unknown tool names instead of guessing', async () => {
    const result = await executeSupervisorTool(superAdmin, 'drop_database', { confirm: 'confirm' });
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/unknown supervisor tool/i);
  });
});

describe('omni-routing switch', () => {
  it('makes the target the primary (priority 10) and demotes the rest to standby', async () => {
    seedProviders();
    const result = await executeSupervisorTool(superAdmin, 'set_primary_ai_provider', {
      providerId: 'prov-target', makePrimary: true, confirm: 'confirm',
    });
    expect(result.ok).toBe(true);
    const target = fakeDb.rows('aIProviderConfig').find((r) => r.id === 'prov-target');
    const other = fakeDb.rows('aIProviderConfig').find((r) => r.id === 'prov-other');
    expect(target?.priority).toBe(10);
    expect(target?.isEnabled).toBe(true);
    expect(other?.priority).toBe(100);
    expect(other?.isEnabled).toBe(true); // standby, not off

    expect(auditMock).toHaveBeenCalledTimes(1);
    const event = auditMock.mock.calls[0][0] as { action: string; details: Record<string, unknown> };
    expect(event.action).toBe('supervisor.set_primary_ai_provider');
    expect(event.details.before).toMatchObject({ priority: 50, isEnabled: false });
    expect(event.details.after).toMatchObject({ priority: 10, isEnabled: true });
  });

  it('disabling a provider records the change and takes it out of routing', async () => {
    seedProviders();
    const result = await executeSupervisorTool(superAdmin, 'set_ai_provider_enabled', {
      providerId: 'prov-other', enabled: false, confirm: 'confirm',
    });
    expect(result.ok).toBe(true);
    expect(fakeDb.rows('aIProviderConfig').find((r) => r.id === 'prov-other')?.isEnabled).toBe(false);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });
});

describe('website content blocks', () => {
  it('upserts a versioned block and audits before → after', async () => {
    const first = await executeSupervisorTool(superAdmin, 'set_site_content', {
      page: 'home', blockKey: 'announcement',
      content: { enabled: true, text: 'Maintenance Sunday 02:00–04:00 UTC' },
      confirm: 'confirm',
    });
    expect(first.ok).toBe(true);
    let row = fakeDb.rows('siteContentBlock')[0];
    expect(row.version).toBe(1);
    expect(JSON.parse(row.content)).toMatchObject({ enabled: true });

    const second = await executeSupervisorTool(superAdmin, 'set_site_content', {
      page: 'home', blockKey: 'announcement',
      content: { enabled: true, text: 'Updated text' },
      confirm: 'confirm',
    });
    expect(second.ok).toBe(true);
    row = fakeDb.rows('siteContentBlock')[0];
    expect(row.version).toBe(2);
    expect(fakeDb.rows('siteContentBlock').length).toBe(1); // upsert, not duplicate
  });

  it('refuses a non-object payload instead of storing raw text', async () => {
    const result = await executeSupervisorTool(superAdmin, 'set_site_content', {
      page: 'home', blockKey: 'announcement', content: 'just text', confirm: 'confirm',
    });
    expect(result.ok).toBe(false);
    expect(fakeDb.rows('siteContentBlock').length).toBe(0);
  });
});

describe('self-healing passthrough', () => {
  it('reports a failed recovery as failed — verdict verbatim', async () => {
    recoverMock.mockResolvedValue({ id: 'recovery_1', targetId: 'agent-9', targetType: 'agent', strategy: 'restart', status: 'failed', attemptNumber: 1, maxAttempts: 3 });
    const result = await executeSupervisorTool(superAdmin, 'run_self_healing_recovery', {
      targetId: 'agent-9', targetType: 'agent',
    });
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/status: failed/i);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it('validates targetType before calling the engine', async () => {
    const result = await executeSupervisorTool(superAdmin, 'run_self_healing_recovery', {
      targetId: 'x', targetType: 'database-cluster',
    });
    expect(result.ok).toBe(false);
    expect(recoverMock).not.toHaveBeenCalled();
  });
});
