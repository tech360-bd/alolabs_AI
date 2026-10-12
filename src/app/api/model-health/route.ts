import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * model.health — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  modelId: z.string().min(1),
  status: z.string().default('unknown'),
  avgLatencyMs: z.number().default(0),
  errorRate: z.number().default(0),
  successRate: z.number().default(0),
});

const updateSchema = z.object({
  modelId: z.string().min(1).optional(),
  status: z.string().optional(),
  avgLatencyMs: z.number().optional(),
  errorRate: z.number().optional(),
  successRate: z.number().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'model.health',
  model: 'modelHealth',
  label: 'ModelHealth',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['status'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
