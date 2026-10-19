import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { safeAuditDetails } from '@/lib/audit-events';
import type { AIEmployeeStatus } from './employee-identities';

export class AIEmployeeLifecycleError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = 'AIEmployeeLifecycleError';
  }
}

export interface AIEmployeeLifecycleActor {
  userId: string;
  role: string;
  companyRole?: string;
}

export async function transitionAIEmployeeStatus(input: {
  companyId: string;
  employeeId: string;
  actor: AIEmployeeLifecycleActor;
  status: Extract<AIEmployeeStatus, 'tested' | 'active' | 'suspended' | 'retired'>;
  reason: string;
  verificationExecutionId?: string;
}): Promise<{ id: string; employeeKey: string; status: string; lastVerifiedAt: Date | null; lastVerificationExecutionId: string | null }> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 200) {
    throw new AIEmployeeLifecycleError('A reason between 3 and 200 characters is required.', 400, 'INVALID_REASON');
  }
  const canManageCompany = input.actor.role === 'super_admin' || input.actor.companyRole === 'owner' || input.actor.companyRole === 'admin';
  if (!canManageCompany) {
    throw new AIEmployeeLifecycleError('Company administrator authorization is required.', 403, 'COMPANY_ADMIN_REQUIRED');
  }
  if (input.status === 'active' && input.actor.role !== 'super_admin') {
    throw new AIEmployeeLifecycleError('Only a Super Admin may activate an AI employee.', 403, 'SUPER_ADMIN_REQUIRED');
  }

  const employee = await db.aIEmployeeIdentity.findFirst({
    where: { id: input.employeeId, companyId: input.companyId },
    select: {
      id: true,
      employeeKey: true,
      companyId: true,
      agentDbId: true,
      status: true,
      statusReason: true,
      lastVerifiedAt: true,
      lastVerificationExecutionId: true,
    },
  });
  if (!employee) throw new AIEmployeeLifecycleError('AI employee identity not found for this company.', 404, 'NOT_FOUND');
  if (employee.status === input.status) {
    return {
      id: employee.id,
      employeeKey: employee.employeeKey,
      status: employee.status,
      lastVerifiedAt: employee.lastVerifiedAt,
      lastVerificationExecutionId: employee.lastVerificationExecutionId,
    };
  }
  if (employee.status === 'retired') throw new AIEmployeeLifecycleError('Retired AI employee identities cannot be reactivated or changed.', 409, 'RETIRED_TERMINAL');

  let verifiedAt: Date | undefined;
  let verifiedExecutionId: string | undefined;
  if (input.status === 'tested') {
    if (employee.status !== 'provisioned' && employee.status !== 'suspended') {
      throw new AIEmployeeLifecycleError('Only provisioned or suspended employees can enter testing; suspend active employees first.', 409, 'INVALID_TRANSITION');
    }
    if (!input.verificationExecutionId) {
      throw new AIEmployeeLifecycleError('A completed execution ID is required to mark an AI employee tested.', 400, 'EXECUTION_EVIDENCE_REQUIRED');
    }
    const evidence = await verifyExecutionEvidence({
      companyId: input.companyId,
      agentDbId: employee.agentDbId,
      executionId: input.verificationExecutionId,
    });
    verifiedAt = evidence.completedAt;
    verifiedExecutionId = evidence.executionId;
  }

  if (input.status === 'active') {
    if (employee.status !== 'tested' || !employee.lastVerificationExecutionId || !employee.lastVerifiedAt) {
      throw new AIEmployeeLifecycleError('The AI employee must first pass an execution-backed test.', 409, 'TEST_REQUIRED');
    }
    await verifyExecutionEvidence({
      companyId: input.companyId,
      agentDbId: employee.agentDbId,
      executionId: employee.lastVerificationExecutionId,
    });
    verifiedAt = employee.lastVerifiedAt ?? undefined;
    verifiedExecutionId = employee.lastVerificationExecutionId;
  }

  const now = new Date();
  const auditDetails = safeAuditDetails({
    employeeKey: employee.employeeKey,
    fromStatus: employee.status,
    toStatus: input.status,
    reasonSha256: createHash('sha256').update(reason).digest('hex'),
    verificationExecutionId: verifiedExecutionId ?? null,
    humanApprovalRequired: input.status === 'active',
  });

  const updated = await db.$transaction(async (transaction) => {
    const current = await transaction.aIEmployeeIdentity.findFirst({
      where: { id: employee.id, companyId: input.companyId },
      select: { status: true, lastVerificationExecutionId: true, lastVerifiedAt: true },
    });
    if (!current) throw new AIEmployeeLifecycleError('AI employee identity not found for this company.', 404, 'NOT_FOUND');
    if (current.status !== employee.status || current.lastVerificationExecutionId !== employee.lastVerificationExecutionId) {
      throw new AIEmployeeLifecycleError('AI employee state changed during this request; reload and retry.', 409, 'CONCURRENT_UPDATE');
    }

    const changed = await transaction.aIEmployeeIdentity.updateMany({
      where: {
        id: employee.id,
        companyId: input.companyId,
        status: employee.status,
        lastVerificationExecutionId: employee.lastVerificationExecutionId,
      },
      data: {
        status: input.status,
        statusReason: reason,
        updatedBy: input.actor.userId,
        ...(verifiedAt ? { lastVerifiedAt: verifiedAt } : {}),
        ...(verifiedExecutionId ? { lastVerificationExecutionId: verifiedExecutionId } : {}),
      },
    });
    if (changed.count !== 1) throw new AIEmployeeLifecycleError('AI employee state changed during this request; reload and retry.', 409, 'CONCURRENT_UPDATE');
    const row = await transaction.aIEmployeeIdentity.findUniqueOrThrow({
      where: { id: employee.id },
      select: { id: true, employeeKey: true, status: true, lastVerifiedAt: true, lastVerificationExecutionId: true },
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        companyId: input.companyId,
        action: `ai_employee.${input.status}`,
        resource: 'ai-employee-identity',
        resourceId: employee.id,
        details: JSON.stringify(auditDetails),
      },
    });
    return row;
  });

  return updated;
}

