import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  parseBody,
  parseQuery,
  buildWhereClause,
  buildOrderBy,
  paginatedResponse,
  paginationQuery,
  schemas,
} from '@/lib/validators';

// ─── Schemas ────────────────────────────────────────────────────────────────

const testBodySchema = z.object({
  name: schemas.name,
  email: schemas.email,
  status: schemas.status,
  description: schemas.description,
});

// ─── parseBody ─────────────────────────────────────────────────────────────

describe('parseBody', () => {
  it('should return parsed data for valid input', () => {
    const result = parseBody(testBodySchema, {
      name: 'Test Company',
      email: 'test@example.com',
      status: 'active',
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      name: 'Test Company',
      email: 'test@example.com',
      status: 'active',
      description: undefined,
    });
  });

  it('should return error with status 400 for invalid input', () => {
    const result = parseBody(testBodySchema, {
      name: '',
      email: 'not-an-email',
      status: 'unknown-status',
    });
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(400);
    expect(result.error!.message).toContain('name');
  });

  it('should return error for missing required fields', () => {
    const result = parseBody(testBodySchema, {});
    expect(result.data).toBeNull();
    expect(result.error!.status).toBe(400);
  });

  it('should return error message with path for nested issues', () => {
    const nestedSchema = z.object({
      user: z.object({
        email: z.string().email(),
      }),
    });
    const result = parseBody(nestedSchema, { user: { email: 'bad' } });
    expect(result.error!.message).toContain('user.email');
  });

  it('should accept valid optional fields', () => {
    const result = parseBody(testBodySchema, {
      name: 'Acme',
      email: 'acme@test.com',
      status: 'draft',
      description: 'A description',
    });
    expect(result.error).toBeNull();
    expect(result.data!.description).toBe('A description');
  });

  it('should handle null body', () => {
    const result = parseBody(testBodySchema, null);
    expect(result.data).toBeNull();
    expect(result.error!.status).toBe(400);
  });
});

// ─── parseQuery ─────────────────────────────────────────────────────────────

describe('parseQuery', () => {
  it('should parse pagination query params with defaults', () => {
    const params = new URLSearchParams();
    const result = parseQuery(paginationQuery, params);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      page: 1,
      limit: 20,
      sort: undefined,
      order: 'asc',
      search: undefined,
    });
  });

  it('should coerce string page/limit to numbers', () => {
    const params = new URLSearchParams('page=3&limit=50');
    const result = parseQuery(paginationQuery, params);
    expect(result.error).toBeNull();
    expect(result.data!.page).toBe(3);
    expect(result.data!.limit).toBe(50);
  });

  it('should return error for page=0 (below min 1)', () => {
    const params = new URLSearchParams('page=0');
    const result = parseQuery(paginationQuery, params);
    // Zod 4: coercion produces 0, which fails min(1) — default only applies to undefined
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(400);
  });

  it('should return error for limit above max 100', () => {
    const params = new URLSearchParams('limit=999');
    const result = parseQuery(paginationQuery, params);
    // Zod 4: coercion produces 999, which fails max(100)
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(400);
  });

  it('should accept sort and order params', () => {
    const params = new URLSearchParams('sort=name&order=desc');
    const result = parseQuery(paginationQuery, params);
    expect(result.error).toBeNull();
    expect(result.data!.sort).toBe('name');
    expect(result.data!.order).toBe('desc');
  });

  it('should accept search param', () => {
    const params = new URLSearchParams('search=hello world');
    const result = parseQuery(paginationQuery, params);
    expect(result.error).toBeNull();
    expect(result.data!.search).toBe('hello world');
  });

  it('should return error for invalid order', () => {
    const params = new URLSearchParams('order=invalid');
    const result = parseQuery(paginationQuery, params);
    expect(result.data).toBeNull();
    expect(result.error!.status).toBe(400);
  });
});

// ─── buildWhereClause ───────────────────────────────────────────────────────

