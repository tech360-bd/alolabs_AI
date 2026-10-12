import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * crm.notes — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  contactId: z.string().min(1),
  content: z.string().min(1),
  createdBy: z.string().optional(),
});

const updateSchema = z.object({
  contactId: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  createdBy: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'crm.notes',
  model: 'crmNote',
  label: 'CrmNote',
  tenantField: null,
  ownership: { delegate: 'crmContact', fk: 'contactId', relation: 'contact' },
  createSchema,
  updateSchema,
  searchFields: ['content'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
