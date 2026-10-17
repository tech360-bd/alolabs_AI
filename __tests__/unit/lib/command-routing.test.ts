import { describe, it, expect } from 'vitest';
import { matchWorkflow, parseTriggers } from '@/lib/command-routing';

const academic = { id: 'wf-a', name: 'Academic AI', triggers: JSON.stringify(['study', 'quiz']) };
const education = { id: 'wf-e', name: 'Education Agency', triggers: JSON.stringify(['study abroad', 'visa']) };
const crm = { id: 'wf-c', name: 'CRM SaaS Builder', triggers: JSON.stringify(['build crm', 'crm saas']) };
const tech = { id: 'wf-t', name: 'Technology Agency', triggers: JSON.stringify(['SaaS', 'build software']) };

describe('parseTriggers', () => {
  it('accepts arrays and JSON strings', () => {
    expect(parseTriggers(['a', 1, 'b'])).toEqual(['a', 'b']);
    expect(parseTriggers('["x","y"]')).toEqual(['x', 'y']);
  });

  it('returns an empty list for malformed input', () => {
    expect(parseTriggers('not json')).toEqual([]);
    expect(parseTriggers(null)).toEqual([]);
    expect(parseTriggers(undefined)).toEqual([]);
    expect(parseTriggers('{"a":1}')).toEqual([]);
  });
});

describe('matchWorkflow', () => {
  it('prefers the longest matching trigger', () => {
    const match = matchWorkflow('please help with study abroad applications', [academic, education]);
    expect(match?.workflowId).toBe('wf-e');
    expect(match?.trigger).toBe('study abroad');
  });

  it('is independent of candidate order', () => {
    const forward = matchWorkflow('study abroad', [academic, education]);
    const reverse = matchWorkflow('study abroad', [education, academic]);
    expect(forward).toEqual(reverse);
  });

  it('breaks ties on workflow name', () => {
    const a = { id: '1', name: 'Alpha', triggers: '["deploy app"]' };
    const b = { id: '2', name: 'Beta', triggers: '["deploy app"]' };
    expect(matchWorkflow('deploy app now', [b, a])?.workflowName).toBe('Alpha');
  });

  it('matches case-insensitively and resolves CRM vs SaaS', () => {
    expect(matchWorkflow('BUILD CRM NOW', [tech, crm])?.workflowId).toBe('wf-c');
    expect(matchWorkflow('we need saas billing', [tech, crm])?.workflowId).toBe('wf-t');
  });

  it('ignores empty triggers instead of matching everything', () => {
    const empty = { id: 'wf-x', name: 'Empty', triggers: '["", "   "]' };
    expect(matchWorkflow('anything at all', [empty])).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(matchWorkflow('unrelated command', [academic, education])).toBeNull();
    expect(matchWorkflow('', [academic])).toBeNull();
  });
});
