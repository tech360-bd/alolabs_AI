import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';
import { workflowOwnershipSpec } from '@/lib/api/workflow-ownership';

/**
 * admin.model-assignments — authenticated, authorised, tenant-scoped, audited and rate limited.
 */

const createSchema = z
  .object({
    agentId: z.string().min(1).optional(),
    workflowId: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    modelId: z.string().min(1),
    reason: z.string().optional(),
    assignedBy: z.string().optional(),
  })
  .refine((data) => Boolean(data.agentId || data.workflowId || data.taskId), {
    message: 'At least one of agentId, workflowId, or taskId is required',
  });

const updateSchema = z.object({
  agentId: z.string().min(1).nullable().optional(),
  workflowId: z.string().min(1).nullable().optional(),
  taskId: z.string().min(1).nullable().optional(),
  modelId: z.string().min(1).optional(),
  reason: z.string().optional(),
  assignedBy: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'admin.model-assignments',
  model: 'modelAssignment',
  label: 'ModelAssignment',
  tenantField: null,
  ownershipMode: 'any',
  ownership: [
    { delegate: 'agent', fk: 'agentId' },
    { delegate: 'task', fk: 'taskId' },
    workflowOwnershipSpec({ fk: 'workflowId' }),
  ],
  createSchema,
  updateSchema,
  searchFields: ['reason'],
  orderBy: { createdAt: 'desc' },
  sortableFields: ['id', 'agentId', 'workflowId', 'taskId', 'modelId', 'assignedBy', 'createdAt'],
  writeRoles: ['super_admin', 'admin'],
});
