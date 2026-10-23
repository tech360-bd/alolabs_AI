import { describe, expect, it } from 'vitest';
import { AGENT_CAPABILITIES, getAgentCapability, listAgentCapabilities } from '../../src/lib/agent-capability-registry';

describe('agent capability registry', () => {
  it('uses unique ids and declares conservative evaluation evidence', () => {
    const ids = AGENT_CAPABILITIES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(AGENT_CAPABILITIES.every((item) => item.evaluation.score === null)).toBe(true);
  });

  it('supports category, status, and text discovery filters', () => {
    expect(listAgentCapabilities({ category: 'browser' }).map((item) => item.id)).toContain('agent.browser-automation');
    expect(listAgentCapabilities({ status: 'not_verified' }).every((item) => item.status === 'not_verified')).toBe(true);
    expect(listAgentCapabilities({ search: 'retrieval' }).map((item) => item.id)).toContain('agent.rag-memory');
  });

  it('does not expose unknown capabilities as executable', () => {
    expect(getAgentCapability('external.unknown')).toBeNull();
    expect(getAgentCapability('agent.browser-automation')?.status).toBe('not_verified');
  });
});
