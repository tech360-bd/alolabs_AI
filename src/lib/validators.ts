/**
 * Centralized Zod Validation Schemas
 *
 * Provides reusable schemas for common patterns across all API routes.
 * Uses Zod 4 API (z.string(), z.object(), etc.).
 */

import { z } from 'zod';

// ─── Common Field Schemas ─────────────────────────────────────────────────────

export const schemas = {
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  email: z.string().email().max(255),
  description: z.string().max(10000).optional(),
  status: z.enum(['active', 'inactive', 'draft', 'archived', 'pending', 'suspended']),
  booleanField: z.boolean().optional(),
  jsonField: z.record(z.string(), z.unknown()).optional(),
  stringArray: z.array(z.string()).optional(),

  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().optional(),

  // Common IDs
  companyId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
};

// ─── Pagination Query Schema ──────────────────────────────────────────────────

export const paginationQuery = z.object({
  page: schemas.page,
  limit: schemas.limit,
  sort: schemas.sort,
  order: schemas.order,
  search: schemas.search,
});

export type PaginationQuery = z.infer<typeof paginationQuery>;

// ─── Parse Helpers ─────────────────────────────────────────────────────────────

/** Parse request body against a Zod schema. Returns parsed data or null with error response. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): { data: T; error: null } | { data: null; error: { status: number; message: string } } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { data: result.data, error: null };
  }
  const firstIssue = result.error.issues[0];
  const message = firstIssue
    ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
    : 'Invalid request body';
  return { data: null, error: { status: 400, message } };
}

/** Parse URL search params against a Zod schema. */
export function parseQuery<T>(schema: z.ZodType<T>, searchParams: URLSearchParams): { data: T; error: null } | { data: null; error: { status: number; message: string } } {
  const obj = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(obj);
  if (result.success) {
    return { data: result.data, error: null };
  }
  const firstIssue = result.error.issues[0];
  const message = firstIssue
    ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
    : 'Invalid query parameters';
  return { data: null, error: { status: 400, message } };
}

/** Build Prisma WHERE clause from search + filter params. */
export function buildWhereClause(
  searchFields: string[],
  search?: string,
  filters?: Record<string, unknown>,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (search && searchFields.length > 0) {
    where.OR = searchFields.map((field) => ({
      [field]: { contains: search, mode: 'insensitive' },
    }));
  }

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        where[key] = value;
      }
    }
  }

  return where;
}

/** Build Prisma orderBy from sort/order params. */
export function buildOrderBy(sort?: string, order?: 'asc' | 'desc'): Record<string, 'asc' | 'desc'> {
  if (!sort) return { createdAt: 'desc' as const };
  return { [sort]: (order || 'desc') as 'asc' | 'desc' };
}

/** Standard pagination response wrapper. */
export function paginatedResponse<T>(data: T[], page: number, limit: number, total: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}
