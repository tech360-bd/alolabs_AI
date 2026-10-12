import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * workflow.improvements — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  workflowId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.string().default('pending'),
});

const updateSchema = z.object({
  workflowId: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'workflow.improvements',
  model: 'workflowImprovementRequest',
  label: 'WorkflowImprovementRequest',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['title', 'description'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
