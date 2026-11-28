/**
 * ALO Labs AgentOS — declarative, tenant-safe CRUD routes.
 *
 * Roughly a hundred of the existing `/api/*` routes are hand-written copies of
 * the same shape: an inline `verifySessionToken` call, a paginated list, and
 * create/update/delete by id — with **no tenant filter and no role check**, so
 * any authenticated user could read or mutate any tenant's rows.
 *
 * `secureCrud` generates those four handlers from one configuration and puts
 * them behind `secureRoute`, so every generated route is authenticated,
 * authorised, tenant-scoped, validated, audited and rate limited while keeping
 * the response contract the UI already consumes
 * (`{ data, pagination }`, `{ data }`, `{ success: true }`).
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import {
  ApiHttpError,
  badRequest,
  jsonResponse,
  notFound,
  secureRoute,
  unprocessable,
  type RateLimitPolicy,
  type SecureContext,
  type SecureRouteOptions,
} from '@/lib/api/secure-route';
import { paginatedResponse } from '@/lib/validators';

interface CrudDelegate {
  findMany(args?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  count(args?: Record<string, unknown>): Promise<number>;
  findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

function delegate(model: string): CrudDelegate {
  const candidate = (db as unknown as Record<string, CrudDelegate | undefined>)[model];
  if (!candidate) {
    throw new Error(`secureCrud: unknown Prisma delegate "${model}"`);
  }
  return candidate;
}

const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9_]+$/)
    .optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(200).optional(),
});

const idQuery = z.object({ id: z.string().min(1).max(128).optional() });

/** `{ id, ...anything }` — fields are validated per resource by `updateSchema`. */
const putBody = z
  .object({ id: z.string().min(1, 'id is required').max(128) })
  .passthrough() as unknown as z.ZodType<Record<string, unknown>>;

const DEFAULT_WRITE_LIMIT: RateLimitPolicy = { limit: 240, windowMs: 60_000 };
const DEFAULT_READ_LIMIT: RateLimitPolicy = { limit: 600, windowMs: 60_000 };

const FORBIDDEN_SORT_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'password',
  'passwordHash',
  'secret',
  'token',
]);

type GuardOptions = SecureRouteOptions<Record<string, unknown>, Record<string, unknown>, unknown>;

