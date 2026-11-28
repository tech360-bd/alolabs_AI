import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * automation.suggestions — authenticated, authorised, tenant-scoped, audited and rate limited.
 *
 * Scoped through the owning Department so each tenant sees and manages only
 * its own department suggestions.
 */

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  departmentId: z.string().min(1),
  frequency: z.string().optional(),
  status: z.string().default('suggested'),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  departmentId: z.string().min(1).optional(),
  frequency: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'automation.suggestions',
  model: 'automationSuggestion',
  label: 'AutomationSuggestion',
  tenantField: null,
  ownership: { delegate: 'department', fk: 'departmentId' },
  createSchema,
  updateSchema,
  searchFields: ['title', 'description'],
  orderBy: { createdAt: 'desc' },
  sortableFields: ['id', 'title', 'departmentId', 'frequency', 'status', 'createdAt', 'updatedAt'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
