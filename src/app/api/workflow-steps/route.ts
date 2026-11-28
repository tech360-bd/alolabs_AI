import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';
import { workflowOwnershipSpec } from '@/lib/api/workflow-ownership';

/**
 * workflow.steps — authenticated, authorised, tenant-scoped, audited and rate limited.
 *
 * WorkflowStep inherits tenancy through its parent Workflow
 * (via Department.companyId or WorkflowPermission).
 */

const createSchema = z.object({
  workflowId: z.string().min(1),
  stepNumber: z.number().int().min(0),
  agentId: z.string().optional(),
  skillId: z.string().optional(),
  action: z.string().min(1),
  config: z.string().default('{}'),
});

const updateSchema = z.object({
  workflowId: z.string().min(1).optional(),
  stepNumber: z.number().int().min(0).optional(),
  agentId: z.string().nullable().optional(),
  skillId: z.string().nullable().optional(),
  action: z.string().min(1).optional(),
  config: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'workflow.steps',
  model: 'workflowStep',
  label: 'WorkflowStep',
  tenantField: null,
  ownership: workflowOwnershipSpec({ relation: 'workflow' }),
  createSchema,
  updateSchema,
  searchFields: ['action'],
  orderBy: { stepNumber: 'asc' },
  sortableFields: ['id', 'workflowId', 'stepNumber', 'agentId', 'skillId', 'action', 'createdAt'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
