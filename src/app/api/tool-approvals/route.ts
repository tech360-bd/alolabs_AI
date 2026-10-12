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
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['toolName', 'reason', 'status'],
  writeRoles: ['super_admin', 'admin'],
});
