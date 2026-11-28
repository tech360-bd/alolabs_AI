/**
 * Multi-Protocol AI Gateway Translation Layer
 *
 * Translates between external agent/IDE wire formats and ALO Labs' normalized
 * `AIRequest` / `AIResponse` / `AIStreamChunk`:
 *   1. Anthropic Messages API (`POST /v1/messages`)
 *   2. OpenAI Chat Completions API (`POST /v1/chat/completions`)
 *   3. OpenAI Responses API (`POST /v1/responses`)
 *   4. Google Gemini GenerateContent API (`POST /v1beta/models/{model}:generateContent`)
 *
 * Preserves tool schemas, tool calls, tool results, and system instructions
 * across formats, and provides guarded credential redaction when enabled.
 */

import { randomUUID } from 'node:crypto';
import type { AIMessage, AIRequest, AIResponse, AIStreamChunk, AITool, AIToolCall } from './types';

export type GatewayProtocol = 'anthropic-messages' | 'openai-chat' | 'openai-responses' | 'gemini-generate';

// ─── Secret / PII Redaction (Guarded Privacy Mode) ─────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk-[a-zA-Z0-9_-]{16,})\b/g,
  /\b(sk-ant-[a-zA-Z0-9_-]{16,})\b/g,
  /\b(gsk_[a-zA-Z0-9]{16,})\b/g,
  /\b(ghp_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})\b/g,
  /\b(AIza[0-9A-Za-z_-]{25,})\b/g,
  /\b(Bearer\s+[A-Za-z0-9\-._~+/]+=*)\b/gi,
  /\b(eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g,
];

export function redactSensitiveText(text: string): { text: string; redactedCount: number } {
  let out = text;
  let redactedCount = 0;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, () => {
      redactedCount += 1;
      return '[REDACTED_CREDENTIAL]';
    });
  }
  return { text: out, redactedCount };
}

export function applyGuardedRedaction(messages: AIMessage[]): { messages: AIMessage[]; redactedCount: number } {
  let redactedCount = 0;
  const next = messages.map((msg) => {
    const res = redactSensitiveText(msg.content);
    redactedCount += res.redactedCount;
    return res.redactedCount > 0 ? { ...msg, content: res.text } : msg;
  });
  return { messages: next, redactedCount };
}

// ─── Anthropic Messages Parser & Formatter ─────────────────────────────────

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

export interface AnthropicMessagesPayload {
  model?: string;
  system?: string | Array<{ type?: string; text?: string }>;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
  }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: AnthropicTool[];
}

export function parseAnthropicMessagesRequest(body: AnthropicMessagesPayload): AIRequest {
  const messages: AIMessage[] = [];
  if (typeof body.system === 'string' && body.system.trim()) {
    messages.push({ role: 'system', content: body.system });
  } else if (Array.isArray(body.system)) {
    const sysText = body.system.map((b) => b.text ?? '').filter(Boolean).join('\n');
    if (sysText) messages.push({ role: 'system', content: sysText });
  }

  for (const msg of body.messages ?? []) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content });
      continue;
    }
    const textParts: string[] = [];
    const toolCalls: AIToolCall[] = [];
    for (const block of msg.content ?? []) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use' && block.name) {
        toolCalls.push({
          id: block.id || `toolu_${randomUUID().slice(0, 12)}`,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
      } else if (block.type === 'tool_result' && block.tool_use_id) {
        const resultText =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c) => c.text ?? '').join('\n')
              : JSON.stringify(block.content ?? '');
        messages.push({
          role: 'tool',
          toolCallId: block.tool_use_id,
          content: resultText,
        });
      }
    }
    if (textParts.length > 0 || toolCalls.length > 0) {
      messages.push({
        role: msg.role,
        content: textParts.join('\n'),
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      });
    }
  }

  const tools: AITool[] | undefined = Array.isArray(body.tools) && body.tools.length > 0
    ? body.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema ?? { type: 'object', properties: {} },
        },
      }))
    : undefined;

  return {
    model: body.model ?? 'auto',
    messages,
    temperature: body.temperature,
    maxTokens: body.max_tokens,
    stream: body.stream,
    tools,
  };
}

