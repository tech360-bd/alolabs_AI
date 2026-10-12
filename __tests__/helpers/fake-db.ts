/**
 * In-memory fake of the Prisma client for AgentOS unit tests.
 *
 * Supports the subset of the Prisma API used by the run pipeline:
 * create / findUnique / findFirst / findMany / update / updateMany /
 * delete / deleteMany / count / upsert, with simple where-clause matching
 * (equality, { in }, OR, and relation "some" filters).
 */

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Record<string, any> | undefined): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'OR') {
      if (!Array.isArray(condition) || !condition.some((w) => matchesWhere(row, w))) return false;
      continue;
    }
    if (key === 'AND') {
      if (!Array.isArray(condition) || !condition.every((w) => matchesWhere(row, w))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (matchesWhere(row, condition)) return false;
      continue;
    }
    const value = row[key];
    if (condition !== null && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
      // Operator object: { in: [...] }, { not: ... }, { some: {...} } (relation), etc.
      if ('in' in condition) {
        if (!condition.in.includes(value)) return false;
        continue;
      }
      if ('notIn' in condition) {
        if (condition.notIn.includes(value)) return false;
        continue;
      }
      if ('not' in condition) {
        if (value === condition.not) return false;
        continue;
      }
      if ('some' in condition || 'every' in condition || 'none' in condition) {
        // Relation filter — the fake stores no relations; treat as match when
        // the row carries the scalar foreign keys the filter implies.
        continue;
      }
      if ('equals' in condition) {
        if (value !== condition.equals) return false;
        continue;
      }
      // Unknown operator object — be permissive.
      continue;
    }
    if (value !== condition) return false;
  }
  return true;
}

function applySelect(row: Row, select: Record<string, any> | undefined): Row {
  if (!select) return row;
  const out: Row = {};
  for (const [key, v] of Object.entries(select)) {
    if (v === true) out[key] = row[key];
  }
  return out;
}

