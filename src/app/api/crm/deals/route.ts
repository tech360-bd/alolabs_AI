import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * crm.deals — authenticated, authorised, tenant-scoped, audited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope: any authenticated user could
 * read and mutate every company's deals (CrmDeal.companyId).
 */

/** Accept an ISO string / date string or null and always yield Date | null. */
const dateOrNull = z
  .union([z.string(), z.date()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) throw new Error('expectedClose must be a valid date');
    return date;
  });

export const createSchema = z.object({
  contactId: z.string().min(1).max(128),
  pipelineId: z.string().min(1).max(128),
  stageId: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  value: z.coerce.number().min(0).max(1e12).optional(),
  currency: z.string().length(3).optional(),
  probability: z.coerce.number().min(0).max(100).optional(),
  expectedClose: dateOrNull,
  assignedTo: z.string().max(120).optional().nullable(),
  status: z.string().max(40).optional(),
});

export const updateSchema = createSchema.partial();

export const filterSchema = z.object({
  pipelineId: z.string().max(128).optional(),
  stageId: z.string().max(128).optional(),
  status: z.string().max(40).optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'crm.deals',
  model: 'crmDeal',
  label: 'CrmDeal',
  tenantField: 'companyId',
  createSchema,
  updateSchema,
  filterSchema,
  searchFields: ['title', 'contact.firstName', 'contact.lastName', 'contact.email'],
  include: {
    contact: { select: { id: true, firstName: true, lastName: true, email: true } },
    pipeline: { select: { id: true, name: true } },
    stage: { select: { id: true, name: true, color: true } },
  },
  // A deal inherits its tenancy from its own companyId column, but both
  // referenced parents must also belong to the caller's tenant.
  ownership: [
    { delegate: 'crmContact', fk: 'contactId', relation: 'contact' },
    { delegate: 'crmPipeline', fk: 'pipelineId', relation: 'pipeline' },
  ],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
