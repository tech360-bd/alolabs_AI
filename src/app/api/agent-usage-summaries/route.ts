import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * agent.usage-summaries — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  agentId: z.string().min(1),
  period: z.string().default('daily'),
  totalRuns: z.number().int().default(0),
  successCount: z.number().int().default(0),
  failureCount: z.number().int().default(0),
  avgRuntimeMs: z.number().int().default(0),
  totalTokensUsed: z.number().int().default(0),
});

const updateSchema = z.object({
  agentId: z.string().min(1).optional(),
  period: z.string().optional(),
  totalRuns: z.number().int().optional(),
  successCount: z.number().int().optional(),
  failureCount: z.number().int().optional(),
  avgRuntimeMs: z.number().int().optional(),
  totalTokensUsed: z.number().int().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'agent.usage-summaries',
  model: 'agentUsageSummary',
  label: 'AgentUsageSummary',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['period'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
