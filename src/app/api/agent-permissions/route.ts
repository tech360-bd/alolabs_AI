import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * agent.permissions — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  agentId: z.string().min(1),
  resourceId: z.string().min(1),
  accessLevel: z.string().default('read'),
});

const updateSchema = z.object({
  resourceId: z.string().min(1).optional(),
  accessLevel: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'agent.permissions',
  model: 'agentPermission',
  label: 'AgentPermission',
  // AgentPermission inherits tenant ownership through its parent Agent.
  tenantField: null,
  ownership: { delegate: 'agent', fk: 'agentId', relation: 'agent' },
  createSchema,
  updateSchema,
  searchFields: ['resourceId', 'accessLevel'],
  orderBy: { createdAt: 'desc' },
  sortableFields: ['id', 'agentId', 'resourceId', 'accessLevel', 'createdAt'],
  writeRoles: ['super_admin', 'admin'],
});