function applyOrder(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [field, dir] = Object.entries(clause)[0] as [string, string];
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

/**
 * Relation map for `include` support: `${model}.${includeKey}` →
 * { store, fk, many }. fk is the foreign key on the related rows (to-many)
 * or the local key matched against the related row's id (to-one).
 */
const RELATIONS: Record<string, { store: string; fk: string; many: boolean }> = {
  'workflow.workflowSteps': { store: 'workflowStep', fk: 'workflowId', many: true },
  'task.steps': { store: 'taskStep', fk: 'taskId', many: true },
  'task.outputs': { store: 'taskOutput', fk: 'taskId', many: true },
  'task.taskErrors': { store: 'taskError', fk: 'taskId', many: true },
  'task.artifacts': { store: 'artifact', fk: 'taskId', many: true },
  'workflowRun.workflow': { store: 'workflow', fk: 'workflowId', many: false },
  'workflowRun.run': { store: 'agentOSRun', fk: 'id', many: false },
  'agentOSRun.tasks': { store: 'task', fk: 'runId', many: true },
  'project.runs': { store: 'agentOSRun', fk: 'projectId', many: true },
  'project.artifacts': { store: 'artifact', fk: 'projectId', many: true },
};

function applyInclude(
  model: string,
  row: Row,
  include: Record<string, any>,
  store: (m: string) => Map<string, Row>,
  depth = 0,
): Row {
  if (depth > 2) return row;
  const out: Row = { ...row };
  for (const [key, value] of Object.entries(include)) {
    const rel = RELATIONS[`${model}.${key}`];
    if (!rel) continue;
    const spec = typeof value === 'object' && value !== null ? value : {};
    if (rel.many) {
      let related = [...store(rel.store).values()].filter((r) => r[rel.fk] === row.id);
      related = applyOrder(related, spec.orderBy);
      out[key] = spec.include
        ? related.map((r) => applyInclude(rel.store, r, spec.include, store, depth + 1))
        : related.map((r) => (spec.select ? applySelect({ ...r }, spec.select) : { ...r }));
    } else {
      const related = [...store(rel.store).values()].find((r) => r.id === row[rel.fk]);
      out[key] = related
        ? spec.include
          ? applyInclude(rel.store, { ...related }, spec.include, store, depth + 1)
          : { ...related }
        : null;
    }
  }
  return out;
}

export interface FakeDb {
  db: any;
  stores: Map<string, Map<string, Row>>;
  rows: (model: string) => Row[];
  reset: () => void;
}

export function createFakeDb(): FakeDb {
  const stores = new Map<string, Map<string, Row>>();
  const store = (model: string): Map<string, Row> => {
    if (!stores.has(model)) stores.set(model, new Map());
    return stores.get(model)!;
  };

  const makeModel = (model: string) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => {
          switch (method) {
            case 'create':
              return async ({ data, select }: any) => {
                const row: Row = { ...data };
                if (row.id === undefined) row.id = `fake_${model}_${store(model).size + 1}`;
                store(model).set(String(row.id), row);
                return applySelect(row, select);
              };
            case 'createMany':
              return async ({ data }: any) => {
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                  const row: Row = { ...item };
                  if (row.id === undefined) row.id = `fake_${model}_${store(model).size + 1}`;
                  store(model).set(String(row.id), row);
                }
                return { count: items.length };
              };
            case 'findUnique':
              return async ({ where, select, include }: any) => {
                const found = [...store(model).values()].find((r) => matchesWhere(r, where));
                if (!found) return null;
                const row = applySelect({ ...found }, select);
                return include ? applyInclude(model, row, include, store) : row;
              };
            case 'findFirst':
              return async ({ where, select, include, orderBy }: any) => {
                const found = applyOrder(
                  [...store(model).values()].filter((r) => matchesWhere(r, where)),
                  orderBy,
                )[0];
                if (!found) return null;
                const row = applySelect({ ...found }, select);
                return include ? applyInclude(model, row, include, store) : row;
              };
            case 'findMany':
              return async ({ where, select, include, orderBy, take, skip }: any) => {
                let rows = applyOrder(
                  [...store(model).values()].filter((r) => matchesWhere(r, where)),
                  orderBy,
                ).map((r) => {
                  const row = applySelect({ ...r }, select);
                  return include ? applyInclude(model, row, include, store) : row;
                });
                if (skip) rows = rows.slice(skip);
                if (take !== undefined) rows = rows.slice(0, take);
                return rows;
              };
            case 'update':
              return async ({ where, data, select }: any) => {
                const found = [...store(model).values()].find((r) => matchesWhere(r, where));
                if (!found) throw new Error(`FakeDb: ${model}.update — record not found`);
                Object.assign(found, data);
                return applySelect({ ...found }, select);
              };
            case 'updateMany':
              return async ({ where, data }: any) => {
                let count = 0;
                for (const row of store(model).values()) {
                  if (matchesWhere(row, where)) {
                    Object.assign(row, data);
                    count += 1;
                  }
                }
                return { count };
              };
            case 'upsert':
              return async ({ where, create, update }: any) => {
                const found = [...store(model).values()].find((r) => matchesWhere(r, where));
                if (found) {
                  Object.assign(found, update);
                  return { ...found };
                }
                const row: Row = { ...create };
                if (row.id === undefined) row.id = `fake_${model}_${store(model).size + 1}`;
                store(model).set(String(row.id), row);
                return { ...row };
              };
            case 'delete':
              return async ({ where }: any) => {
                const found = [...store(model).values()].find((r) => matchesWhere(r, where));
                if (!found) throw new Error(`FakeDb: ${model}.delete — record not found`);
                store(model).delete(String(found.id));
                return { ...found };
              };
            case 'deleteMany':
              return async ({ where }: any) => {
                let count = 0;
                for (const [key, row] of [...store(model).entries()]) {
                  if (matchesWhere(row, where)) {
                    store(model).delete(key);
                    count += 1;
                  }
                }
                return { count };
              };
            case 'count':
              return async ({ where }: any) =>
                [...store(model).values()].filter((r) => matchesWhere(r, where)).length;
            case 'aggregate':
              return async () => ({ _count: { _all: store(model).size } });
            default:
              throw new Error(`FakeDb: unsupported method ${model}.${method}`);
          }
        },
      },
    );

  const db = new Proxy(
    {},
    {
      get: (_target, model: string) => {
        if (model === '$queryRawUnsafe' || model === '$queryRaw') return async () => [{ '?column?': 1 }];
        if (model === '$executeRawUnsafe' || model === '$executeRaw') return async () => 1;
        if (model === '$transaction') return async (arg: any) => (typeof arg === 'function' ? arg(db) : Promise.all(arg));
        if (model === '$connect' || model === '$disconnect') return async () => {};
        return makeModel(model);
      },
    },
  );

  return {
    db,
    stores,
    rows: (model: string) => [...store(model).values()],
    reset: () => stores.clear(),
  };
}

/**
 * Shared singletons for AgentOS tests. These live in a plain module (no
 * mocked imports) so test files can import them and reference them inside
 * vi.mock factories — module imports evaluate before mock factories run.
 */
import { vi } from 'vitest';

export const fakeDb = createFakeDb();

/** Deterministic stub provider: returns a QC-passing output, no LLM call. */
export const stubExecute = vi.fn(async (params: any) => ({
  id: `stub-task-${params.agentId}`,
  status: 'completed',
  result: {
    content: [
      `Research findings for: ${String(params.task).split('\n')[0]}`,
      '',
      '1. Objective analysis completed.',
      '2. Sources verified against the knowledge base.',
      '3. Recommendations drafted with citations.',
      '',
      'Deliverable content follows the requested structure and cites sources.',
    ].join('\n'),
    metadata: { model: 'stub-model-v1', latencyMs: 5 },
  },
  tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
}));

export const routeTask = vi.fn(async (task: string) => ({
  selectedAgent: {
    agentId: 'AGENT-0001',
    agentName: 'Research Agent',
    role: 'researcher',
    score: 0.92,
  },
  reasoning: 'stub routing',
  task,
}));

export const addEpisodic = vi.fn(async () => ({}));
export const publish = vi.fn(async () => ({}));

export function resetAgentOsMocks() {
  fakeDb.reset();
  stubExecute.mockClear();
  routeTask.mockClear();
  addEpisodic.mockClear();
  publish.mockClear();
}
