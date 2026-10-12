import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * skill.permissions — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  skillId: z.string().min(1),
  roleId: z.string().optional(),
  accessLevel: z.string().default('use'),
});

const updateSchema = z.object({
  roleId: z.string().optional(),
  accessLevel: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'skill.permissions',
  model: 'skillPermission',
  label: 'SkillPermission',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['accessLevel'],
  writeRoles: ['super_admin', 'admin'],
});
