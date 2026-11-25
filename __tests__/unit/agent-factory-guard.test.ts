/**
 * Dynamic agent creation guard.
 *
 * Before this guard existed, `POST /api/enterprise/agent-factory/create`
 * accepted any authenticated session and let it choose arbitrary tools and
 * permission resources, creating an agent row with `companyId: null`.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/agent-runtime/pipeline', () => ({ retrieveRelevantKnowledge: vi.fn() }));

const { validateAgentFactoryScope, MAX_TEMPORARY_AGENT_MINUTES } = await import(
  '@/lib/multi-agent-orchestrator/agent-factory-guard'
);

const base = {
  companyRole: 'owner' as string | null,
  platformRole: 'user' as string | null,
  callerCompanyId: 'company-a' as string | null,
  departmentCompanyId: 'company-a' as string | null,
  requestedTools: ['search_knowledge'],
  requestedSkills: ['web-research'],
  requestedPermissions: ['search_knowledge'],
  expirationMinutes: 120,
  budgetLimit: 10,
};

describe('validateAgentFactoryScope', () => {
  it('allows an organisation owner to create a bounded temporary agent', () => {
    const result = validateAgentFactoryScope(base);
    expect(result.ok).toBe(true);
  });

  it('denies a standard user even inside their own company', () => {
    const result = validateAgentFactoryScope({ ...base, companyRole: 'member' });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/owner, admin or manager/);
  });

  it('denies a caller with no organisation context', () => {
    const result = validateAgentFactoryScope({ ...base, callerCompanyId: null, companyRole: null });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/organisation context/);
  });

  it('denies a department owned by another organisation', () => {
    const result = validateAgentFactoryScope({ ...base, departmentCompanyId: 'company-b' });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/different organisation/);
  });

  it('denies unregistered tools', () => {
    const result = validateAgentFactoryScope({ ...base, requestedTools: ['search_knowledge', 'send_wire_transfer'] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Unknown tools/);
  });

  it('denies permission resources that are not registered tools', () => {
    const result = validateAgentFactoryScope({ ...base, requestedPermissions: ['super_admin'] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Unknown permission resources/);
  });

  it('caps temporary agent lifetime at 24 hours', () => {
    const result = validateAgentFactoryScope({ ...base, expirationMinutes: MAX_TEMPORARY_AGENT_MINUTES + 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects a budget outside the allowed range', () => {
    expect(validateAgentFactoryScope({ ...base, budgetLimit: -1 }).ok).toBe(false);
    expect(validateAgentFactoryScope({ ...base, budgetLimit: 5000 }).ok).toBe(false);
  });

  it('allows a platform admin to operate across departments', () => {
    const result = validateAgentFactoryScope({
      ...base,
      platformRole: 'super_admin',
      companyRole: null,
      departmentCompanyId: 'company-z',
    });
    expect(result.ok).toBe(true);
  });
});