/** One parent row that a child record inherits its tenancy through. */
export interface OwnershipSpec {
  delegate: string;
  fk: string;
  /** Prisma relation field name on this model, when a `@relation` exists. */
  relation?: string;
  tenantField?: string;
  /**
   * Optional custom read filter for parent models that do not carry a direct
   * tenant column (for example `Workflow` via `WorkflowPermission` or
   * `Department.companyId`).
   */
  readWhere?: (companyId: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /**
   * Optional custom parent-ownership check for creates/updates/deletes.
   * Return `'not_found'` if the parent row does not exist, `true` if owned
   * by `companyId`, or `false` if owned by another tenant.
   */
  verifyParent?: (
    parentId: string,
    companyId: string,
    mode: 'read' | 'write',
  ) => Promise<boolean | 'not_found'>;
}

export interface SecureCrudOptions {
  /** Dotted resource name, e.g. `crm.contacts`. */
  resource: string;
  /** Prisma delegate name, e.g. `crmContact`. */
  model: string;
  /** Model name recorded in audit logs. Defaults to `resource`. */
  label?: string;
  /**
   * Column that holds the owning tenant. Defaults to `companyId`.
   * Set to `null` only for tables that inherit tenancy through `ownership`
   * or genuinely global tables (restricted appropriately by roles).
   */
  tenantField?: string | null;
  /**
   * Require an authenticated principal that belongs to a tenant, even for
   * tables that cannot be row-filtered. Defaults to `true`.
   */
  requireTenant?: boolean;
  createSchema: z.ZodTypeAny;
  updateSchema?: z.ZodTypeAny;
  /** Columns matched by the `search` query parameter. */
  searchFields?: readonly string[];
  orderBy?: Record<string, 'asc' | 'desc'>;
  /** Explicit allowlist of columns accepted via `?sort=`. */
  sortableFields?: readonly string[];
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
  /** Extra filter merged into every query (e.g. `{ status: 'active' }`). */
  baseWhere?: Record<string, unknown>;
  /** Role allowlist applied to every verb. */
  roles?: readonly string[];
  /** Role allowlist for create/update/delete. Overrides `roles` for writes. */
  writeRoles?: readonly string[];
  companyRoles?: readonly string[];
  /**
   * For tables with no `companyId` column of their own: scope every row
   * through its parent (e.g. a note through its contact). The parent's tenant
   * column is checked on reads, creates, updates and deletes. Accepts one
   * spec or several; every referenced parent is tenant-verified.
   */
  ownership?: OwnershipSpec | OwnershipSpec[];
  /**
   * Controls how multiple `ownership` specs combine when `tenantField` is `null`:
   * - `'all'` (default): every referenced parent must match, and on single-spec
   *   or multi-spec models at least one parent must exist on the record.
   * - `'any'`: for models with alternative nullable parent FKs (e.g. `ToolRun`
   *   with `taskId` and/or `agentId`), every provided FK must belong to the
   *   caller's tenant and at least one parent FK must be present.
   */
  ownershipMode?: 'all' | 'any';
  /**
   * Optional zod schema for extra list filters (e.g. `{ status, pipelineId }`),
   * parsed from the query string and merged into the read `where`. Unknown
   * query parameters are still stripped — only the fields declared here pass.
   */
  filterSchema?: z.ZodTypeAny;
  /**
   * Optional side effect after a successful create (e.g. touching the parent
   * contact's `lastContactAt`). Throwing here fails the request with a 502 —
   * keep hooks idempotent and cheap.
   */
  afterCreate?: (
    record: Record<string, unknown>,
    context: SecureContext<Record<string, unknown>, Record<string, unknown>, unknown>,
  ) => Promise<void>;
  /** Pass `false` to opt out (not recommended for mutating routes). */
  rateLimit?: RateLimitPolicy | false;
}

function extractObjectKeys(schema: z.ZodTypeAny | undefined): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const candidate = schema as unknown as {
    shape?: Record<string, unknown>;
    _zod?: { def?: { in?: z.ZodTypeAny } };
  };
  if (candidate.shape && typeof candidate.shape === 'object') {
    return Object.keys(candidate.shape);
  }
  if (candidate._zod?.def?.in) {
    return extractObjectKeys(candidate._zod.def.in);
  }
  return [];
}

function deriveSortableFields(options: SecureCrudOptions): Set<string> {
  const keys = new Set<string>(['id']);
  for (const key of Object.keys(options.orderBy ?? { createdAt: 'desc' })) {
    keys.add(key);
  }
  for (const field of options.searchFields ?? []) {
    if (!field.includes('.')) keys.add(field);
  }
  for (const key of extractObjectKeys(options.createSchema)) {
    keys.add(key);
  }
  for (const key of extractObjectKeys(options.updateSchema)) {
    keys.add(key);
  }
  for (const forbidden of FORBIDDEN_SORT_KEYS) {
    keys.delete(forbidden);
  }
  return keys;
}

function searchParamsToFilterObject(searchParams: URLSearchParams): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of new Set(searchParams.keys())) {
    const all = searchParams.getAll(key);
    output[key] = all.length > 1 ? all : all[0];
  }
  return output;
}

async function writeAudit(
  context: Pick<SecureContext, 'principal' | 'requestId'>,
  action: string,
  label: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action,
        resource: label,
        details: JSON.stringify({ ...details, requestId: context.requestId }),
        userId: context.principal?.userId ?? null,
      },
    });
  } catch {
    // Audit writes are best-effort: they must never fail a request.
  }
}

