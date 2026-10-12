import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * tool.runs — authenticated, authorised, audited and rate limited.
 *
 * Replaces a hand-written route that verified a session token inline but
 * applied no role check and no tenant scope to the queries below.
 */

const createSchema = z.object({
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  toolName: z.string().min(1),
  toolCategory: z.string().min(1),
  input: z.string().default('{}'),
  output: z.string().optional(),
  status: z.string().default('success'),
  durationMs: z.number().optional(),
  blocked: z.boolean().default(false),
  blockReason: z.string().optional(),
});

const updateSchema = z.object({
  taskId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  toolName: z.string().min(1).optional(),
  toolCategory: z.string().min(1).optional(),
  input: z.string().optional(),
  output: z.string().nullable().optional(),
  status: z.string().optional(),
  durationMs: z.number().nullable().optional(),
  blocked: z.boolean().optional(),
  blockReason: z.string().nullable().optional(),
});

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'tool.runs',
  model: 'toolRun',
  label: 'ToolRun',
  // This table has no tenant column of its own — see the security report.
  tenantField: null,
  createSchema,
  updateSchema,
  searchFields: ['toolName', 'toolCategory', 'status'],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