async function verifyExecutionEvidence(input: { companyId: string; agentDbId: string; executionId: string }) {
  const execution = await db.agentExecution.findFirst({
    where: {
      id: input.executionId,
      companyId: input.companyId,
      assignedAgentId: input.agentDbId,
      status: 'completed',
      executionOutput: { not: null },
      completedAt: { not: null },
      agentRun: {
        is: {
          companyId: input.companyId,
          agentId: input.agentDbId,
          status: 'completed',
          model: { not: null },
          output: { not: null },
        },
      },
    },
    select: {
      id: true,
      companyId: true,
      assignedAgentId: true,
      executionOutput: true,
      reviewResult: true,
      startedAt: true,
      completedAt: true,
      agentRunId: true,
      agentRun: {
        select: { id: true, companyId: true, agentId: true, status: true, model: true, output: true, reviewResult: true },
      },
    },
  });

  const run = execution?.agentRun;
  if (!execution || !run || !execution.executionOutput?.trim() || !execution.completedAt || !run.model?.trim() || !run.output?.trim()) {
    throw new AIEmployeeLifecycleError('Execution evidence is incomplete, failed, or belongs to another company/agent.', 422, 'INVALID_EXECUTION_EVIDENCE');
  }
  const executionReview = parseRecord(execution.reviewResult);
  const runReview = parseRecord(run.reviewResult);
  if (execution.agentRunId !== run.id || executionReview.securityValidationPassed !== true || executionReview.heuristicValidationPassed !== true || runReview.securityValidationPassed !== true || runReview.heuristicValidationPassed !== true) {
    throw new AIEmployeeLifecycleError('Execution must have passed both deterministic and security quality checks.', 422, 'QUALITY_GATE_FAILED');
  }

  const usage = await db.modelUsageRecord.findFirst({
    where: {
      companyId: input.companyId,
      agentId: input.agentDbId,
      model: run.model,
      status: 'success',
      requestId: { startsWith: `${run.id}:model:` },
      outputTokens: { gt: 0 },
      usageSource: { in: ['provider_reported', 'locally_estimated'] },
      createdAt: { gte: execution.startedAt, lte: execution.completedAt },
    },
    select: { id: true },
  });
  if (!usage) {
    throw new AIEmployeeLifecycleError('No successful, attributable model-usage record supports this execution.', 422, 'MODEL_USAGE_EVIDENCE_MISSING');
  }

  return { executionId: execution.id, completedAt: execution.completedAt };
}

function parseRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