export function secureCrud(options: SecureCrudOptions) {
  const tenantField = options.tenantField === undefined ? 'companyId' : options.tenantField;
  const label = options.label ?? options.resource;
  const ownershipMode = options.ownershipMode ?? 'all';
  const sortableFields = new Set(
    (options.sortableFields ?? Array.from(deriveSortableFields(options))).filter(
      (field) => !FORBIDDEN_SORT_KEYS.has(field),
    ),
  );

  const base = {
    resource: options.resource,
    tenant: (options.requireTenant === false ? 'none' : 'required') as 'required' | 'none',
    ...(options.roles ? { roles: options.roles } : {}),
    ...(options.companyRoles ? { companyRoles: options.companyRoles } : {}),
  };

  const guard = (
    action: 'read' | 'create' | 'update' | 'delete',
    extra: { body?: z.ZodType<Record<string, unknown>>; query?: z.ZodType<Record<string, unknown>> } = {},
  ): GuardOptions => {
    const policy =
      options.rateLimit === false
        ? false
        : options.rateLimit ?? (action === 'read' ? DEFAULT_READ_LIMIT : DEFAULT_WRITE_LIMIT);
    const roles = action === 'read' ? options.roles : options.writeRoles ?? options.roles;
    return {
      ...base,
      action,
      rateLimit: policy,
      ...(roles ? { roles } : {}),
      ...(extra.body ? { body: extra.body } : {}),
      ...(extra.query ? { query: extra.query } : {}),
    };
  };

  const ownerships: OwnershipSpec[] = options.ownership
    ? Array.isArray(options.ownership)
      ? options.ownership
      : [options.ownership]
    : [];

  /**
   * Scalar tenant column written into `create` / `update` `data`.
   * Never returns a nested Prisma relation filter.
   */
  const tenantWriteData = (companyId: string): Record<string, unknown> => {
    if (!companyId || !tenantField) return {};
    return { [tenantField]: companyId };
  };

  const resolveSpecReadWhere = async (
    spec: OwnershipSpec,
    companyId: string,
  ): Promise<Record<string, unknown>> => {
    if (spec.readWhere) {
      return await spec.readWhere(companyId);
    }
    const parentTenantField = spec.tenantField ?? 'companyId';
    if (spec.relation) {
      return { [spec.relation]: { [parentTenantField]: companyId } };
    }
    const parents = await delegate(spec.delegate).findMany({
      where: { [parentTenantField]: companyId },
      select: { id: true },
    });
    return { [spec.fk]: { in: parents.map((row) => row.id as string) } };
  };

  /**
   * Row-level `where` fragment for `GET` queries.
   * Uses the model's own tenant column, or inherits through `ownership`.
   */
  const tenantReadWhere = async (companyId: string): Promise<Record<string, unknown>> => {
    if (!companyId) return {};
    if (tenantField) return { [tenantField]: companyId };
    if (ownerships.length === 0) return {};
    if (ownerships.length === 1) {
      return resolveSpecReadWhere(ownerships[0], companyId);
    }
    const fragments = await Promise.all(
      ownerships.map((spec) => resolveSpecReadWhere(spec, companyId)),
    );
    return ownershipMode === 'any' ? { OR: fragments } : { AND: fragments };
  };

  /**
   * Verify that one parent record referenced by a create/update/delete belongs
   * to the caller's tenant. Returns `true` when a parent reference was present
   * and verified, or `false` when the FK field was absent/null.
   */
  const assertParentTenant = async (
    context: SecureContext<Record<string, unknown>, Record<string, unknown>, unknown>,
    parentId: unknown,
    spec: OwnershipSpec,
    source: 'target' | 'existing',
  ): Promise<boolean> => {
    if (typeof parentId !== 'string' || !parentId) return false;
    if (spec.verifyParent) {
      const verdict = await spec.verifyParent(parentId, context.companyId, 'write');
      if (verdict === 'not_found') {
        if (source === 'target') {
          throw new ApiHttpError(400, 'invalid_body', `Unknown ${spec.relation ?? spec.fk} reference`);
        }
        throw notFound();
      }
      if (!verdict) {
        throw notFound();
      }
      return true;
    }
    const parentTenantField = spec.tenantField ?? 'companyId';
    const parent = await delegate(spec.delegate).findUnique({
      where: { id: parentId },
      select: { [parentTenantField]: true },
    });
    if (!parent) {
      if (source === 'target') {
        throw new ApiHttpError(400, 'invalid_body', `Unknown ${spec.relation ?? spec.fk} reference`);
      }
      throw notFound();
    }
    context.assertTenant(parent[parentTenantField] as string | null | undefined);
    return true;
  };

  /**
   * Verify every declared parent referenced in a row. When `tenantField` is
   * `null` and `ownership` is configured, also enforce that at least one parent
   * reference is verified on the row so unowned records cannot be created,
   * orphaned, or mutated.
   */
  const assertParentsTenant = async (
    context: SecureContext<Record<string, unknown>, Record<string, unknown>, unknown>,
    row: Record<string, unknown>,
    source: 'target' | 'existing',
    requireAtLeastOne: boolean,
  ): Promise<void> => {
    let verifiedCount = 0;
    for (const spec of ownerships) {
      const verified = await assertParentTenant(context, row[spec.fk], spec, source);
      if (verified) verifiedCount += 1;
    }
    if (requireAtLeastOne && ownerships.length > 0 && context.companyId && verifiedCount === 0) {
      if (source === 'existing') {
        throw notFound();
      }
      throw new ApiHttpError(400, 'invalid_body', 'Parent ownership reference is required');
    }
  };

  /**
   * Build one `where` fragment from a possibly dotted field path
   * (e.g. `contact.firstName` → `{ contact: { firstName: { contains } } }`).
   */
  const searchFragment = (field: string, value: string): Record<string, unknown> => {
    const parts = field.split('.');
    let fragment: Record<string, unknown> = { contains: value };
    for (const part of parts.reverse()) fragment = { [part]: fragment };
    return fragment;
  };

  const protectedFilterKeys = new Set<string>(['AND', 'OR', 'NOT', 'companyId']);
  if (tenantField) protectedFilterKeys.add(tenantField);
  for (const spec of ownerships) {
    if (spec.relation) protectedFilterKeys.add(spec.relation);
  }

  const GET = secureRoute(
    guard('read', { query: listQuery as unknown as z.ZodType<Record<string, unknown>> }),
    async (context) => {
      const query = context.query as unknown as z.infer<typeof listQuery>;
      if (query.sort && !sortableFields.has(query.sort)) {
        throw badRequest('Invalid sort field', [
          { path: ['sort'], message: `Unsupported sort field "${query.sort}"` },
        ]);
      }

      const tenantWhereFragment = await tenantReadWhere(context.companyId);
      const where: Record<string, unknown> = {
        ...(options.baseWhere ?? {}),
        ...tenantWhereFragment,
      };
      const extraAnd: Record<string, unknown>[] = [];

      const trimmed = query.search?.trim();
      if (trimmed && options.searchFields?.length) {
        const orClause = options.searchFields.map((field) => searchFragment(field, trimmed));
        if ('OR' in where) {
          extraAnd.push({ OR: orClause });
        } else {
          where.OR = orClause;
        }
      }

      if (options.filterSchema) {
        const parsedFilters = options.filterSchema.safeParse(
          searchParamsToFilterObject(context.request.nextUrl.searchParams),
        );
        if (!parsedFilters.success) {
          throw badRequest('Invalid query parameters', parsedFilters.error.issues);
        }
        const filters = parsedFilters.data as Record<string, unknown>;
        for (const [key, value] of Object.entries(filters)) {
          if (value === undefined || value === null || value === '') continue;
          if (protectedFilterKeys.has(key)) continue;
          if (key in where) {
            extraAnd.push({ [key]: value });
          } else {
            where[key] = value;
          }
        }
      }

      if (extraAnd.length > 0) {
        const existingAnd = Array.isArray(where.AND) ? (where.AND as Record<string, unknown>[]) : [];
        where.AND = [...existingAnd, ...extraAnd];
      }

      const orderBy = query.sort ? { [query.sort]: query.order } : options.orderBy ?? { createdAt: 'desc' };
      const shape = {
        ...(options.include ? { include: options.include } : {}),
        ...(options.select ? { select: options.select } : {}),
      };

      const [records, total] = await Promise.all([
        delegate(options.model).findMany({
          where,
          orderBy,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          ...shape,
        }),
        delegate(options.model).count({ where }),
      ]);

      return jsonResponse(paginatedResponse(records, query.page, query.limit, total), context.requestId);
    },
  );

  const POST = secureRoute(
    guard('create', { body: options.createSchema as z.ZodType<Record<string, unknown>> }),
    async (context) => {
      const bodyData = { ...((context.body ?? {}) as Record<string, unknown>) };
      if (tenantField) delete bodyData[tenantField];

      await assertParentsTenant(context, bodyData, 'target', tenantField === null);

      const record = await delegate(options.model).create({
        data: { ...bodyData, ...tenantWriteData(context.companyId) },
        ...(options.include ? { include: options.include } : {}),
        ...(options.select ? { select: options.select } : {}),
      });
      if (options.afterCreate) await options.afterCreate(record, context);
      await writeAudit(context, 'create', label, { id: record.id });
      return jsonResponse({ data: record }, context.requestId, 201);
    },
  );

  const updateSchema = options.updateSchema ?? (options.createSchema as z.ZodTypeAny);

  const PUT = secureRoute(guard('update', { body: putBody }), async (context) => {
    const raw = (context.body ?? {}) as Record<string, unknown> & { id: string };
    const { id, ...fields } = raw;
    const parsed = updateSchema.safeParse(fields);
    if (!parsed.success) throw unprocessable('Invalid request body', parsed.error.issues);

    const validatedFields = { ...(parsed.data as Record<string, unknown>) };
    if (tenantField) delete validatedFields[tenantField];

    const store = delegate(options.model);
    const existing = await store.findUnique({ where: { id } });
    if (!existing) throw notFound();

    // Cross-tenant records are reported as 404 so the API cannot be used to
    // probe which ids exist in other tenants.
    if (tenantField) context.assertTenant(existing[tenantField] as string | null | undefined);
    await assertParentsTenant(context, existing, 'existing', tenantField === null);
    await assertParentsTenant(context, validatedFields, 'target', false);

    if (tenantField === null && ownerships.length > 0 && context.companyId) {
      const merged = { ...existing, ...validatedFields };
      const stillOwned = ownerships.some(
        (spec) => typeof merged[spec.fk] === 'string' && (merged[spec.fk] as string).length > 0,
      );
      if (!stillOwned) {
        throw new ApiHttpError(400, 'invalid_body', 'Parent ownership reference is required');
      }
    }

    const record = await store.update({
      where: { id },
      data: { ...validatedFields, ...tenantWriteData(context.companyId) },
      ...(options.include ? { include: options.include } : {}),
      ...(options.select ? { select: options.select } : {}),
    });
    await writeAudit(context, 'update', label, { id, changes: validatedFields });
    return jsonResponse({ data: record }, context.requestId);
  });

  const DELETE = secureRoute(
    guard('delete', { query: idQuery as unknown as z.ZodType<Record<string, unknown>> }),
    async (context) => {
      const query = context.query as unknown as z.infer<typeof idQuery>;
      const id = query.id ?? context.request.nextUrl.searchParams.get('id');
      if (!id) throw notFound();

      const store = delegate(options.model);
      const existing = await store.findUnique({ where: { id } });
      if (!existing) throw notFound();

      if (tenantField) context.assertTenant(existing[tenantField] as string | null | undefined);
      await assertParentsTenant(context, existing, 'existing', tenantField === null);

      await store.delete({ where: { id } });
      await writeAudit(context, 'delete', label, { id });
      return jsonResponse({ success: true }, context.requestId);
    },
  );

  return { GET, POST, PUT, DELETE };
}
