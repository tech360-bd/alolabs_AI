import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * company.memory — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  companyId: z.string().min(1),
  category: z.string().default('general'),
  content: z.string().min(1),
});

const updateSchema = z.object({
  category: z.string().optional(),
  content: z.string().min(1).optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'company.memory',
  model: 'companyMemory',
  label: 'CompanyMemory',
  createSchema,
  updateSchema,
  searchFields: ['category', 'content'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
