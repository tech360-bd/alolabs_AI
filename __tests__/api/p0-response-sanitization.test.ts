import { describe, it, expect } from 'vitest';
import { sanitizePublic, publicTaskResponse, safePublicError, containsLeakyFields } from '@/lib/api/public-response';

/**
 * P0-C: Response sanitization layer — unit tests.
 *
 * Verifies that internal workforce identifiers, prompts, model names, tool
 * registry, orchestration traces, and secrets are never present in public
 * API responses.
 */

describe('sanitizePublic', () => {
  it('strips agent identifiers', () => {
    const input = { agentId: 'AGENT-0001', agentName: 'Lead Qualifier', status: 'ok' };
    const result = sanitizePublic(input);
    expect(result).not.toHaveProperty('agentId');
    expect(result).not.toHaveProperty('agentName');
    expect(result).toEqual({ status: 'ok' });
  });

  it('strips system prompts', () => {
    const input = { systemInstructions: 'You are a helpful assistant.', result: 'ok' };
    const result = sanitizePublic(input);
    expect(result).not.toHaveProperty('systemInstructions');
    expect(result).toEqual({ result: 'ok' });
  });

  it('strips model names and routing', () => {
    const input = { model: 'gpt-4', provider: 'openai', routingDecision: 'fallback', output: 'hello' };
    const result = sanitizePublic(input);
    expect(result).not.toHaveProperty('model');
    expect(result).not.toHaveProperty('provider');
    expect(result).not.toHaveProperty('routingDecision');
    expect(result).toEqual({ output: 'hello' });
  });

  it('strips orchestration traces', () => {
    const input = { runId: 'run_123', events: [], trace: 'step1->step2', status: 'completed' };
    const result = sanitizePublic(input);
    expect(result).not.toHaveProperty('runId');
    expect(result).not.toHaveProperty('events');
    expect(result).not.toHaveProperty('trace');
  });

  it('strips internal tool registry', () => {
    const input = { toolRegistry: [], toolDefinitions: [], service: 'ai-chat' };
    const result = sanitizePublic(input);
    expect(result).not.toHaveProperty('toolRegistry');
    expect(result).not.toHaveProperty('toolDefinitions');
  });

  it('strips secrets', () => {
    const input = { apiKey: 'sk-xxx', secret: 'hidden', token: 'bearer', publicId: 'pub_123' };
    const result = sanitizePublic(input);
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('secret');
    expect(result).not.toHaveProperty('token');
    expect(result).toEqual({ publicId: 'pub_123' });
  });

  it('strips aggregate agent counts', () => {
    const input = { totalAgents: 2000, agentCount: 100, departmentCount: 20, services: ['ai-chat'] };
    const result = sanitizePublic(input);
    expect(result).not.toHaveProperty('totalAgents');
    expect(result).not.toHaveProperty('agentCount');
    expect(result).not.toHaveProperty('departmentCount');
  });

  it('handles nested objects', () => {
    const input = { data: { agentId: 'AGENT-0001', nested: { model: 'gpt-4' } }, public: 'ok' };
    const result = sanitizePublic(input);
    expect(result.data).not.toHaveProperty('agentId');
    expect(result.data.nested).not.toHaveProperty('model');
  });

  it('handles arrays', () => {
    const input = [{ agentId: 'AGENT-0001', name: 'public' }, { agentId: 'AGENT-0002', name: 'public2' }];
    const result = sanitizePublic(input);
    result.forEach((item) => {
      expect(item).not.toHaveProperty('agentId');
    });
  });

  it('preserves safe fields', () => {
    const input = { task_id: 'task_123', service: 'ai-chat', status: 'completed', summary: 'Done' };
    const result = sanitizePublic(input);
    expect(result).toEqual(input);
  });

  it('handles null and undefined', () => {
    expect(sanitizePublic(null)).toBeNull();
    expect(sanitizePublic(undefined)).toBeUndefined();
  });
});

describe('publicTaskResponse', () => {
  it('produces the canonical public task shape with no internal fields', () => {
    const response = publicTaskResponse({
      requestId: 'req_123',
      taskId: 'task_456',
      service: 'ai-chat',
      status: 'completed',
      result: { summary: 'Analysis completed', output: { score: 42 } },
      usageUnits: 1,
      createdAt: '2026-11-11T00:00:00Z',
      completedAt: '2026-11-11T00:01:00Z',
    });
    expect(response.success).toBe(true);
    expect(response.request_id).toBe('req_123');
    expect(response.task_id).toBe('task_456');
    expect(response.service).toBe('ai-chat');
    expect(response.status).toBe('completed');
    expect(response.usage.units).toBe(1);
    // Verify no leaky fields
    const leaks = containsLeakyFields(response);
    expect(leaks).toEqual([]);
  });

  it('sanitizes output that contains leaky fields', () => {
    const response = publicTaskResponse({
      requestId: 'req_123',
      taskId: 'task_456',
      service: 'ai-tasks',
      status: 'completed',
      result: { output: { agentId: 'AGENT-0001', model: 'gpt-4', score: 42 } },
      usageUnits: 1,
      createdAt: '2026-11-11T00:00:00Z',
    });
    expect(response.result?.output).not.toHaveProperty('agentId');
    expect(response.result?.output).not.toHaveProperty('model');
    expect(response.result?.output).toHaveProperty('score', 42);
  });
});

describe('safePublicError', () => {
  it('maps known error codes to safe messages', () => {
    const err = safePublicError('UNAUTHORIZED');
    expect(err.success).toBe(false);
    expect(err.error.code).toBe('UNAUTHORIZED');
    expect(err.error.message).toBe('Authentication required.');
  });

  it('maps unknown codes to INTERNAL_ERROR', () => {
    const err = safePublicError('SOME_RANDOM_ERROR');
    expect(err.error.code).toBe('INTERNAL_ERROR');
    expect(err.error.message).toBe('Service temporarily unavailable.');
  });

  it('never includes stack traces or internal details', () => {
    const err = safePublicError();
    expect(JSON.stringify(err)).not.toMatch(/stack|trace|at \//);
  });
});

describe('containsLeakyFields', () => {
  it('detects leaky fields in a nested object', () => {
    const obj = { ok: true, data: { agentId: 'x', model: 'y' } };
    const leaks = containsLeakyFields(obj);
    expect(leaks).toContain('agentId');
    expect(leaks).toContain('model');
  });

  it('returns empty for clean objects', () => {
    const obj = { task_id: 'x', status: 'ok' };
    expect(containsLeakyFields(obj)).toEqual([]);
  });
});
