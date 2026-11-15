/**
 * tenantDb — tenant isolation at the query level for the client portal.
 *
 * Portal handlers do not touch `db.client*` directly. They call
 * `tenantDb(companyId)`, and every operation it exposes has the caller's
 * `companyId` merged into the WHERE clause (and into `data` on create) by this
 * module — the handler cannot forget it and cannot override it:
 *
 *   • A caller-supplied `companyId` in `where` or `data` is overwritten.
 *   • There is no `findUnique` / `update` / `delete` by bare id. Single-row
 *     writes go through `updateOwned` / `deleteOwned`, which match on
 *     `{ id, companyId }` and report "not found" when the row belongs to
 *     somebody else — indistinguishable from a row that does not exist.
 *
 * The `companyId` itself comes from the authenticated session's membership
 * (src/lib/portal/auth.ts), never from a header, query string or body.
 */

import { db } from '@/lib/db';

/** Models that hold client-owned rows. Every one has a mandatory `companyId`. */
const TENANT_MODELS = [
  'clientProject',
  'clientProjectMilestone',
  'clientMessage',
  'clientDocument',
  'clientDeliverable',
  'clientActivity',
  'clientQuotation',
  'clientInvoice',
  'clientPayment',
  'clientSupportTicket',
  'clientNotification',
] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];

type Where = Record<string, unknown>;
type Row = Record<string, unknown> & { id: string };

interface ReadArgs {
  where?: Where;
  orderBy?: unknown;
  take?: number;
  skip?: number;
  select?: Record<string, unknown>;
}

export interface TenantScoped {
  findMany(args?: ReadArgs): Promise<Row[]>;
  findFirst(args?: ReadArgs): Promise<Row | null>;
  /** Fetch one row by id — null when it is missing OR belongs to another tenant. */
  findOwned(id: string, args?: Omit<ReadArgs, 'where'> & { where?: Where }): Promise<Row | null>;
  count(args?: { where?: Where }): Promise<number>;
  create(args: { data: Record<string, unknown> }): Promise<Row>;
  /** Update one owned row. Returns null when the row is not this tenant's. */
  updateOwned(id: string, data: Record<string, unknown>, extraWhere?: Where): Promise<Row | null>;
  updateMany(args: { where?: Where; data: Record<string, unknown> }): Promise<{ count: number }>;
  deleteOwned(id: string): Promise<boolean>;
  aggregate(args: Record<string, unknown>): Promise<Record<string, any>>;
}

export type TenantDb = { readonly companyId: string } & { readonly [M in TenantModel]: TenantScoped };

function scoped(model: TenantModel, companyId: string): TenantScoped {
  // Resolved lazily so `db` (a lazy proxy) is only touched at call time.
  const delegate = () => (db as unknown as Record<string, any>)[model];
  // The tenant filter is applied LAST so nothing the caller passes can widen it.
  const scope = (where?: Where): Where => ({ ...(where ?? {}), companyId });

  return {
    findMany: (args = {}) => delegate().findMany({ ...args, where: scope(args.where) }),
    findFirst: (args = {}) => delegate().findFirst({ ...args, where: scope(args.where) }),
    findOwned: (id, args = {}) => {
      if (typeof id !== 'string' || !id) return Promise.resolve(null);
      return delegate().findFirst({ ...args, where: scope({ ...(args.where ?? {}), id }) });
    },
    count: (args = {}) => delegate().count({ where: scope(args.where) }),
    create: ({ data }) => delegate().create({ data: { ...data, companyId } }),
    updateOwned: async (id, data, extraWhere) => {
      if (typeof id !== 'string' || !id) return null;
      const { companyId: _ignored, id: _id, ...safe } = data as Record<string, unknown>;
      const result = await delegate().updateMany({ where: scope({ ...(extraWhere ?? {}), id }), data: safe });
      if (!result.count) return null;
      return delegate().findFirst({ where: scope({ id }) });
    },
    updateMany: ({ where, data }) => {
      const { companyId: _ignored, ...safe } = data;
      return delegate().updateMany({ where: scope(where), data: safe });
    },
    deleteOwned: async (id) => {
      if (typeof id !== 'string' || !id) return false;
      const result = await delegate().deleteMany({ where: scope({ id }) });
      return result.count > 0;
    },
    aggregate: (args) => delegate().aggregate({ ...args, where: scope(args.where as Where | undefined) }),
  };
}

/**
 * A data-access handle bound to exactly one client company.
 * Throws when `companyId` is empty — an unscoped handle must never exist.
 */
export function tenantDb(companyId: string): TenantDb {
  if (typeof companyId !== 'string' || companyId.trim() === '') {
    throw new Error('tenantDb requires a companyId');
  }
  const handle: Record<string, unknown> = { companyId };
  for (const model of TENANT_MODELS) handle[model] = scoped(model, companyId);
  return Object.freeze(handle) as TenantDb;
}

export { TENANT_MODELS };