export function formatAnthropicMessagesResponse(response: AIResponse, provider?: string) {
  const content: Array<Record<string, unknown>> = [];
  if (response.content) {
    content.push({ type: 'text', text: response.content });
  }
  if (response.toolCalls?.length) {
    for (const tc of response.toolCalls) {
      let input: unknown = {};
      try {
        input = JSON.parse(tc.function.arguments || '{}');
      } catch {
        input = { raw: tc.function.arguments };
      }
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input,
      });
    }
  }
  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  const stopReason =
    response.finishReason === 'tool-calls'
      ? 'tool_use'
      : response.finishReason === 'length'
        ? 'max_tokens'
        : 'end_turn';

  return {
    id: `msg_${response.id || randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: response.model,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: response.usage.promptTokens,
      output_tokens: response.usage.completionTokens,
    },
    ...(provider ? { alo_provider: provider } : {}),
  };
}

export function formatAnthropicSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── OpenAI Chat Completions & Responses Parsers/Formatters ────────────────

export interface OpenAIChatPayload {
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | Array<{ type?: string; text?: string; image_url?: { url?: string } }> | null;
    tool_call_id?: string;
    name?: string;
    tool_calls?: AIToolCall[];
  }>;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stream?: boolean;
  tools?: AITool[];
}

export function parseOpenAIChatRequest(body: OpenAIChatPayload): AIRequest {
  const messages: AIMessage[] = (body.messages ?? []).map((m) => {
    if (typeof m.content === 'string') {
      return {
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { toolCallId: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
        ...(m.tool_calls ? { toolCalls: m.tool_calls } : {}),
      };
    }
    const texts: string[] = [];
    const imageUrls: string[] = [];
    for (const part of m.content ?? []) {
      if (part.type === 'text' && part.text) texts.push(part.text);
      if (part.type === 'image_url' && part.image_url?.url) imageUrls.push(part.image_url.url);
    }
    return {
      role: m.role,
      content: texts.join('\n'),
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
      ...(m.tool_call_id ? { toolCallId: m.tool_call_id } : {}),
      ...(m.name ? { name: m.name } : {}),
      ...(m.tool_calls ? { toolCalls: m.tool_calls } : {}),
    };
  });

  return {
    model: body.model ?? 'auto',
    messages,
    temperature: body.temperature,
    maxTokens: body.max_completion_tokens ?? body.max_tokens,
    stream: body.stream,
    tools: body.tools,
  };
}

export function formatOpenAIChatResponse(response: AIResponse, provider?: string) {
  return {
    id: `chatcmpl-${response.id || randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: response.content || null,
          ...(response.toolCalls?.length ? { tool_calls: response.toolCalls } : {}),
        },
        finish_reason: response.finishReason === 'tool-calls' ? 'tool_calls' : response.finishReason,
      },
    ],
    usage: {
      prompt_tokens: response.usage.promptTokens,
      completion_tokens: response.usage.completionTokens,
      total_tokens: response.usage.totalTokens,
    },
    ...(provider ? { alo_provider: provider } : {}),
  };
}

export interface OpenAIResponsesPayload {
  model?: string;
  instructions?: string;
  input:
    | string
    | Array<{
        type?: string;
        role?: 'system' | 'user' | 'assistant' | 'developer';
        content?: string | Array<{ type?: string; text?: string }>;
        call_id?: string;
        output?: string;
      }>;
  temperature?: number;
  max_output_tokens?: number;
  stream?: boolean;
  tools?: Array<
    | { type: 'function'; name: string; description?: string; parameters?: Record<string, unknown> }
    | AITool
  >;
}

