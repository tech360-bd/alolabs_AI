import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * Legacy improvement requests are global because WorkflowImprovementRequest
 * has no tenant key. Until tenant attribution is migrated, every operation is
 * restricted to Super Admin; company users must not see cross-company rows.
 */
const createSchema = z.object({
  workflowId: z.string().min(1).max(191).optional().nullable(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).optional().nullable(),
  status: z.literal('pending').default('pending'),
}).strict();

const updateSchema = z.object({
  workflowId: z.string().min(1).max(191).optional().nullable(),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(10_000).optional().nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'implemented']).optional(),
}).strict();

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'workflow.improvements',
  model: 'workflowImprovementRequest',
  label: 'WorkflowImprovementRequest',
  tenantField: null,
  requireTenant: false,
  roles: ['super_admin'],
  writeRoles: ['super_admin'],
  createSchema,
  updateSchema,
  searchFields: ['title', 'description'],
});
