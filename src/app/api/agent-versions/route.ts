import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * agent.versions — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  agentId: z.string().min(1),
  version: z.number().int().min(1),
  config: z.string().min(1),
  changeLog: z.string().optional(),
});

const updateSchema = z.object({
  config: z.string().min(1).optional(),
  changeLog: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'agent.versions',
  model: 'agentVersion',
  label: 'AgentVersion',
  // AgentVersion inherits tenant ownership through its parent Agent.
  tenantField: null,
  ownership: { delegate: 'agent', fk: 'agentId', relation: 'agent' },
  createSchema,
  updateSchema,
  searchFields: ['changeLog'],
  orderBy: { createdAt: 'desc' },
  sortableFields: ['id', 'agentId', 'version', 'createdAt'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
