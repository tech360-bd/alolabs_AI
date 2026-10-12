import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * rag.feedback — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  queryId: z.string().min(1),
  companyId: z.string().optional(),
  rating: z.string().min(1),
  comment: z.string().optional(),
});

const updateSchema = z.object({
  queryId: z.string().min(1).optional(),
  companyId: z.string().nullable().optional(),
  rating: z.string().min(1).optional(),
  comment: z.string().nullable().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'rag.feedback',
  model: 'ragFeedback',
  label: 'RagFeedback',
  createSchema,
  updateSchema,
  searchFields: ['rating', 'comment'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
