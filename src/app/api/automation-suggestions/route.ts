import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * automation.suggestions — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  departmentId: z.string().optional(),
  frequency: z.string().optional(),
  status: z.string().default('suggested'),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  frequency: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'automation.suggestions',
  model: 'automationSuggestion',
  label: 'AutomationSuggestion',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['title', 'description'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
