import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The loop is tested with the tool executor mocked: this suite verifies
 * control flow (bounded steps, message transcript, blocking behaviour), not
 * the database. Tool handlers themselves are covered by tool-policy.test.ts
 * (policy + arithmetic) and by the live activation script.
 */

const executed: Array<{ toolName: string; args: Record<string, unknown> }> = [];
let nextToolResult: { ok: boolean; output: string; error?: string; blocked?: boolean } = {
  ok: true,
  output: '{"results":[]}',
};

vi.mock('@/lib/tools', () => ({
  parseAgentPermissions: (agent: { allowedTools?: unknown; forbiddenTools?: unknown }) => ({
    allowedTools: agent.allowedTools,
    forbiddenTools: agent.forbiddenTools,
  }),
  executeTool: async (options: { toolName: string; args: Record<string, unknown> }) => {
    executed.push({ toolName: options.toolName, args: options.args });
    return { toolName: options.toolName, durationMs: 1, ...nextToolResult };
  },
}));

const { runToolLoop } = await import('@/lib/agent-runtime/tool-loop');

function response(overrides: Record<string, unknown>) {
  return {
    id: 'r',
    content: '',
    model: 'test-model',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    finishReason: 'tool-calls',
    latencyMs: 5,
    ...overrides,
  } as never;
}

function baseRequest() {
  return {
    model: 'test-model',
    messages: [
      { role: 'system' as const, content: 'You are a test agent.' },
      { role: 'user' as const, content: 'Find the pricing policy.' },
    ],
    tools: [{ type: 'function' as const, function: { name: 'search_knowledge', description: 'd', parameters: {} } }],
  };
}

const agent = {
  agentId: 'AGENT-0001',
  agentDbId: 'db-1',
  name: 'Test Agent',
  departmentId: 'dept-1',
  allowedTools: '["search_knowledge"]',
  forbiddenTools: '[]',
};

describe('runToolLoop', () => {
  beforeEach(() => {
    executed.length = 0;
    nextToolResult = { ok: true, output: '{"results":[]}' };
  });

  it('executes the requested tool and returns the follow-up answer', async () => {
    const calls: Array<{ messages: Array<{ role: string }> }> = [];
    const chat = vi.fn(async (request: { messages: Array<{ role: string }> }) => {
      calls.push({ messages: request.messages });
      // The initial response already carried the tool call, so the first chat
      // turn is the follow-up and must answer directly.
      return response({ content: 'The pricing policy is X.', finishReason: 'stop', toolCalls: [] });
    });

    const result = await runToolLoop({
      chat: chat as never,
      request: baseRequest() as never,
      initialResponse: response({
        toolCalls: [
          { id: 'call_1', type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"pricing"}' } },
        ],
      }) as never,
      agent,
      context: { companyId: 'company-1', taskId: 'task-1' },
      tools: baseRequest().tools,
    });

    expect(result.steps).toBe(1);
    expect(executed).toEqual([{ toolName: 'search_knowledge', args: { query: 'pricing' } }]);
    expect(result.response.content).toBe('The pricing policy is X.');
    expect(result.toolResults).toHaveLength(1);

    // The follow-up model call must contain the assistant call plus the tool result.
    const secondCallMessages = calls[0].messages;
    expect(secondCallMessages.map((m) => m.role)).toContain('assistant');
    expect(secondCallMessages.map((m) => m.role)).toContain('tool');
  });

  it('surfaces a blocked tool as an error to the model, not a silent success', async () => {
    nextToolResult = { ok: false, output: '', error: 'Tool "x" is not in this agent\'s allowed tools', blocked: true };

    const chat = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          toolCalls: [{ id: 'c1', type: 'function', function: { name: 'search_knowledge', arguments: '{}' } }],
        }),
      )
      .mockResolvedValueOnce(response({ content: 'I could not access the knowledge base.', finishReason: 'stop', toolCalls: [] }));

    const result = await runToolLoop({
      chat: chat as never,
      request: baseRequest() as never,
      initialResponse: response({
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'search_knowledge', arguments: '{}' } }],
      }) as never,
      agent,
      context: { companyId: 'company-1' },
      tools: baseRequest().tools,
    });

    expect(result.toolResults[0]).toMatchObject({ ok: false, blocked: true });
  });

  it('stops after maxSteps and forces a final textual answer', async () => {
    const chat = vi.fn(async () =>
      response({
        toolCalls: [{ id: 'c', type: 'function', function: { name: 'search_knowledge', arguments: '{}' } }],
      }),
    );

    const result = await runToolLoop({
      chat: chat as never,
      request: baseRequest() as never,
      initialResponse: response({
        toolCalls: [{ id: 'c', type: 'function', function: { name: 'search_knowledge', arguments: '{}' } }],
      }) as never,
      agent,
      context: { companyId: 'company-1' },
      tools: baseRequest().tools,
      maxSteps: 2,
    });

    expect(result.steps).toBe(2);
    expect(executed).toHaveLength(2);
    // 2 loop turns + 1 forced final call
    expect(chat).toHaveBeenCalledTimes(3);
    const finalRequest = chat.mock.calls[2][0] as { tools?: unknown };
    expect(finalRequest.tools).toBeUndefined();
  });

  it('does nothing when the model asked for no tools', async () => {
    const chat = vi.fn();
    const result = await runToolLoop({
      chat: chat as never,
      request: baseRequest() as never,
      initialResponse: response({ content: 'Direct answer', finishReason: 'stop', toolCalls: [] }) as never,
      agent,
      context: { companyId: 'company-1' },
      tools: baseRequest().tools,
    });

    expect(result.steps).toBe(0);
    expect(chat).not.toHaveBeenCalled();
    expect(executed).toHaveLength(0);
  });
});
