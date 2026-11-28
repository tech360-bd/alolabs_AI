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
  // Global skill validation audit log; restricted to platform super_admin.
  tenantField: null,
  requireTenant: false,
  roles: ['super_admin'],
  writeRoles: ['super_admin'],
  createSchema,
  updateSchema,
  searchFields: ['status', 'reason'],
  orderBy: { createdAt: 'desc' },
  sortableFields: ['id', 'skillId', 'status', 'checkedBy', 'createdAt'],
});