export function parseOpenAIResponsesRequest(body: OpenAIResponsesPayload): AIRequest {
  const messages: AIMessage[] = [];
  if (body.instructions?.trim()) {
    messages.push({ role: 'system', content: body.instructions });
  }
  if (typeof body.input === 'string') {
    messages.push({ role: 'user', content: body.input });
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (item.type === 'function_call_output' && item.call_id) {
        messages.push({
          role: 'tool',
          toolCallId: item.call_id,
          content: item.output ?? '',
        });
        continue;
      }
      const role = item.role === 'developer' ? 'system' : (item.role ?? 'user');
      const content =
        typeof item.content === 'string'
          ? item.content
          : Array.isArray(item.content)
            ? item.content.map((c) => c.text ?? '').join('\n')
            : '';
      if (content) messages.push({ role, content });
    }
  }

  const tools: AITool[] | undefined = Array.isArray(body.tools) && body.tools.length > 0
    ? body.tools.map((t) =>
        'function' in t
          ? t
          : {
              type: 'function' as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters ?? { type: 'object', properties: {} },
              },
            },
      )
    : undefined;

  return {
    model: body.model ?? 'auto',
    messages,
    temperature: body.temperature,
    maxTokens: body.max_output_tokens,
    stream: body.stream,
    tools,
  };
}

