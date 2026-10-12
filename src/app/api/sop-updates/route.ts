import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * admin.sop-updates — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  departmentId: z.string().optional(),
  title: z.string().min(1),
  content: z.string().min(1),
  reason: z.string().optional(),
  status: z.string().default('suggested'),
  suggestedBy: z.string().optional(),
  approvedBy: z.string().optional(),
});

const updateSchema = z.object({
  departmentId: z.string().nullable().optional(),
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
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['title', 'content', 'reason'],
  writeRoles: ['super_admin', 'admin'],
});
