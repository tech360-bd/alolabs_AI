import type { PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import type {
  AIEmployeeAgentRecord,
  AIEmployeeStore,
  AIEmployeeVerificationRecord,
  StoredAIEmployeeIdentity,
} from './employee-identities';

const LOOKUP_CHUNK = 400;
const WRITE_CHUNK = 200;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
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

export function createPrismaAIEmployeeStore(client: PrismaClient = db): AIEmployeeStore {
  return {
    async findAgents(companyId, agentKeys) {
      const rows: AIEmployeeAgentRecord[] = [];
      for (const keyChunk of chunks([...new Set(agentKeys)], LOOKUP_CHUNK)) {
        const found = await client.agent.findMany({
          where: { companyId, agentId: { in: keyChunk } },
          select: {
            id: true,
            agentId: true,
            companyId: true,
            departmentId: true,
            runtimeProfile: true,
            department: { select: { slug: true, companyId: true } },
          },
        });
        rows.push(...found.map((row) => ({
          id: row.id,
          agentKey: row.agentId,
          companyId: row.companyId,
          departmentId: row.departmentId,
          departmentSlug: row.department?.slug ?? null,
          departmentCompanyId: row.department?.companyId ?? null,
          runtimeProfile: row.runtimeProfile,
        })));
      }
      return rows;
    },

    async findEmployees(companyId, employeeKeys, agentDbIds) {
      const rows = new Map<string, StoredAIEmployeeIdentity>();
      for (const keyChunk of chunks([...new Set(employeeKeys)], LOOKUP_CHUNK)) {
        if (keyChunk.length === 0) continue;
        const found = await client.aIEmployeeIdentity.findMany({
          where: { companyId, employeeKey: { in: keyChunk } },
          select: {
            id: true,
            employeeKey: true,
            companyId: true,
            departmentId: true,
            agentDbId: true,
            status: true,
            managedBy: true,
            configurationHash: true,
          },
        });
        for (const row of found) rows.set(row.id, row);
      }
      for (const idChunk of chunks([...new Set(agentDbIds)], LOOKUP_CHUNK)) {
        if (idChunk.length === 0) continue;
        const found = await client.aIEmployeeIdentity.findMany({
          where: { companyId, agentDbId: { in: idChunk } },
          select: {
            id: true,
            employeeKey: true,
            companyId: true,
            departmentId: true,
            agentDbId: true,
            status: true,
            managedBy: true,
            configurationHash: true,
          },
        });
        for (const row of found) rows.set(row.id, row);
      }
      return [...rows.values()];
    },

    async listEmployees(companyId) {
      const rows = await client.aIEmployeeIdentity.findMany({
        where: { companyId },
        include: {
          agent: { select: { agentId: true, companyId: true, departmentId: true, runtimeProfile: true } },
          department: { select: { slug: true, companyId: true } },
          verificationExecution: {
            select: {
              id: true,
              companyId: true,
              assignedAgentId: true,
              status: true,
              executionOutput: true,
              reviewResult: true,
              startedAt: true,
              completedAt: true,
              agentRunId: true,
              agentRun: {
                select: { id: true, agentId: true, companyId: true, status: true, model: true, output: true, reviewResult: true },
              },
            },
          },
        },
        orderBy: { employeeKey: 'asc' },
      });

      const evidencePairs = rows.flatMap((row) => {
        const execution = row.verificationExecution;
        const run = execution?.agentRun;
        if (row.status !== 'tested' && row.status !== 'active') return [];
        if (!execution || !run || execution.id !== row.lastVerificationExecutionId) return [];
        if (execution.status !== 'completed' || execution.companyId !== companyId || execution.assignedAgentId !== row.agentDbId) return [];
        if (!execution.executionOutput?.trim() || !execution.completedAt || execution.agentRunId !== run.id) return [];
        if (run.status !== 'completed' || run.companyId !== companyId || run.agentId !== row.agentDbId || !run.model?.trim() || !run.output?.trim()) return [];
        const executionReview = parseRecord(execution.reviewResult);
        const runReview = parseRecord(run.reviewResult);
        if (executionReview.securityValidationPassed !== true || executionReview.heuristicValidationPassed !== true) return [];
        if (runReview.securityValidationPassed !== true || runReview.heuristicValidationPassed !== true) return [];
        return [{ employeeId: row.id, agentDbId: row.agentDbId, agentRunId: run.id, model: run.model, startedAt: execution.startedAt, completedAt: execution.completedAt }];
      });

      const usageRows: Array<{ agentId: string | null; model: string | null; requestId: string | null; createdAt: Date }> = [];
      for (const pairChunk of chunks(evidencePairs, 60)) {
        const found = await client.modelUsageRecord.findMany({
          where: {
            companyId,
            status: 'success',
            outputTokens: { gt: 0 },
            usageSource: { in: ['provider_reported', 'locally_estimated'] },
            OR: pairChunk.map((pair) => ({
              agentId: pair.agentDbId,
              model: pair.model,
              requestId: { startsWith: `${pair.agentRunId}:model:` },
              createdAt: { gte: pair.startedAt, lte: pair.completedAt },
            })),
          },
          select: { agentId: true, model: true, requestId: true, createdAt: true },
        });
        usageRows.push(...found);
      }
      const verified = new Set<string>();
      for (const pair of evidencePairs) {
        if (usageRows.some((usage) => usage.agentId === pair.agentDbId && usage.model === pair.model && usage.requestId?.startsWith(`${pair.agentRunId}:model:`) && usage.createdAt >= pair.startedAt && usage.createdAt <= pair.completedAt)) {
          verified.add(pair.employeeId);
        }
      }

      return rows.map((row): AIEmployeeVerificationRecord => {
        const provisioning = parseRecord(row.agent?.runtimeProfile ?? '{}').provisioning;
        const agentProvisioning = provisioning && typeof provisioning === 'object' && !Array.isArray(provisioning)
          ? provisioning as Record<string, unknown>
          : {};
        return {
          id: row.id,
          employeeKey: row.employeeKey,
          companyId: row.companyId,
          departmentId: row.departmentId,
          agentDbId: row.agentDbId,
          roleKey: row.roleKey,
          title: row.title,
          status: row.status,
          managedBy: row.managedBy,
          planVersion: row.planVersion,
          configurationHash: row.configurationHash,
          supervisorEmployeeKey: row.supervisorEmployeeKey,
          lastVerifiedAt: row.lastVerifiedAt,
          lastVerificationExecutionId: row.lastVerificationExecutionId,
          agentKey: row.agent?.agentId ?? null,
          agentCompanyId: row.agent?.companyId ?? null,
          agentDepartmentId: row.agent?.departmentId ?? null,
          agentDepartmentSlug: row.department?.slug ?? null,
          agentDepartmentCompanyId: row.department?.companyId ?? null,
          agentManagedBy: typeof agentProvisioning.managedBy === 'string' ? agentProvisioning.managedBy : null,
          executionEvidenceValid: verified.has(row.id),
        };
      });
    },

    async applyChanges({ companyId, actorUserId, create, update }) {
      await client.$transaction(async (transaction) => {
        const auditRows: Array<{
          companyId: string;
          actorUserId: string;
          action: string;
          resource: string;
          resourceId: string;
          details: string;
        }> = [];

        for (const createChunk of chunks(create, WRITE_CHUNK)) {
          await transaction.aIEmployeeIdentity.createMany({
            data: createChunk.map((row) => ({ ...row, status: 'provisioned' })),
          });
          auditRows.push(...createChunk.map((row) => ({
            companyId,
            actorUserId,
            action: 'ai_employee.provisioned',
            resource: 'ai-employee-identity',
            resourceId: row.employeeKey,
            details: JSON.stringify({
              employeeKey: row.employeeKey,
              agentDbId: row.agentDbId,
              departmentId: row.departmentId,
              configurationHash: row.configurationHash,
              planVersion: row.planVersion,
              status: 'provisioned',
            }),
          })));
        }

        for (const change of update) {
          await transaction.aIEmployeeIdentity.update({ where: { id: change.id, companyId }, data: change.data });
          auditRows.push({
            companyId,
            actorUserId,
            action: 'ai_employee.configuration_updated',
            resource: 'ai-employee-identity',
            resourceId: change.id,
            details: JSON.stringify({ configurationHash: change.data.configurationHash, planVersion: change.data.planVersion }),
          });
        }

        for (const auditChunk of chunks(auditRows, WRITE_CHUNK)) {
          await transaction.auditEvent.createMany({ data: auditChunk });
        }
      });
    },
  };
}
