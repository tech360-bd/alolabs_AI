import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * skill.validation-logs — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  skillId: z.string().min(1),
  status: z.string().min(1),
  reason: z.string().optional(),
  checkedBy: z.string().optional(),
});

const updateSchema = z.object({
  status: z.string().min(1).optional(),
  reason: z.string().optional(),
  checkedBy: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'skill.validation-logs',
  model: 'skillValidationLog',
  label: 'SkillValidationLog',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['status', 'reason'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
