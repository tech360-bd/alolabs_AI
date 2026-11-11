import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * crm.contacts — authenticated, authorised, tenant-scoped, audited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope: any authenticated user could
 * read and mutate every company's contacts (CrmContact.companyId).
 */

/** Coerce a tags/metadata payload to a JSON string (or undefined). */
const jsonString = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return typeof value === 'string' ? value.slice(0, max) : JSON.stringify(value).slice(0, max);
    });

export const createSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(60).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  jobTitle: z.string().max(160).optional().nullable(),
  source: z.string().max(60).optional(),
  status: z.string().max(40).optional(),
  tags: jsonString(400),
  metadata: jsonString(4000),
  assignedTo: z.string().max(120).optional().nullable(),
});

export const updateSchema = createSchema.partial();

export const filterSchema = z.object({
  status: z.string().max(40).optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'crm.contacts',
  model: 'crmContact',
  label: 'CrmContact',
  tenantField: 'companyId',
  createSchema,
  updateSchema,
  filterSchema,
  searchFields: ['firstName', 'lastName', 'email', 'company'],
  include: { _count: { select: { deals: true, activities: true, notes: true } } },
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
