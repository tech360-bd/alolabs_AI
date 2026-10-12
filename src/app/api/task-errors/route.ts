import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * task.errors — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  taskId: z.string().min(1),
  stepId: z.string().optional(),
  agentId: z.string().optional(),
  errorCode: z.string().optional(),
  message: z.string().min(1),
  stack: z.string().optional(),
  severity: z.string().default('error'),
});

const updateSchema = z.object({
  stepId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  errorCode: z.string().optional(),
  message: z.string().min(1).optional(),
  stack: z.string().optional(),
  severity: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'task.errors',
  model: 'taskError',
  label: 'TaskError',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['errorCode', 'message', 'severity'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
