import { describe, expect, it } from 'vitest';
import { agentCompanyScope } from '@/lib/agent-access';

describe('agentCompanyScope', () => {
  it('includes agents owned by the requested tenant without requiring a share row', () => {
    expect(agentCompanyScope('company-a', 'execute').OR[0]).toEqual({ companyId: 'company-a' });
  });

  it('requires explicit executable sharing for agents owned by another tenant', () => {
    expect(agentCompanyScope('company-a', 'execute').OR[1]).toEqual({
      agentCompanyAccess: {
        some: {
          companyId: 'company-a',
          accessLevel: { in: ['execute', 'full'] },
        },
      },
    });
  });

  it('allows read-only grants only in view scope, never execution scope', () => {
    const viewScope = agentCompanyScope('company-a', 'view');
    const executionScope = agentCompanyScope('company-a', 'execute');

    expect(viewScope.OR[1]).toEqual({
      agentCompanyAccess: {
        some: {
          companyId: 'company-a',
          accessLevel: { in: ['read', 'write', 'execute', 'full'] },
        },
      },
    });
    expect(executionScope.OR[1]).toEqual({
      agentCompanyAccess: {
        some: {
          companyId: 'company-a',
          accessLevel: { in: ['execute', 'full'] },
        },
      },
    });
  });

  it('keeps every scope tied to the exact tenant ID', () => {
    const companyAScope = agentCompanyScope('company-a', 'execute');
    const companyBScope = agentCompanyScope('company-b', 'execute');

    expect(companyAScope).not.toEqual(companyBScope);
    expect(JSON.stringify(companyAScope)).not.toContain('company-b');
  });
});
