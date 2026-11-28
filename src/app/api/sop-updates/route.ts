import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * admin.sop-updates — authenticated, authorised, tenant-scoped, audited and rate limited.
 */

const createSchema = z.object({
  departmentId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  reason: z.string().optional(),
  status: z.string().default('suggested'),
  suggestedBy: z.string().optional(),
  approvedBy: z.string().optional(),
});

const updateSchema = z.object({
  departmentId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  reason: z.string().optional(),
  status: z.string().optional(),
  suggestedBy: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'admin.sop-updates',
  model: 'sOPUpdate',
  label: 'SOPUpdate',
  tenantField: null,
  ownership: { delegate: 'department', fk: 'departmentId' },
  createSchema,
  updateSchema,
  searchFields: ['title', 'content', 'reason'],
  orderBy: { createdAt: 'desc' },
  sortableFields: ['id', 'departmentId', 'title', 'status', 'suggestedBy', 'approvedBy', 'createdAt', 'updatedAt'],
  writeRoles: ['super_admin', 'admin'],
});
