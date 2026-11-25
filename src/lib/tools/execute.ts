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
import {
  actionClassForTool,
  enforceGovernance,
  verifyToolApproval,
} from '@/lib/governance';
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
  /** Parsed permissions of the calling agent. Missing permissions are denied. */
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

  const permissions = options.permissions ?? { allowedTools: [], forbiddenTools: [] };
  const actionClass = actionClassForTool(tool);

  // 1. Central governance gate: tenant boundary, emergency controls, policy.
  const governance = await enforceGovernance({
    action: `Execute tool ${tool.name}`,
    actionClass,
    resource: `tool:${tool.name}`,
    companyId: options.context.companyId,
    callerCompanyId: options.context.companyId,
    actor: {
      userId: options.context.userId ?? null,
      role: 'standard_user',
      companyId: options.context.companyId,
      agentId: options.context.agentId ?? null,
    },
    surface: 'internal_job',
  });
  if (governance.outcome !== 'allow') {
    const reason = `Governance ${governance.outcome === 'deny' ? 'denied' : 'paused'} this call: ${governance.explanation}`;
    return record({ ok: false, output: '', error: reason, blocked: true, blockReason: reason });
  }

  // 2. Verify a supplied approval against this exact action before the tool
  //    policy will consider it. Verification is server-side and fail-closed.
  let verifiedApproval = false;
  let approvalFailure = '';
  if (tool.risk === 'high' || tool.requiresApproval) {
    if (!options.approvalId) {
      approvalFailure = 'This tool requires a verified human approval, and no approval id was supplied.';
    } else {
      const approval = await verifyToolApproval({
        approvalId: options.approvalId,
        companyId: options.context.companyId,
        toolName: tool.name,
        args: options.args,
        actionClass,
        allowedApproverRoles: ['super_admin', 'admin', 'organization_owner', 'project_manager'],
      });
      verifiedApproval = approval.verified;
      if (!approval.verified) approvalFailure = approval.reason;
    }
  }

  const decision = authoriseTool(tool, permissions, {
    approvalId: options.approvalId,
    verifiedApproval,
  });
  if (!decision.allowed) {
    const reason = approvalFailure ? `${decision.reason} ${approvalFailure}` : decision.reason;
    return record({ ok: false, output: '', error: reason, blocked: true, blockReason: reason });
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
