import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';
import { workflowOwnershipSpec } from '@/lib/api/workflow-ownership';

/**
 * workflow.usage-summaries — authenticated, authorised, tenant-scoped, audited and rate limited.
 */

const createSchema = z.object({
  workflowId: z.string().min(1),
  period: z.string().default('daily'),
  totalRuns: z.number().int().default(0),
  successCount: z.number().int().default(0),
  failureCount: z.number().int().default(0),
  avgDurationMs: z.number().int().default(0),
});

const updateSchema = z.object({
  workflowId: z.string().min(1).optional(),
  period: z.string().optional(),
  totalRuns: z.number().int().optional(),
  successCount: z.number().int().optional(),
  failureCount: z.number().int().optional(),
  avgDurationMs: z.number().int().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'workflow.usage-summaries',
  model: 'workflowUsageSummary',
  label: 'WorkflowUsageSummary',
  tenantField: null,
  ownership: workflowOwnershipSpec(),
  createSchema,
  updateSchema,
  searchFields: ['period'],
  orderBy: { calculatedAt: 'desc' },
  sortableFields: [
    'id',
    'workflowId',
    'period',
    'totalRuns',
    'successCount',
    'failureCount',
    'avgDurationMs',
    'calculatedAt',
  ],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
