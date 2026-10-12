import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * agent.company-access — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  agentId: z.string().min(1),
  companyId: z.string().min(1),
  accessLevel: z.string().default('full'),
  grantedBy: z.string().optional(),
});

const updateSchema = z.object({
  agentId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  accessLevel: z.string().optional(),
  grantedBy: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'agent.company-access',
  model: 'agentCompanyAccess',
  label: 'AgentCompanyAccess',
  createSchema,
  updateSchema,
  searchFields: ['accessLevel'],
  writeRoles: ['super_admin', 'admin'],
});
