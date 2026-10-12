import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * skill.versions — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  skillId: z.string().min(1),
  version: z.string().min(1),
  content: z.string().min(1),
});

const updateSchema = z.object({
  content: z.string().min(1).optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'skill.versions',
  model: 'skillVersion',
  label: 'SkillVersion',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['version'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
