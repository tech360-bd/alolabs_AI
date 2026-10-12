import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * workflow.steps — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
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
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['action'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
