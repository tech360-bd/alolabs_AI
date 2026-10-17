/**
 * Tool execution service.
 *
 * Authorises, runs and records every tool call. A blocked call is recorded as
 * `blocked` in ToolRun — it is never silently skipped, because "the agent did
 * nothing and nobody noticed" is the exact failure mode this exists to fix.
 */

import { db } from '@/lib/db';
import { authoriseTool, parseToolList } from './policy';
import { getTool } from './registry';
import type { ToolContext, ToolExecutionResult } from './types';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_CHARS = 8_000;

function serialise(value: unknown): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}…[truncated]` : text;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ExecuteToolOptions {
  toolName: string;
  args: Record<string, unknown>;
  context: ToolContext;
  /** Parsed permissions of the calling agent. Omit only for trusted internal calls. */
  permissions?: { allowedTools: unknown; forbiddenTools: unknown };
  approvalId?: string | null;
  timeoutMs?: number;
}

export async function executeTool(options: ExecuteToolOptions): Promise<ToolExecutionResult> {
  const start = Date.now();
  const tool = getTool(options.toolName);

  const record = async (result: Omit<ToolExecutionResult, 'toolName' | 'durationMs'>) => {
    const durationMs = Date.now() - start;
    try {
      await db.toolRun.create({
        data: {
          taskId: options.context.taskId ?? null,
          agentId: options.context.agentDbId ?? null,
          toolName: options.toolName.slice(0, 120),
          toolCategory: tool?.category ?? 'unknown',
          input: serialise(options.args).slice(0, MAX_OUTPUT_CHARS),
          output: result.output || null,
          status: result.ok ? 'success' : result.blocked ? 'blocked' : 'failed',
          durationMs,
          blocked: Boolean(result.blocked),
          blockReason: result.blockReason ?? null,
        },
      });
    } catch (error) {
      console.error('[tools] failed to persist ToolRun:', error);
    }
    return { toolName: options.toolName, durationMs, ...result };
  };

  if (!tool) {
    return record({ ok: false, output: '', error: `Unknown tool "${options.toolName}"`, blocked: true, blockReason: 'not-registered' });
  }

  if (options.permissions) {
    const decision = authoriseTool(tool, options.permissions, { approvalId: options.approvalId });
    if (!decision.allowed) {
      return record({ ok: false, output: '', error: decision.reason, blocked: true, blockReason: decision.reason });
    }
  }

  try {
    const value = await withTimeout(
      tool.handler(options.args, options.context),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      `Tool "${tool.name}"`,
    );
    return record({ ok: true, output: serialise(value) });
  } catch (error) {
    return record({
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Convenience for the execution engine: parse permission columns in one place. */
export function parseAgentPermissions(agent: { allowedTools?: unknown; forbiddenTools?: unknown }) {
  return {
    allowedTools: parseToolList(agent.allowedTools),
    forbiddenTools: parseToolList(agent.forbiddenTools),
  };
}
