/**
 * Super Admin Command Center — dispatch.
 *
 * Turns an operator instruction into a **persisted** command and run, or into a
 * precise approval request when the instruction is gated. Everything here is
 * server-only.
 *
 * The contract this module exists to keep:
 *
 * - Every accepted instruction produces a durable `Command` row and, unless it is
 *   gated, a durable `AgentOSRun` row with a queue item. There is no "chat only"
 *   path: an instruction that is not executed must say *why* and point at the
 *   approval that unblocks it.
 * - A gated instruction writes the approval with the exact plan, so the reviewer
 *   approves the work order rather than a summary of it.
 * - The tenant comes from the authenticated principal. A run without a usable
 *   tenant is refused (T-2) rather than defaulted.
 */

import { db } from '@/lib/db';
import { writeAuditEvent } from '@/lib/audit-events';
import { createRun, listRuns, type RunStatus } from '@/lib/runs';
import { isUsableTenantId } from '@/lib/tenancy/policy';
import {
  classifyInstruction,
  summariseAttachments,
  type InstructionPlan,
  type OperatorAttachment,
  type OperatorIntentId,
  type OperatorRisk,
} from './operator';

export interface DispatchInput {
  instruction: string;
  /** Canonical tenant. Required: a run cannot exist without one. */
  companyId: string;
  userId?: string;
  projectId?: string;
  attachments?: OperatorAttachment[];
  requestId?: string;
  ipAddress?: string;
}

export type DispatchResult =
  | {
      status: 'dispatched';
      commandId: string;
      runId: string;
      runStatus: RunStatus;
      plan: InstructionPlan;
      streamUrl: string;
    }
  | {
      status: 'approval_required';
      commandId: string;
      approvalId: string;
      plan: InstructionPlan;
      reason: string;
    }
  | { status: 'rejected'; reason: string };

const MAX_INSTRUCTION = 20_000;

const APPROVAL_RISK: Record<OperatorRisk, 'low' | 'medium' | 'high'> = {
  read: 'low',
  reversible: 'medium',
  production: 'high',
  destructive: 'high',
};

function approvalTitle(plan: InstructionPlan, instruction: string): string {
  const headline = instruction.replace(/\s+/g, ' ').trim().slice(0, 90);
  return `${plan.intent.label}: ${headline}`;
}

/**
 * Dispatch one instruction.
 *
 * Not transactional across tables on purpose: a `Command` row that exists without
 * a run is a visible, auditable failure (`status: 'blocked'` with the reason in
 * `result`), whereas a run that exists without its command loses the operator's
 * original words. The command is written first for that reason.
 */
export async function dispatchOperatorInstruction(input: DispatchInput): Promise<DispatchResult> {
  const instruction = input.instruction.trim();
  if (!instruction) return { status: 'rejected', reason: 'The instruction is empty.' };
  if (instruction.length > MAX_INSTRUCTION) {
    return { status: 'rejected', reason: `The instruction is longer than ${MAX_INSTRUCTION} characters.` };
  }
  if (!isUsableTenantId(input.companyId)) {
    return { status: 'rejected', reason: 'No tenant is resolved for this operator; refusing to dispatch.' };
  }

  const plan = classifyInstruction(instruction);
  const attachments = input.attachments ?? [];

  const command = await db.command.create({
    data: {
      rawCommand: instruction,
      parsedIntent: plan.intent.id satisfies OperatorIntentId,
      ...(input.userId ? { userId: input.userId } : {}),
      status: 'pending',
    },
  });

  if (plan.requiresApproval) {
    const approval = await db.approval.create({
      data: {
        type: plan.intent.approvalType ?? 'tool_approval',
        title: approvalTitle(plan, instruction),
        description: plan.intent.summary,
        requestJson: JSON.stringify({
          kind: 'operator_command',
          commandId: command.id,
          intent: plan.intent.id,
          risk: plan.risk,
          requiresApproval: true,
          confidence: plan.confidence,
          matched: plan.matched,
          steps: plan.steps,
          evidence: plan.evidence,
          attachments,
          attachmentsSummary: summariseAttachments(attachments),
          instruction,
          ...(input.projectId ? { projectId: input.projectId } : {}),
        }),
        status: 'pending',
        riskLevel: APPROVAL_RISK[plan.risk],
        ...(input.userId ? { requestedBy: input.userId } : {}),
        companyId: input.companyId,
      },
    });

    await db.command.update({
      where: { id: command.id },
      data: {
        status: 'blocked',
        result: `Awaiting ${approval.type} approval ${approval.id}.`,
      },
    });

    await writeAuditEvent({
      action: 'super_admin.command.approval_required',
      resource: 'approval',
      resourceId: approval.id,
      companyId: input.companyId,
      ...(input.userId ? { actorUserId: input.userId } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      details: {
        commandId: command.id,
        intent: plan.intent.id,
        risk: plan.risk,
        approvalType: approval.type,
      },
    });

    return {
      status: 'approval_required',
      commandId: command.id,
      approvalId: approval.id,
      plan,
      reason:
        `"${plan.intent.label}" is ${plan.risk === 'destructive' ? 'destructive or production' : 'a shared-environment'} ` +
        'operation, so it stops at an approval gate. The request contains the exact steps and attachments.',
    };
  }

  try {
    const run = await createRun({
      objective: instruction,
      companyId: input.companyId,
      ...(input.userId ? { userId: input.userId } : {}),
      commandId: command.id,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      priority: plan.risk === 'reversible' ? 'high' : 'normal',
    });

    await db.command.update({ where: { id: command.id }, data: { status: 'processing' } });

    await writeAuditEvent({
      action: 'super_admin.command.dispatched',
      resource: 'run',
      resourceId: run.runId,
      companyId: input.companyId,
      ...(input.userId ? { actorUserId: input.userId } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      details: { commandId: command.id, intent: plan.intent.id, risk: plan.risk, confidence: plan.confidence },
    });

    return {
      status: 'dispatched',
      commandId: command.id,
      runId: run.runId,
      runStatus: run.status,
      plan,
      streamUrl: `/api/runs/${run.runId}/events`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.command.update({
      where: { id: command.id },
      data: { status: 'failed', result: `Could not start a run: ${message}` },
    });
    await writeAuditEvent({
      action: 'super_admin.command.failed',
      resource: 'command',
      resourceId: command.id,
      companyId: input.companyId,
      ...(input.userId ? { actorUserId: input.userId } : {}),
      details: { intent: plan.intent.id, error: message },
    });
    return { status: 'rejected', reason: `The run could not be queued: ${message}` };
  }
}

export interface OperatorRunRow {
  runId: string;
  objective: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

/** Recent runs for the operator's own tenant. Never crosses a company boundary. */
export async function listOperatorRuns(companyId: string, limit = 20): Promise<OperatorRunRow[]> {
  if (!isUsableTenantId(companyId)) return [];
  const { runs } = await listRuns({ companyId, limit: Math.min(Math.max(limit, 1), 50) });
  return runs.map((run) => ({
    runId: run.id,
    objective: run.objective,
    status: run.status,
    createdAt: (run.createdAt instanceof Date ? run.createdAt : new Date(run.createdAt)).toISOString(),
    ...(run.updatedAt
      ? { updatedAt: (run.updatedAt instanceof Date ? run.updatedAt : new Date(run.updatedAt)).toISOString() }
      : {}),
  }));
}
