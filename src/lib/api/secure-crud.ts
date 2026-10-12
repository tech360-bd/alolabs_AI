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

type GuardOptions = SecureRouteOptions<Record<string, unknown>, Record<string, unknown>, unknown>;

export interface SecureCrudOptions {
  /** Dotted resource name, e.g. `crm.contacts`. */
  resource: string;
  /** Prisma delegate name, e.g. `crmContact`. */
  model: string;
  /** Model name recorded in audit logs. Defaults to `resource`. */
  label?: string;
  /**
   * Column that holds the owning tenant. Defaults to `companyId`.
   * Set to `null` only for genuinely global tables — those routes remain
   * authenticated and role-checked, just not tenant-filtered.
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
   * column is checked on reads, creates, updates and deletes.
   */
  ownership?: { delegate: string; fk: string; relation: string; tenantField?: string };
  /** Pass `false` to opt out (not recommended for mutating routes). */
  rateLimit?: RateLimitPolicy | false;
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

  const ownership = options.ownership;
  const ownerTenantField = ownership?.tenantField ?? 'companyId';

  /** Row-level filter for reads: own column, or the parent relation. */
  const tenantFilter = (companyId: string): Record<string, unknown> => {
    if (!companyId) return {};
    if (tenantField) return { [tenantField]: companyId };
    if (ownership) return { [ownership.relation]: { [ownerTenantField]: companyId } };
    return {};
  };

  /**
   * Verify that the parent record referenced by a create/update belongs to the
   * caller's tenant. Used for tables that inherit tenancy through a relation.
   */
  const assertParentTenant = async (
    context: SecureContext<Record<string, unknown>, Record<string, unknown>, unknown>,
    parentId: unknown,
  ): Promise<void> => {
    if (!ownership || typeof parentId !== 'string' || !parentId) return;
    const parent = await delegate(ownership.delegate).findUnique({
      where: { id: parentId },
      select: { [ownerTenantField]: true },
    });
    if (!parent) throw new ApiHttpError(400, 'invalid_body', `Unknown ${ownership.relation} reference`);
    context.assertTenant(parent[ownerTenantField] as string | null | undefined);
  };

  const GET = secureRoute(guard('read', { query: listQuery as unknown as z.ZodType<Record<string, unknown>> }), async (context) => {
    const query = context.query as unknown as z.infer<typeof listQuery>;
    const where: Record<string, unknown> = {
      ...(options.baseWhere ?? {}),
      ...tenantFilter(context.companyId),
    };
    const trimmed = query.search?.trim();
    if (trimmed && options.searchFields?.length) {
      where.OR = options.searchFields.map((field) => ({ [field]: { contains: trimmed } }));
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
  });

  const POST = secureRoute(
    guard('create', { body: options.createSchema as z.ZodType<Record<string, unknown>> }),
    async (context) => {
      // A client-supplied `companyId` was either rejected (403) or stripped by
      // the guard, so the value below is always the principal's own tenant.
      if (ownership) await assertParentTenant(context, (context.body ?? {})[ownership.fk]);
      const record = await delegate(options.model).create({
        data: { ...(context.body ?? {}), ...tenantFilter(context.companyId) },
        ...(options.include ? { include: options.include } : {}),
        ...(options.select ? { select: options.select } : {}),
      });
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

    const store = delegate(options.model);
    const existing = await store.findUnique({ where: { id } });
    if (!existing) throw notFound();
    // Cross-tenant records are reported as 404 so the API cannot be used to
    // probe which ids exist in other tenants.
    if (tenantField) context.assertTenant(existing[tenantField] as string | null | undefined);
    if (ownership) {
      await assertParentTenant(context, existing[ownership.fk as string]);
      if (fields[ownership.fk] !== undefined) await assertParentTenant(context, fields[ownership.fk]);
    }

    const record = await store.update({
      where: { id },
      data: { ...(parsed.data as Record<string, unknown>), ...tenantFilter(context.companyId) },
      ...(options.include ? { include: options.include } : {}),
      ...(options.select ? { select: options.select } : {}),
    });
    await writeAudit(context, 'update', label, { id, changes: fields });
    return jsonResponse({ data: record }, context.requestId);
  });

  const DELETE = secureRoute(guard('delete', { query: idQuery as unknown as z.ZodType<Record<string, unknown>> }), async (context) => {
    const query = context.query as unknown as z.infer<typeof idQuery>;
    const id = query.id ?? context.request.nextUrl.searchParams.get('id');
    if (!id) throw notFound();

    const store = delegate(options.model);
    const existing = await store.findUnique({ where: { id } });
    if (!existing) throw notFound();
    if (tenantField) context.assertTenant(existing[tenantField] as string | null | undefined);
    if (ownership) await assertParentTenant(context, existing[ownership.fk as string]);

    await store.delete({ where: { id } });
    await writeAudit(context, 'delete', label, { id });
    return jsonResponse({ success: true }, context.requestId);
  });

  return { GET, POST, PUT, DELETE };
}
