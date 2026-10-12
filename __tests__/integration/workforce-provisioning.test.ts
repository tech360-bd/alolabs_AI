// @vitest-environment node
/**
 * Workforce provisioning against a REAL SQLite database (schema applied by
 * scripts/sqlite-push.ts, queries through the application's Prisma client).
 *
 * Covers: exact 100 departments / 2,000 agents, idempotent re-provisioning,
 * drift repair without touching lifecycle status, conflict refusal on legacy
 * rows, tenant isolation, foreign-key integrity, and a restart simulated by a
 * separate CLI process.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createRealDb, type RealDb } from '../helpers/real-db';
import type { PrismaClient } from '@prisma/client';
import type { WorkforceStore } from '@/lib/workforce/provision';
import type { DepartmentConfig } from '@/lib/department-registry/types';

const root = process.cwd();
const tsxCli = join(root, 'node_modules/tsx/dist/cli.mjs');
const provisionScript = join(root, 'scripts/provision-workforce.ts');

type ReportDoc = { provision?: any; verify?: any };

function runCli(env: NodeJS.ProcessEnv, ...args: string[]) {
  const result = spawnSync(process.execPath, [tsxCli, provisionScript, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 300_000,
  });
  return { status: result.status, docs: parseDocs(result.stdout), stderr: result.stderr };
}

/** The CLI prints one or more concatenated JSON documents; read them all. */
function parseDocs(text: string): ReportDoc[] {
  const docs: ReportDoc[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('{', i);
    if (start < 0) break;
    let depth = 0;
    let end = -1;
    let inString = false;
    for (let j = start; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (ch === '\\') j++;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    if (end < 0) break;
    docs.push(JSON.parse(text.slice(start, end)));
    i = end;
  }
  return docs;
}

describe('workforce provisioning (real SQLite database)', () => {
  let real: RealDb;
  let db: PrismaClient;
  let workforce: typeof import('@/lib/workforce');
  let store: WorkforceStore;
  let registry: DepartmentConfig[];

  beforeAll(async () => {
    real = await createRealDb('alo-workforce');
    db = real.db;
    workforce = await import('@/lib/workforce');
    const { createPrismaWorkforceStore } = await import('@/lib/workforce/prisma-store');
    store = createPrismaWorkforceStore(db);
    const { getDepartmentRegistry } = await import('@/lib/department-registry');
    registry = getDepartmentRegistry().getAllDepartments();
  }, 120_000);

  afterAll(async () => {
    await real?.cleanup();
  });

  const plan = () => workforce.buildWorkforcePlan(registry);

  it('provisions exactly 100 departments and 2,000 agents, all owned by the ALO tenant', async () => {
    const report = await workforce.provisionWorkforce(store, plan());
    expect(report.ok).toBe(true);
    expect(report.departments.created).toBe(100);
    expect(report.agents.created).toBe(2000);

    expect(await db.department.count()).toBe(100);
    expect(await db.agent.count()).toBe(2000);
    const tenant = await db.company.findUnique({ where: { slug: 'alo-labs' } });
    expect(tenant).not.toBeNull();
    expect(await db.agent.count({ where: { companyId: tenant!.id } })).toBe(2000);
    expect(await db.department.count({ where: { companyId: tenant!.id } })).toBe(100);
  }, 120_000);

  it('gives every agent a unique business key, a department, a provisioned lifecycle and full configuration', async () => {
    const agents = await db.agent.findMany({ include: { department: true } });
    expect(new Set(agents.map((a) => a.agentId)).size).toBe(2000);
    expect(agents.every((a) => a.department !== null)).toBe(true);
    expect(agents.every((a) => a.status === 'provisioned')).toBe(true);
    for (const agent of agents.slice(0, 200)) {
      expect(agent.systemInstructions.length).toBeGreaterThan(20);
      const profile = JSON.parse(agent.runtimeProfile);
      expect(profile.knowledgeAccess.scope).toBe(`department:${agent.department.slug}`);
      expect(profile.provisioning.managedBy).toBe('workforce-plan');
    }
  });

  it('keeps every department orchestrated by one of its own agents', async () => {
    const depts = await db.department.findMany();
    for (const dept of depts) {
      const profile = JSON.parse(dept.runtimeProfile);
      const orchestrator = await db.agent.findUnique({ where: { agentId: profile.orchestratorAgentId } });
      expect(orchestrator?.departmentId).toBe(dept.id);
      expect(orchestrator?.role).toBe('manager');
    }
  });

  it('is idempotent in the database: re-provisioning writes nothing and leaves row counts unchanged', async () => {
    const before = { d: await db.department.count(), a: await db.agent.count() };
    const beforeStamp = await db.agent.aggregate({ _max: { updatedAt: true } });
    const report = await workforce.provisionWorkforce(store, plan());
    expect(report.departments).toMatchObject({ created: 0, updated: 0, unchanged: 100 });
    expect(report.agents).toMatchObject({ created: 0, updated: 0, unchanged: 2000 });
    expect(await db.department.count()).toBe(before.d);
    expect(await db.agent.count()).toBe(before.a);
    const afterStamp = await db.agent.aggregate({ _max: { updatedAt: true } });
    expect(afterStamp._max.updatedAt?.getTime()).toBe(beforeStamp._max.updatedAt?.getTime());
  }, 120_000);

  it('verifier passes on the live database and reports no operational agents yet', async () => {
    const rows = await store.loadAll();
    const tenant = await store.findTenantId('alo-labs');
    const report = workforce.verifyWorkforce(plan(), { tenantId: tenant, ...rows });
    expect(report.ok).toBe(true);
    expect(report.counts.agentsOwned).toBe(2000);
    expect(report.counts.agentsOperational).toBe(0);
  }, 60_000);

  it('repairs drift in the database and never changes a verified-active lifecycle', async () => {
    await db.agent.update({ where: { agentId: 'AGENT-0777' }, data: { purpose: 'TAMPERED' } });
    await db.agent.update({ where: { agentId: 'AGENT-0002' }, data: { status: 'active' } });

    const rows = await store.loadAll();
    const tenant = await store.findTenantId('alo-labs');
    expect(workforce.verifyWorkforce(plan(), { tenantId: tenant, ...rows }).ok).toBe(false);

    const report = await workforce.provisionWorkforce(store, plan());
    expect(report.agents).toMatchObject({ updated: 1, unchanged: 1999, conflicts: 0 });
    expect((await db.agent.findUnique({ where: { agentId: 'AGENT-0777' } }))!.purpose).not.toBe('TAMPERED');
    expect((await db.agent.findUnique({ where: { agentId: 'AGENT-0002' } }))!.status).toBe('active');
  }, 120_000);

  it('refuses to overwrite a legacy agent in the database and reports the conflict', async () => {
    const legacy = await db.agent.findUnique({ where: { agentId: 'AGENT-0003' } });
    await db.agent.update({ where: { agentId: 'AGENT-0003' }, data: { name: 'Hand-made legacy agent', companyId: null } });
    const report = await workforce.provisionWorkforce(store, plan());
    expect(report.ok).toBe(false);
    expect(report.conflicts.map((c: { key: string }) => c.key)).toContain('AGENT-0003');
    expect((await db.agent.findUnique({ where: { agentId: 'AGENT-0003' } }))!.name).toBe('Hand-made legacy agent');
    await db.agent.update({ where: { agentId: 'AGENT-0003' }, data: { name: legacy!.name, companyId: legacy!.companyId } });
    expect((await workforce.provisionWorkforce(store, plan())).ok).toBe(true);
  }, 120_000);

  it('isolates tenants: another company\'s agent and department are never counted or modified', async () => {
    const other = await db.company.create({ data: { name: 'Partner Co', slug: 'partner-co', status: 'active' } });
    const dept = await db.department.create({
      data: { name: 'Partner Ops', slug: 'partner-ops', companyId: other.id, runtimeProfile: '{}' },
    });
    await db.agent.create({
      data: {
        agentId: 'PARTNER-0001', name: 'Partner agent', slug: 'partner-agent-1', departmentId: dept.id,
        departmentName: 'Partner Ops', purpose: 'partner work', companyId: other.id, runtimeProfile: '{}',
        systemInstructions: 'partner instructions',
      },
    });

    const rows = await store.loadAll();
    const tenant = await store.findTenantId('alo-labs');
    const verify = workforce.verifyWorkforce(plan(), { tenantId: tenant, ...rows });
    expect(verify.ok).toBe(true);
    expect(verify.counts.agentsOwned).toBe(2000);

    const report = await workforce.provisionWorkforce(store, plan());
    expect(report.ok).toBe(true);
    const partner = await db.agent.findUnique({ where: { agentId: 'PARTNER-0001' } });
    expect(partner!.companyId).toBe(other.id);
    expect(partner!.name).toBe('Partner agent');
  }, 120_000);

  it('keeps foreign keys consistent for every provisioned row', async () => {
    const rows = await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check');
    expect(rows).toHaveLength(0);
  });

  it('survives a restart: a separate CLI process verifies and re-provisions the same state', async () => {
    const env = { ...real.env, PRISMA_SQLITE_ADAPTER: '1' };
    const verifyOnly = runCli(env, '--verify');
    expect(verifyOnly.status, verifyOnly.stderr).toBe(0);
    expect(verifyOnly.docs.find((d) => d.verify)!.verify.counts.agentsOwned).toBe(2000);

    const apply = runCli(env);
    expect(apply.status, apply.stderr).toBe(0);
    const applyDoc = apply.docs.find((d) => d.verify)!;
    expect(applyDoc.verify.ok).toBe(true);
    expect(apply.docs.find((d) => d.provision)!.provision.ok).toBe(true);
  }, 300_000);

  it('dry-run from a fresh process reports zero writes on an already-provisioned database', () => {
    const dry = runCli({ ...real.env, PRISMA_SQLITE_ADAPTER: '1' }, '--dry-run');
    expect(dry.status, dry.stderr).toBe(0);
    const provision = dry.docs.find((d) => d.provision)!.provision;
    expect(provision.dryRun).toBe(true);
    expect(provision.agents.created).toBe(0);
    expect(provision.departments.created).toBe(0);
  }, 300_000);
});
