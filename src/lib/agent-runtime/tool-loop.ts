/**
 * Bounded tool-use loop (ReAct-style).
 *
 * Before this existed the execution engine sent tools to the router but never
 * read `toolCalls` back, so a model that asked for a tool produced an empty
 * answer and the task "succeeded" with nothing in it.
 *
 * Contract:
 *  - at most `maxSteps` model turns (default 5), so a loop cannot run forever;
 *  - every call is authorised against the agent's own permissions;
 *  - every call, blocked or not, is persisted as a ToolRun by `executeTool`;
 *  - the final assistant message is returned with the tool transcript attached
 *    to metadata so the UI can show what actually happened.
 */

import type { AIRequest, AIResponse, AIMessage } from '@/lib/ai-router/types';
import { parseToolArguments } from '@/lib/ai-router/tool-calls';
import { executeTool, parseAgentPermissions } from '@/lib/tools';
import type { ToolExecutionResult } from '@/lib/tools';

export interface ToolLoopAgent {
  agentId: string;
  agentDbId: string;
  name: string;
  departmentId?: string | null;
  allowedTools?: unknown;
  forbiddenTools?: unknown;
}

export interface ToolLoopContext {
  companyId: string;
  userId?: string;
  taskId?: string;
  approvalId?: string | null;
}

export interface ToolLoopResult {
  response: AIResponse;
  steps: number;
  toolResults: ToolExecutionResult[];
  /** Names of the tools that were actually offered to the model. */
  offeredTools: string[];
}

type ChatFn = (
  request: AIRequest,
  companyId?: string,
  agentId?: string,
  context?: { taskId?: string; runId?: string; taskType?: string },
) => Promise<AIResponse>;

const DEFAULT_MAX_STEPS = 5;

export async function runToolLoop(params: {
  chat: ChatFn;
  request: AIRequest;
  initialResponse: AIResponse;
  agent: ToolLoopAgent;
  context: ToolLoopContext;
  tools: AIRequest['tools'];
  maxSteps?: number;
}): Promise<ToolLoopResult> {
  const { chat, request, agent, context } = params;
  const maxSteps = Math.min(10, Math.max(1, params.maxSteps ?? DEFAULT_MAX_STEPS));
  const permissions = parseAgentPermissions(agent);
  const offeredTools = (params.tools ?? []).map((tool) => tool.function.name);
  const messages: AIMessage[] = [...request.messages];

  let response = params.initialResponse;
  let steps = 0;
  const toolResults: ToolExecutionResult[] = [];

  while (response.toolCalls && response.toolCalls.length > 0 && steps < maxSteps) {
    steps += 1;

    messages.push({
      role: 'assistant',
      content: response.content ?? '',
      toolCalls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      const parsed = parseToolArguments(call.function.arguments);

      const result: ToolExecutionResult = parsed.ok
        ? await executeTool({
            toolName: call.function.name,
            args: parsed.value,
            context: {
              companyId: context.companyId,
              agentId: agent.agentId,
              agentDbId: agent.agentDbId,
              departmentId: agent.departmentId ?? null,
              ...(context.userId ? { userId: context.userId } : {}),
              ...(context.taskId ? { taskId: context.taskId } : {}),
            },
            permissions,
            approvalId: context.approvalId ?? null,
          })
        : {
            toolName: call.function.name,
            ok: false,
            output: '',
            error: parsed.error,
            durationMs: 0,
          };

      toolResults.push(result);

      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.function.name,
        content: JSON.stringify(
          result.ok
            ? { ok: true, result: result.output }
            : { ok: false, error: result.error, blocked: result.blocked ?? false },
        ),
      });
    }

    response = await chat(
      { ...request, messages },
      context.companyId,
      agent.agentId,
      { ...(context.taskId ? { taskId: context.taskId } : {}), taskType: 'agent.task.tool-loop' },
    );
  }

  if (response.toolCalls && response.toolCalls.length > 0 && steps >= maxSteps) {
    // The model still wants tools after the budget: force a textual answer so
    // the task does not end with an empty result.
    messages.push({
      role: 'user',
      content:
        'The tool budget for this task is exhausted. Answer with the best conclusion you can from the tool results above, and state explicitly what remains unverified.',
    });
    response = await chat(
      { ...request, messages, tools: undefined },
      context.companyId,
      agent.agentId,
      { ...(context.taskId ? { taskId: context.taskId } : {}), taskType: 'agent.task.tool-loop.final' },
    );
  }

  return { response, steps, toolResults, offeredTools };
}
