import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * admin.model-assignments — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  agentId: z.string().optional(),
  workflowId: z.string().optional(),
  taskId: z.string().optional(),
  modelId: z.string().min(1),
  reason: z.string().optional(),
  assignedBy: z.string().optional(),
});

const updateSchema = z.object({
  agentId: z.string().nullable().optional(),
  workflowId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  modelId: z.string().min(1).optional(),
  reason: z.string().optional(),
  assignedBy: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'admin.model-assignments',
  model: 'modelAssignment',
  label: 'ModelAssignment',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['reason'],
  writeRoles: ['super_admin', 'admin'],
});