export function formatOpenAIResponsesResult(response: AIResponse, provider?: string) {
  const output: Array<Record<string, unknown>> = [];
  if (response.content) {
    output.push({
      id: `msg_${randomUUID().slice(0, 12)}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: response.content, annotations: [] }],
    });
  }
  if (response.toolCalls?.length) {
    for (const tc of response.toolCalls) {
      output.push({
        id: `fc_${randomUUID().slice(0, 12)}`,
        type: 'function_call',
        status: 'completed',
        call_id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });
    }
  }
  return {
    id: `resp_${response.id || randomUUID()}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: response.model,
    output,
    output_text: response.content,
    usage: {
      input_tokens: response.usage.promptTokens,
      output_tokens: response.usage.completionTokens,
      total_tokens: response.usage.totalTokens,
    },
    ...(provider ? { alo_provider: provider } : {}),
  };
}

// ─── Google Gemini GenerateContent Parser & Formatter ───────────────────────

export interface GeminiGenerateContentPayload {
  systemInstruction?: { parts?: Array<{ text?: string }> };
  contents: Array<{
    role?: 'user' | 'model';
    parts: Array<{
      text?: string;
      functionCall?: { name: string; args?: Record<string, unknown> };
      functionResponse?: { name: string; response?: unknown };
    }>;
  }>;
  tools?: Array<{
    functionDeclarations?: Array<{
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

export function parseGeminiGenerateRequest(model: string, body: GeminiGenerateContentPayload): AIRequest {
  const messages: AIMessage[] = [];
  const sysParts = body.systemInstruction?.parts?.map((p) => p.text ?? '').filter(Boolean) ?? [];
  if (sysParts.length > 0) {
    messages.push({ role: 'system', content: sysParts.join('\n') });
  }

  for (const item of body.contents ?? []) {
    const role = item.role === 'model' ? 'assistant' : 'user';
    const textParts: string[] = [];
    const toolCalls: AIToolCall[] = [];
    for (const part of item.parts ?? []) {
      if (typeof part.text === 'string') textParts.push(part.text);
      if (part.functionCall?.name) {
        toolCalls.push({
          id: `call_${randomUUID().slice(0, 10)}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        });
      }
      if (part.functionResponse?.name) {
        messages.push({
          role: 'tool',
          name: part.functionResponse.name,
          content: JSON.stringify(part.functionResponse.response ?? {}),
        });
      }
    }
    if (textParts.length > 0 || toolCalls.length > 0) {
      messages.push({
        role,
        content: textParts.join('\n'),
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      });
    }
  }

  const tools: AITool[] = [];
  for (const toolGroup of body.tools ?? []) {
    for (const fn of toolGroup.functionDeclarations ?? []) {
      tools.push({
        type: 'function',
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        },
      });
    }
  }

  return {
    model: model || 'auto',
    messages,
    temperature: body.generationConfig?.temperature,
    maxTokens: body.generationConfig?.maxOutputTokens,
    tools: tools.length > 0 ? tools : undefined,
  };
}

export function formatGeminiGenerateResponse(response: AIResponse, provider?: string) {
  const parts: Array<Record<string, unknown>> = [];
  if (response.content) {
    parts.push({ text: response.content });
  }
  if (response.toolCalls?.length) {
    for (const tc of response.toolCalls) {
      let args: unknown = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        args = {};
      }
      parts.push({
        functionCall: {
          name: tc.function.name,
          args,
        },
      });
    }
  }
  if (parts.length === 0) parts.push({ text: '' });

  return {
    candidates: [
      {
        index: 0,
        content: {
          role: 'model',
          parts,
        },
        finishReason: response.finishReason === 'length' ? 'MAX_TOKENS' : 'STOP',
      },
    ],
    usageMetadata: {
      promptTokenCount: response.usage.promptTokens,
      candidatesTokenCount: response.usage.completionTokens,
      totalTokenCount: response.usage.totalTokens,
    },
    modelVersion: response.model,
    ...(provider ? { aloProvider: provider } : {}),
  };
}

export function formatOpenAISseChunk(chunk: AIStreamChunk): string {
  return `data: ${JSON.stringify({
    id: `chatcmpl-${chunk.id}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: chunk.model,
    choices: [
      {
        index: 0,
        delta: chunk.content ? { content: chunk.content } : {},
        finish_reason: chunk.finishReason ?? null,
      },
    ],
  })}\n\n`;
}

export function formatOpenAIResponsesSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function formatGeminiSseChunk(chunk: AIStreamChunk): string {
  const parts: Array<Record<string, unknown>> = [];
  if (chunk.content) parts.push({ text: chunk.content });
  if (chunk.toolCalls?.length) {
    for (const tc of chunk.toolCalls) {
      let args: unknown = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        args = {};
      }
      parts.push({ functionCall: { name: tc.function.name, args } });
    }
  }
  return `data: ${JSON.stringify({
    candidates: [
      {
        index: 0,
        content: { role: 'model', parts },
        ...(chunk.finishReason ? { finishReason: chunk.finishReason === 'length' ? 'MAX_TOKENS' : 'STOP' } : {}),
      },
    ],
    ...(chunk.usage
      ? {
          usageMetadata: {
            promptTokenCount: chunk.usage.promptTokens,
            candidatesTokenCount: chunk.usage.completionTokens,
            totalTokenCount: chunk.usage.totalTokens,
          },
        }
      : {}),
    modelVersion: chunk.model,
  })}\n\n`;
}

export function formatProtocolErrorEnvelope(
  protocol: GatewayProtocol,
  status: number,
  message: string,
  code?: string,
): Record<string, unknown> {
  if (protocol === 'anthropic-messages') {
    const type =
      status === 401
        ? 'authentication_error'
        : status === 403
          ? 'permission_error'
          : status === 429
            ? 'rate_limit_error'
            : status >= 500
              ? 'overloaded_error'
              : 'invalid_request_error';
    return { type: 'error', error: { type, message } };
  }
  if (protocol === 'gemini-generate') {
    const statusText =
      status === 401
        ? 'UNAUTHENTICATED'
        : status === 403
          ? 'PERMISSION_DENIED'
          : status === 429
            ? 'RESOURCE_EXHAUSTED'
            : status >= 500
              ? 'UNAVAILABLE'
              : 'INVALID_ARGUMENT';
    return { error: { code: status, message, status: statusText } };
  }
  return {
    error: {
      message,
      type: status >= 500 ? 'server_error' : 'invalid_request_error',
      param: null,
      code: code ?? null,
    },
  };
}
