import { z } from 'zod';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * tool.runs — authenticated, authorised, tenant-scoped, audited and rate limited.
 *
 * ToolRun inherits tenancy from its parent Task and/or Agent. Every supplied
 * parent reference must belong to the caller's tenant and at least one parent
 * reference is required.
 */

const createSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    toolName: z.string().min(1),
    toolCategory: z.string().min(1),
    input: z.string().default('{}'),
    output: z.string().optional(),
    status: z.string().default('success'),
    durationMs: z.number().optional(),
    blocked: z.boolean().default(false),
    blockReason: z.string().optional(),
  })
  .refine((data) => Boolean(data.taskId || data.agentId), {
    message: 'Either taskId or agentId is required',
  });

const updateSchema = z.object({
  taskId: z.string().min(1).nullable().optional(),
  agentId: z.string().min(1).nullable().optional(),
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
  tenantField: null,
  ownershipMode: 'any',
  ownership: [
    { delegate: 'task', fk: 'taskId' },
    { delegate: 'agent', fk: 'agentId' },
  ],
  createSchema,
  updateSchema,
  searchFields: ['toolName', 'toolCategory', 'status'],
  orderBy: { createdAt: 'desc' },
  sortableFields: [
    'id',
    'taskId',
    'agentId',
    'toolName',
    'toolCategory',
    'status',
    'durationMs',
    'blocked',
    'createdAt',
  ],
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
