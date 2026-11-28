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
  // Global ModelRegistry health records; writes restricted to platform super_admin.
  tenantField: null,
  writeRoles: ['super_admin'],
  createSchema,
  updateSchema,
  searchFields: ['status'],
  orderBy: { lastCheckedAt: 'desc' },
  sortableFields: ['id', 'modelId', 'status', 'avgLatencyMs', 'errorRate', 'successRate', 'lastCheckedAt', 'createdAt'],
});
