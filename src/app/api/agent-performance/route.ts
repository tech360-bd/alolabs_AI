import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * agent.performance — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  agentId: z.string().min(1),
  period: z.string().default('daily'),
  successRate: z.number().default(0),
  errorRate: z.number().default(0),
  avgRuntimeMs: z.number().int().default(0),
  outputQualityScore: z.number().default(0),
  userCorrectionCount: z.number().int().default(0),
  blockedActionCount: z.number().int().default(0),
  approvalRequiredCount: z.number().int().default(0),
  productivityScore: z.number().default(0),
});

const updateSchema = z.object({
  agentId: z.string().min(1).optional(),
  period: z.string().optional(),
  successRate: z.number().optional(),
  errorRate: z.number().optional(),
  avgRuntimeMs: z.number().int().optional(),
  outputQualityScore: z.number().optional(),
  userCorrectionCount: z.number().int().optional(),
  blockedActionCount: z.number().int().optional(),
  approvalRequiredCount: z.number().int().optional(),
  productivityScore: z.number().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'agent.performance',
  model: 'agentPerformanceScore',
  label: 'AgentPerformanceScore',
  // AgentPerformanceScore inherits tenant ownership through its Agent.
  tenantField: null,
  ownership: { delegate: 'agent', fk: 'agentId' },
  createSchema,
  updateSchema,
  searchFields: ['period'],
  orderBy: { calculatedAt: 'desc' },
  sortableFields: [
    'id',
    'agentId',
    'period',
    'successRate',
    'errorRate',
    'avgRuntimeMs',
    'outputQualityScore',
    'userCorrectionCount',
    'blockedActionCount',
    'approvalRequiredCount',
    'productivityScore',
    'calculatedAt',
  ],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
