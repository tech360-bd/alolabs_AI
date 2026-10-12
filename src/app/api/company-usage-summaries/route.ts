import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * company.usage-summaries — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  companyId: z.string().min(1),
  period: z.string().default('daily'),
  totalRequests: z.number().int().default(0),
  totalTokensUsed: z.number().int().default(0),
  totalCostEstimate: z.number().default(0),
  paidApiUsed: z.number().int().default(0),
  blockedCount: z.number().int().default(0),
  approvalRequired: z.number().int().default(0),
});

const updateSchema = z.object({
  companyId: z.string().min(1).optional(),
  period: z.string().optional(),
  totalRequests: z.number().int().optional(),
  totalTokensUsed: z.number().int().optional(),
  totalCostEstimate: z.number().optional(),
  paidApiUsed: z.number().int().optional(),
  blockedCount: z.number().int().optional(),
  approvalRequired: z.number().int().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'company.usage-summaries',
  model: 'companyUsageSummary',
  label: 'CompanyUsageSummary',
  createSchema,
  updateSchema,
  searchFields: ['period'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
