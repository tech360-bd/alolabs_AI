import { z } from 'zod';
import { db } from '@/lib/db';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * crm.activities — authenticated, authorised, tenant-scoped, audited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope: any authenticated user could
 * read and mutate every company's activities (CrmActivity.companyId).
 */

const dateOrNull = z
  .union([z.string(), z.date()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) throw new Error('scheduledAt must be a valid date');
    return date;
  });

export const createSchema = z
  .object({
    contactId: z.string().max(128).optional().nullable(),
    dealId: z.string().max(128).optional().nullable(),
    type: z.string().min(1).max(60),
    subject: z.string().min(1).max(200),
    description: z.string().max(4000).optional().nullable(),
    direction: z.string().max(40).optional().nullable(),
    status: z.string().max(40).optional(),
    scheduledAt: dateOrNull,
    durationMin: z.coerce.number().int().min(0).max(1440).optional().nullable(),
    assignedTo: z.string().max(120).optional().nullable(),
  })
  // Preserve the original contract: a scheduled activity is 'scheduled', an
  // unscheduled one is already 'completed' with completedAt set now.
  .transform((value) => ({
    ...value,
    status: value.status ?? (value.scheduledAt ? 'scheduled' : 'completed'),
    completedAt: value.scheduledAt ? null : new Date(),
  }));

export const updateSchema = z
  .object({
    contactId: z.string().max(128).optional().nullable(),
    dealId: z.string().max(128).optional().nullable(),
    type: z.string().min(1).max(60).optional(),
    subject: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).optional().nullable(),
    direction: z.string().max(40).optional().nullable(),
    status: z.string().max(40).optional(),
    scheduledAt: dateOrNull,
    durationMin: z.coerce.number().int().min(0).max(1440).optional().nullable(),
    assignedTo: z.string().max(120).optional().nullable(),
  });

export const filterSchema = z.object({
  type: z.string().max(60).optional(),
  contactId: z.string().max(128).optional(),
  dealId: z.string().max(128).optional(),
  status: z.string().max(40).optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'crm.activities',
  model: 'crmActivity',
  label: 'CrmActivity',
  tenantField: 'companyId',
  createSchema,
  updateSchema,
  filterSchema,
  searchFields: ['subject', 'description'],
  include: {
    contact: { select: { id: true, firstName: true, lastName: true, email: true } },
    deal: { select: { id: true, title: true } },
  },
  ownership: [
    { delegate: 'crmContact', fk: 'contactId', relation: 'contact' },
    { delegate: 'crmDeal', fk: 'dealId', relation: 'deal' },
  ],
  afterCreate: async (record) => {
    // Touch the parent contact's lastContactAt (original behaviour).
    const contactId = record.contactId as string | null | undefined;
    if (contactId) {
      await db.crmContact.update({ where: { id: contactId }, data: { lastContactAt: new Date() } });
    }
  },
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
