/**
 * Tool-call extraction for OpenAI-shaped providers.
 *
 * Every provider is supposed to support `tools`, but the wire types only kept
 * `finish_reason` and dropped the `tool_calls` array. A model that answered
 * "call search_knowledge" therefore produced an *empty* assistant message and
 * the agent silently did nothing. This module is the single place that turns a
 * provider's raw message into typed tool calls.
 */

import type { AIToolCall } from './types';

interface RawToolCall {
  id?: unknown;
  type?: unknown;
  function?: { name?: unknown; arguments?: unknown } | null;
}

/** Normalise `message.tool_calls` from any OpenAI-compatible response. */
export function extractToolCalls(message: unknown): AIToolCall[] {
  if (!message || typeof message !== 'object') return [];

  const candidate = message as {
    tool_calls?: unknown;
    toolCalls?: unknown;
    function_call?: { name?: unknown; arguments?: unknown } | null;
  };

  const raw = Array.isArray(candidate.tool_calls)
    ? candidate.tool_calls
    : Array.isArray(candidate.toolCalls)
      ? candidate.toolCalls
      : [];

  const calls: AIToolCall[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== 'object') continue;
    const call = item as RawToolCall;
    const name = typeof call.function?.name === 'string' ? call.function.name.trim() : '';
    if (!name) continue;

    const rawArgs = call.function?.arguments;
    const args =
      typeof rawArgs === 'string'
        ? rawArgs
        : rawArgs === undefined || rawArgs === null
          ? '{}'
          : JSON.stringify(rawArgs);

    calls.push({
      id: typeof call.id === 'string' && call.id ? call.id : `call_${index}_${name}`,
      type: 'function',
      function: { name, arguments: args },
    });
  }

  // Legacy single function_call shape.
  if (calls.length === 0 && candidate.function_call && typeof candidate.function_call.name === 'string') {
    const rawArgs = candidate.function_call.arguments;
    calls.push({
      id: 'call_legacy',
      type: 'function',
      function: {
        name: candidate.function_call.name,
        arguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {}),
      },
    });
  }

  return calls;
}

/**
 * Parse tool-call arguments. Models sometimes emit trailing prose or markdown
 * fences; anything that is not a JSON object is rejected rather than guessed.
 */
export function parseToolArguments(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, value: {} };

  let text = trimmed;
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Tool arguments must be a JSON object' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return { ok: false, error: `Invalid JSON arguments: ${error instanceof Error ? error.message : String(error)}` };
  }
}
