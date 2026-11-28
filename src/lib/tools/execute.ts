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
  consumeApproval,
  createBoundApproval,
  defaultApproversFor,
  enforceGovernance,
  verifyToolApproval,
} from '@/lib/governance';
import type { ApproverRole } from '@/lib/governance';
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
  const safeArgs =
    options.args && typeof options.args === 'object' && !Array.isArray(options.args)
      ? options.args
      : {};

  const record = async (result: Omit<ToolExecutionResult, 'toolName' | 'durationMs'>) => {
    const durationMs = Date.now() - start;
    try {
      await db.toolRun.create({
        data: {
          taskId: options.context.taskId ?? null,
          agentId: options.context.agentDbId ?? null,
          toolName: options.toolName.slice(0, 120),
          toolCategory: tool?.category ?? 'unknown',
          input: serialise(safeArgs).slice(0, MAX_OUTPUT_CHARS),
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
  const privileged = tool.risk === 'high' || tool.requiresApproval;

  // 1. Verify any supplied approval *before* evaluating policy so both
  //    privileged tools and policy-triggered require_approval paths accept a
  //    bound approval without looping forever.
  let verifiedApproval = false;
  let approvalFailure = '';
  if (options.approvalId) {
    const approval = await verifyToolApproval({
      approvalId: options.approvalId,
      companyId: options.context.companyId,
      toolName: tool.name,
      args: safeArgs,
      actionClass,
      allowedApproverRoles: defaultApproversFor(actionClass),
    });
    verifiedApproval = approval.verified;
    if (!approval.verified) approvalFailure = approval.reason;
  }

  // 2. Central governance gate: tenant boundary, emergency controls, policy.
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
    evidence: verifiedApproval ? { approvalVerified: true, approvalId: options.approvalId ?? null } : undefined,
  });

  if (governance.outcome === 'deny') {
    const reason = `Governance denied this call: ${governance.explanation}`;
    return record({ ok: false, output: '', error: reason, blocked: true, blockReason: reason });
  }

  if (governance.outcome === 'require_approval' && !verifiedApproval) {
    // Create a bound approval so a human can authorise this *exact* call, then
    // return the id. The caller retries with it; nothing executes meanwhile.
    const approvers = (governance.requiredApprovers.length
      ? governance.requiredApprovers
      : defaultApproversFor(actionClass)) as ApproverRole[];
    let createdId: string | null = null;
    let createError = '';
    try {
      const created = await createBoundApproval({
        companyId: options.context.companyId,
        requestedBy: options.context.userId ?? null,
        actionClass,
        action: `Execute tool ${tool.name}`,
        resource: `tool:${tool.name}`,
        payload: { tool: tool.name, args: safeArgs },
        riskLevel: governance.riskLevel,
        requiredApprovers: approvers,
        description: governance.explanation.slice(0, 1000),
        metadata: { agentId: options.context.agentId ?? null, decisionId: governance.decisionId },
      });
      createdId = created.id;
    } catch (error) {
      createError = error instanceof Error ? error.message : 'Approval could not be created.';
    }

    const reason = approvalFailure
      ? `Governance requires approval: ${approvalFailure}`
      : createdId
        ? `Governance requires approval. Approval ${createdId} was requested; retry with approvalId=${createdId} once it is approved.`
        : `Governance requires approval, but the approval request could not be created. ${createError}`;

    return record({
      ok: false,
      output: '',
      error: reason,
      blocked: true,
      blockReason: reason,
      approvalId: createdId,
    });
  }

  const decision = authoriseTool(tool, permissions, {
    approvalId: options.approvalId,
    verifiedApproval,
  });
  if (!decision.allowed) {
    const reason = approvalFailure ? `${decision.reason} ${approvalFailure}` : decision.reason;
    return record({ ok: false, output: '', error: reason, blocked: true, blockReason: reason });
  }

  // 3. Consume any verified approval atomically before executing, so two
  //    concurrent runs cannot both use the same human decision (GAP-004).
  if (verifiedApproval && options.approvalId) {
    const consumption = await consumeApproval(options.approvalId, options.context.companyId, options.context.userId ?? null);
    if (!consumption.consumed) {
      const reason = `Approval could not be consumed: ${consumption.reason}`;
      return record({ ok: false, output: '', error: reason, blocked: true, blockReason: reason });
    }
  }

  try {
    const value = await withTimeout(
      tool.handler(safeArgs, options.context),
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
