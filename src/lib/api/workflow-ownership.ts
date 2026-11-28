/**
 * Tenant ownership specification for models attached to a `Workflow`
 * (e.g. `WorkflowStep`, `WorkflowUsageSummary`, `ModelAssignment`).
 *
 * A `Workflow` does not carry a `companyId` column directly; a tenant owns or
 * can access a workflow either via its `Department.companyId` or via an
 * explicit `WorkflowPermission` row (`accessLevel` determines read vs write).
 */

import { db } from '@/lib/db';
import type { OwnershipSpec } from '@/lib/api/secure-crud';

const WRITABLE_ACCESS_LEVELS = new Set(['write', 'execute', 'full', 'admin']);

export function workflowOwnershipSpec(options: {
  fk?: string;
  relation?: string;
} = {}): OwnershipSpec {
  const fk = options.fk ?? 'workflowId';
  const relation = options.relation;

  return {
    delegate: 'workflow',
    fk,
    ...(relation ? { relation } : {}),
    readWhere: async (companyId: string) => {
      const depts = await db.department.findMany({
        where: { companyId },
        select: { id: true },
      });
      const deptIds = depts.map((d) => d.id);
      const workflowFilter = {
        OR: [
          { workflowPermissions: { some: { companyId } } },
          ...(deptIds.length > 0 ? [{ departmentId: { in: deptIds } }] : []),
        ],
      };
      if (relation) {
        return { [relation]: workflowFilter };
      }
      const workflows = await db.workflow.findMany({
        where: workflowFilter,
        select: { id: true },
      });
      return { [fk]: { in: workflows.map((w) => w.id) } };
    },
    verifyParent: async (workflowId: string, companyId: string, mode: 'read' | 'write') => {
      const workflow = await db.workflow.findUnique({
        where: { id: workflowId },
        select: {
          id: true,
          departmentId: true,
          workflowPermissions: {
            where: { companyId },
            select: { accessLevel: true },
          },
        },
      });
      if (!workflow) return 'not_found';

      if (workflow.departmentId) {
        const dept = await db.department.findUnique({
          where: { id: workflow.departmentId },
          select: { companyId: true },
        });
        if (dept?.companyId === companyId) return true;
      }

      if (mode === 'read') {
        return workflow.workflowPermissions.length > 0;
      }
      return workflow.workflowPermissions.some((perm) =>
        WRITABLE_ACCESS_LEVELS.has(perm.accessLevel),
      );
    },
  };
}
