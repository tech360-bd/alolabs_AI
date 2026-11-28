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
  // AgentStatusHistory inherits tenant ownership through its parent Agent.
  tenantField: null,
  ownership: { delegate: 'agent', fk: 'agentId', relation: 'agent' },
  createSchema,
  updateSchema,
  searchFields: ['fromStatus', 'toStatus', 'reason'],
  orderBy: { createdAt: 'desc' },
  sortableFields: ['id', 'agentId', 'fromStatus', 'toStatus', 'changedBy', 'createdAt'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
