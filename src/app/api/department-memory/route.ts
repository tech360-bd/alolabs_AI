import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * department.memory — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  departmentId: z.string().min(1),
  category: z.string().default('general'),
  content: z.string().min(1),
  temperature: z.string().default('warm'),
});

const updateSchema = z.object({
  category: z.string().optional(),
  content: z.string().min(1).optional(),
  temperature: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'department.memory',
  model: 'departmentMemory',
  label: 'DepartmentMemory',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['category', 'content'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
