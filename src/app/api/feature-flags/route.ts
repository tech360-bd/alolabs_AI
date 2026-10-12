import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * admin.feature-flags — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().default(false),
  environment: z.string().default('production'),
  rolloutPercentage: z.number().int().min(0).max(100).default(100),
  createdBy: z.string().optional(),
});

const updateSchema = z.object({
  key: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  environment: z.string().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'admin.feature-flags',
  model: 'featureFlag',
  label: 'FeatureFlag',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['key', 'name', 'description'],
  writeRoles: ['super_admin', 'admin'],
});