describe('buildWhereClause', () => {
  it('should return empty object when no search or filters', () => {
    const result = buildWhereClause([]);
    expect(result).toEqual({});
  });

  it('should build OR clause for search fields', () => {
    const result = buildWhereClause(['name', 'email'], 'john');
    expect(result.OR).toHaveLength(2);
    expect(result.OR).toEqual([
      { name: { contains: 'john', mode: 'insensitive' } },
      { email: { contains: 'john', mode: 'insensitive' } },
    ]);
  });

  it('should apply filters to where clause', () => {
    const result = buildWhereClause([], undefined, { status: 'active', companyId: 'c1' });
    expect(result.status).toBe('active');
    expect(result.companyId).toBe('c1');
  });

  it('should combine search and filters', () => {
    const result = buildWhereClause(['name'], 'test', { status: 'draft' });
    expect(result.OR).toBeDefined();
    expect(result.status).toBe('draft');
  });

  it('should skip null/undefined/empty filter values', () => {
    const result = buildWhereClause([], undefined, {
      status: 'active',
      empty: '',
      nil: null,
      undef: undefined,
    });
    expect(result.status).toBe('active');
    expect(result).not.toHaveProperty('empty');
    expect(result).not.toHaveProperty('nil');
    expect(result).not.toHaveProperty('undef');
  });

  it('should not add OR when search is empty', () => {
    const result = buildWhereClause(['name', 'email'], '');
    expect(result).not.toHaveProperty('OR');
  });

  it('should not add OR when searchFields is empty', () => {
    const result = buildWhereClause([], 'something');
    expect(result).not.toHaveProperty('OR');
  });
});

// ─── buildOrderBy ───────────────────────────────────────────────────────────

describe('buildOrderBy', () => {
  it('should default to { createdAt: "desc" } when no sort provided', () => {
    expect(buildOrderBy()).toEqual({ createdAt: 'desc' });
    expect(buildOrderBy(undefined, undefined)).toEqual({ createdAt: 'desc' });
  });

  it('should build orderBy with default desc order', () => {
    expect(buildOrderBy('name')).toEqual({ name: 'desc' });
  });

  it('should respect explicit asc order', () => {
    expect(buildOrderBy('name', 'asc')).toEqual({ name: 'asc' });
  });

  it('should respect explicit desc order', () => {
    expect(buildOrderBy('email', 'desc')).toEqual({ email: 'desc' });
  });

  it('should handle various sort fields', () => {
    expect(buildOrderBy('priority')).toEqual({ priority: 'desc' });
    expect(buildOrderBy('status')).toEqual({ status: 'desc' });
    expect(buildOrderBy('createdAt', 'asc')).toEqual({ createdAt: 'asc' });
  });
});

// ─── paginatedResponse ─────────────────────────────────────────────────────

describe('paginatedResponse', () => {
  it('should return data and pagination metadata', () => {
    const result = paginatedResponse(
      [{ id: '1' }, { id: '2' }],
      1,
      20,
      50,
    );
    expect(result.data).toEqual([{ id: '1' }, { id: '2' }]);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 50,
      pages: 3, // ceil(50/20)
    });
  });

  it('should compute pages correctly for exact multiples', () => {
    const result = paginatedResponse([], 2, 10, 40);
    expect(result.pagination.pages).toBe(4);
  });

  it('should compute pages correctly for partial last page', () => {
    const result = paginatedResponse([], 3, 10, 25);
    expect(result.pagination.pages).toBe(3);
  });

  it('should return pages=0 for empty total', () => {
    const result = paginatedResponse([], 1, 20, 0);
    expect(result.pagination.pages).toBe(0);
    expect(result.pagination.total).toBe(0);
  });

  it('should return pages=1 for total <= limit on page 1', () => {
    const result = paginatedResponse([{ id: '1' }], 1, 20, 5);
    expect(result.pagination.pages).toBe(1);
  });
});
