import { describe, expect, it } from 'vitest';
import { authoriseTool, parseToolList } from '@/lib/tools/policy';
import { evaluateArithmetic } from '@/lib/tools/arithmetic';
import { extractToolCalls, parseToolArguments } from '@/lib/ai-router/tool-calls';

describe('parseToolList', () => {
  it('parses a JSON array string (the Prisma column format)', () => {
    expect(parseToolList('["search_knowledge","calculate"]')).toEqual(['search_knowledge', 'calculate']);
  });

  it('parses the pipe form used by the workforce CSVs', () => {
    expect(parseToolList('calendar|email|analytics')).toEqual(['calendar', 'email', 'analytics']);
  });

  it('accepts a real array and trims entries', () => {
    expect(parseToolList([' a ', 'b', 3, null])).toEqual(['a', 'b']);
  });

  it('returns an empty list for junk instead of throwing', () => {
    expect(parseToolList(null)).toEqual([]);
    expect(parseToolList('')).toEqual([]);
    expect(parseToolList('not json {')).toEqual(['not json {']);
    expect(parseToolList(undefined)).toEqual([]);
  });
});

describe('authoriseTool', () => {
  const lowRisk = { name: 'search_knowledge', risk: 'low' as const, requiresApproval: false };
  const highRisk = { name: 'payment_execute', risk: 'high' as const, requiresApproval: true };

  it('denies an unregistered tool', () => {
    expect(authoriseTool(undefined, { allowedTools: '[]', forbiddenTools: '[]' }).allowed).toBe(false);
  });

  it('denies by default when the agent does not list the tool', () => {
    const decision = authoriseTool(lowRisk, { allowedTools: '[]', forbiddenTools: '[]' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/not in this agent/);
  });

  it('allows a listed, low-risk tool', () => {
    expect(authoriseTool(lowRisk, { allowedTools: '["search_knowledge"]', forbiddenTools: '[]' }).allowed).toBe(true);
  });

  it('lets forbiddenTools win over allowedTools', () => {
    const decision = authoriseTool(lowRisk, {
      allowedTools: '["search_knowledge","crm_lookup_contact"]',
      forbiddenTools: '["search_knowledge"]',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/explicitly forbidden/);
  });

  it('does not honour wildcards', () => {
    expect(authoriseTool(lowRisk, { allowedTools: '["*"]', forbiddenTools: '[]' }).allowed).toBe(false);
  });

  it('requires an approval reference for high-risk tools', () => {
    const permissions = { allowedTools: '["payment_execute"]', forbiddenTools: '[]' };
    expect(authoriseTool(highRisk, permissions).allowed).toBe(false);
    expect(authoriseTool(highRisk, permissions, { approvalId: 'appr-1' }).allowed).toBe(true);
  });
});

describe('evaluateArithmetic', () => {
  it('respects precedence and parentheses', () => {
    expect(evaluateArithmetic('2+3*4')).toBe(14);
    expect(evaluateArithmetic('(2+3)*4')).toBe(20);
    expect(evaluateArithmetic('1200 * 1.15 - 300')).toBeCloseTo(1080, 6);
    expect(evaluateArithmetic('-4 + 10')).toBe(6);
  });

  it('rejects code injection attempts', () => {
    expect(() => evaluateArithmetic('process.exit(1)')).toThrow(/unsupported characters/);
    expect(() => evaluateArithmetic('1; rm -rf /')).toThrow();
    expect(() => evaluateArithmetic('globalThis')).toThrow();
  });

  it('rejects division by zero and malformed input', () => {
    expect(() => evaluateArithmetic('1/0')).toThrow(/Division by zero/);
    expect(() => evaluateArithmetic('(1+2')).toThrow(/closing parenthesis/);
    expect(() => evaluateArithmetic('1 2')).toThrow();
  });
});

describe('extractToolCalls', () => {
  it('extracts an OpenAI tool_calls array', () => {
    const calls = extractToolCalls({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"pricing"}' } },
      ],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      id: 'call_1',
      function: { name: 'search_knowledge', arguments: '{"query":"pricing"}' },
    });
  });

  it('supports the legacy function_call shape', () => {
    const calls = extractToolCalls({ function_call: { name: 'calculate', arguments: '{"expression":"1+1"}' } });
    expect(calls[0].function.name).toBe('calculate');
  });

  it('serialises object arguments and skips nameless calls', () => {
    const calls = extractToolCalls({
      tool_calls: [
        { function: { name: 'calculate', arguments: { expression: '1+1' } } },
        { function: { arguments: '{}' } },
        'garbage',
      ],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('call_0_calculate');
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ expression: '1+1' });
  });

  it('returns an empty list for a plain message', () => {
    expect(extractToolCalls({ role: 'assistant', content: 'hello' })).toEqual([]);
    expect(extractToolCalls(null)).toEqual([]);
  });
});

describe('parseToolArguments', () => {
  it('parses a JSON object', () => {
    expect(parseToolArguments('{"query":"x"}')).toEqual({ ok: true, value: { query: 'x' } });
  });

  it('strips markdown fences', () => {
    expect(parseToolArguments('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('treats empty input as no arguments', () => {
    expect(parseToolArguments('   ')).toEqual({ ok: true, value: {} });
  });

  it('rejects arrays and invalid JSON rather than guessing', () => {
    expect(parseToolArguments('[1,2]').ok).toBe(false);
    expect(parseToolArguments('{"a":').ok).toBe(false);
  });
});
