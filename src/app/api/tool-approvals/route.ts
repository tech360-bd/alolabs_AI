import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * tool.approvals — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  toolName: z.string().min(1),
  reason: z.string().optional(),
  riskLevel: z.string().default('medium'),
  status: z.string().default('pending'),
});

const updateSchema = z.object({
  toolName: z.string().min(1).optional(),
  reason: z.string().optional(),
  riskLevel: z.string().optional(),
  status: z.string().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'tool.approvals',
  model: 'toolApprovalRequest',
  label: 'ToolApprovalRequest',
  // Legacy global table with no tenant key; restricted to super_admin.
  tenantField: null,
  requireTenant: false,
  roles: ['super_admin'],
  writeRoles: ['super_admin'],
  createSchema,
  updateSchema,
  searchFields: ['toolName', 'reason', 'status'],
  orderBy: { createdAt: 'desc' },
  sortableFields: ['id', 'toolName', 'riskLevel', 'status', 'createdAt'],
});
