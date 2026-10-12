import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * agent.status-history — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  agentId: z.string().min(1),
  fromStatus: z.string().min(1),
  toStatus: z.string().min(1),
  reason: z.string().optional(),
  changedBy: z.string().optional(),
});

const updateSchema = z.object({
  fromStatus: z.string().min(1).optional(),
  toStatus: z.string().min(1).optional(),
  reason: z.string().optional(),
  changedBy: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'agent.status-history',
  model: 'agentStatusHistory',
  label: 'AgentStatusHistory',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['fromStatus', 'toStatus', 'reason'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
