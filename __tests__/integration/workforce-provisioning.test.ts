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
const activationScript = join(root, 'scripts/activate-workforce.ts');
const employeeIdentityScript = join(root, 'scripts/provision-ai-employee-identities.ts');

type ReportDoc = { provision?: any; verify?: any; provisioning?: any; verification?: any; totals?: any; scope?: any; agents?: any[] };

function runScript(env: NodeJS.ProcessEnv, script: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [tsxCli, script, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { status: result.status, docs: parseDocs(result.stdout), stderr: result.stderr, stdout: result.stdout };
}

function runCli(env: NodeJS.ProcessEnv, ...args: string[]) {
  return runScript(env, provisionScript, ...args);
}

function runEmployeeCli(env: NodeJS.ProcessEnv, ...args: string[]) {
  return runScript(env, employeeIdentityScript, ...args);
}

/** The CLI prints one or more concatenated JSON documents; read them all. */
function parseDocs(text: string): ReportDoc[] {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) return [parsed as ReportDoc];
    } catch {
      // The provisioning CLI emits concatenated documents; parse them below.
    }
  }
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
    try {
      docs.push(JSON.parse(text.slice(start, end)));
      i = end;
    } catch {
      // Runtime/provider logs can contain brace-delimited non-JSON text before
      // the audit's JSON report. Keep scanning for the next object.
      i = start + 1;
    }
  }
  return docs;
}

describe('workforce provisioning (real SQLite database)', () => {
  let real: RealDb;
  let db: PrismaClient;
  let workforce: typeof import('@/lib/workforce');
  let store: WorkforceStore;
  let employeeStore: import('@/lib/workforce/employee-identities').AIEmployeeStore;
  let registry: DepartmentConfig[];

  beforeAll(async () => {
    real = await createRealDb('alo-workforce');
    db = real.db;
    workforce = await import('@/lib/workforce');
    const { createPrismaWorkforceStore } = await import('@/lib/workforce/prisma-store');
    store = createPrismaWorkforceStore(db);
    employeeStore = workforce.createPrismaAIEmployeeStore(db);
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
    expect(report.agentAccessEnsured).toBe(2000);

    expect(await db.department.count()).toBe(100);
    expect(await db.agent.count()).toBe(2000);
    expect(await db.agentCompanyAccess.count({ where: { companyId: (await db.company.findUnique({ where: { slug: 'alo-labs' }, select: { id: true } }))!.id } })).toBe(2000);
    const tenant = await db.company.findUnique({ where: { slug: 'alo-labs' } });
    expect(tenant).not.toBeNull();
    expect(await db.agent.count({ where: { companyId: tenant!.id } })).toBe(2000);
    expect(await db.department.count({ where: { companyId: tenant!.id } })).toBe(100);
  }, 120_000);

  it('adds exactly 2,000 persistent employee identities idempotently without creating model workers', async () => {
    const workforcePlan = plan();
    const employeePlan = workforce.buildAIEmployeePlan(workforcePlan.agents);
    const tenant = await db.company.findUnique({ where: { slug: 'alo-labs' }, select: { id: true } });
    expect(tenant).not.toBeNull();
    const agentCountBefore = await db.agent.count({ where: { companyId: tenant!.id } });
    const cliDryRun = runEmployeeCli({ ...real.env, PRISMA_SQLITE_ADAPTER: '1' }, '--dry-run');
    expect(cliDryRun.status, cliDryRun.stderr).toBe(0);
    expect(cliDryRun.docs[0].provisioning).toMatchObject({ dryRun: true, employees: { created: 2000 } });

    const dryRun = await workforce.provisionAIEmployeeIdentities(employeeStore, tenant!.id, employeePlan, { dryRun: true });
    expect(dryRun.ok).toBe(true);
    expect(dryRun.employees).toMatchObject({ created: 2000, updated: 0, unchanged: 0 });
    expect(await db.aIEmployeeIdentity.count({ where: { companyId: tenant!.id } })).toBe(0);

    const applied = await workforce.provisionAIEmployeeIdentities(employeeStore, tenant!.id, employeePlan);
    expect(applied.ok).toBe(true);
    expect(applied.employees).toMatchObject({ created: 2000, updated: 0, unchanged: 0 });
    expect(await db.aIEmployeeIdentity.count({ where: { companyId: tenant!.id } })).toBe(2000);
    expect(await db.agent.count({ where: { companyId: tenant!.id } })).toBe(agentCountBefore);
    expect(await db.agentExecution.count()).toBe(0);
    expect(await db.agentRun.count()).toBe(0);

    const rows = await employeeStore.listEmployees(tenant!.id);
    const verification = workforce.verifyAIEmployeeIdentities(employeePlan, rows, tenant!.id);
    expect(verification.ok).toBe(true);
    expect(verification.counts).toMatchObject({ identities: 2000, provisioned: 2000, active: 0, tested: 0 });
    const cliVerify = runEmployeeCli({ ...real.env, PRISMA_SQLITE_ADAPTER: '1' }, '--verify');
    expect(cliVerify.status, cliVerify.stderr).toBe(0);
    expect(cliVerify.docs[0].verification).toMatchObject({ ok: true, counts: { identities: 2000, provisioned: 2000 } });

    const rerun = await workforce.provisionAIEmployeeIdentities(employeeStore, tenant!.id, employeePlan);
    expect(rerun.ok).toBe(true);
    expect(rerun.employees).toMatchObject({ created: 0, updated: 0, unchanged: 2000 });
    expect(await db.aIEmployeeIdentity.count({ where: { companyId: tenant!.id } })).toBe(2000);
  }, 180_000);

  it('keeps lifecycle changes gated by Super Admin approval and attributable execution evidence', async () => {
    const tenant = await db.company.findUnique({ where: { slug: 'alo-labs' }, select: { id: true } });
    const identity = await db.aIEmployeeIdentity.findUnique({ where: { companyId_employeeKey: { companyId: tenant!.id, employeeKey: 'AIEMP-0001' } } });
    expect(identity?.status).toBe('provisioned');
    const auditCount = await db.auditEvent.count({ where: { companyId: tenant!.id, action: { startsWith: 'ai_employee.' } } });

    await expect(workforce.transitionAIEmployeeStatus({
      companyId: tenant!.id,
      employeeId: identity!.id,
      actor: { userId: 'company-admin', role: 'user', companyRole: 'admin' },
      status: 'active',
      reason: 'Attempt activation',
    })).rejects.toMatchObject({ status: 403, code: 'SUPER_ADMIN_REQUIRED' });

    await expect(workforce.transitionAIEmployeeStatus({
      companyId: tenant!.id,
      employeeId: identity!.id,
      actor: { userId: 'super-admin', role: 'super_admin' },
      status: 'active',
      reason: 'Attempt before testing',
    })).rejects.toMatchObject({ status: 409, code: 'TEST_REQUIRED' });

    await expect(workforce.transitionAIEmployeeStatus({
      companyId: tenant!.id,
      employeeId: identity!.id,
      actor: { userId: 'company-admin', role: 'user', companyRole: 'admin' },
      status: 'tested',
      reason: 'Evidence must be real',
      verificationExecutionId: 'nonexistent-execution',
    })).rejects.toMatchObject({ status: 422, code: 'INVALID_EXECUTION_EVIDENCE' });

    expect((await db.aIEmployeeIdentity.findUnique({ where: { id: identity!.id } }))?.status).toBe('provisioned');
    expect(await db.auditEvent.count({ where: { companyId: tenant!.id, action: { startsWith: 'ai_employee.' } } })).toBe(auditCount);
  }, 60_000);

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

  it('verifier passes on the live database and reports lifecycle state without claiming operation', async () => {
    const rows = await store.loadAll();
    const tenant = await store.findTenantId('alo-labs');
    const report = workforce.verifyWorkforce(plan(), { tenantId: tenant, ...rows });
    expect(report.ok).toBe(true);
    expect(report.counts.agentsOwned).toBe(2000);
    expect(report.counts.agentsMissingAccess).toBe(0);
    expect(report.counts.agentsActive).toBe(0);
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

  it('activation audit joins by database id and scopes run evidence to the selected company', async () => {
    const tenantId = await store.findTenantId('alo-labs');
    const companyAgent = await db.agent.findUnique({ where: { agentId: 'AGENT-0001' } });
    const partnerAgent = await db.agent.findUnique({ where: { agentId: 'PARTNER-0001' } });
    const partnerCompany = await db.company.findUnique({ where: { slug: 'partner-co' } });
    expect(tenantId).toBeTruthy();
    expect(companyAgent).not.toBeNull();
    expect(partnerAgent).not.toBeNull();
    expect(partnerCompany).not.toBeNull();

    await db.agent.update({ where: { agentId: 'AGENT-0001' }, data: { status: 'active' } });
    const companyRun = await db.agentRun.create({
      data: {
        agentId: companyAgent!.id,
        companyId: tenantId!,
        status: 'completed',
        input: 'Run evidence for the tenant agent.',
        output: 'Completed response recorded for this company-scoped test agent.',
      },
    });
    const crossCompanyRun = await db.agentRun.create({
      data: {
        agentId: companyAgent!.id,
        companyId: partnerCompany!.id,
        status: 'completed',
        input: 'Foreign tenant run.',
        output: 'Must not count in the ALO audit.',
      },
    });
    const partnerRun = await db.agentRun.create({
      data: {
        agentId: partnerAgent!.id,
        companyId: partnerCompany!.id,
        status: 'completed',
        input: 'Partner agent run.',
        output: 'Private partner output.',
      },
    });
    for (const [taskId, agentId] of [
      [companyRun.id, companyAgent!.id],
      [crossCompanyRun.id, companyAgent!.id],
      [partnerRun.id, partnerAgent!.id],
    ]) {
      await db.toolRun.create({
        data: { taskId, agentId, toolName: 'search_knowledge', toolCategory: 'knowledge' },
      });
    }

    const audit = runScript(
      { ...real.env, PRISMA_SQLITE_ADAPTER: '1' },
      activationScript,
      '--company', tenantId!,
      '--json',
      '--days', '30',
    );
    expect(audit.status, audit.stderr).toBe(0);
    const report = JSON.parse(audit.stdout) as ReportDoc;
    expect(report.scope).toMatchObject({ companyId: tenantId, agentCount: 2000 });
    expect(report.totals.agentRuns).toBe(1);
    expect(report.totals.agentRunsCompleted).toBe(1);
    expect(report.totals.toolRuns).toBe(1);
    expect(report.totals.toolRunScope).toBe('linked to company-scoped AgentRun rows');
    expect(report.agents!.some((agent) => agent.agentId === 'PARTNER-0001')).toBe(false);
    expect(report.agents!.find((agent) => agent.agentId === 'AGENT-0001')!.runs)
      .toMatchObject({ total: 1, completed: 1 });
  }, 300_000);

  it('requires company-scoped model usage plus successful reviews before Super Admin activation', async () => {
    const tenant = await db.company.findUnique({ where: { slug: 'alo-labs' }, select: { id: true } });
    const partnerCompany = await db.company.findUnique({ where: { slug: 'partner-co' }, select: { id: true } });
    const identity = await db.aIEmployeeIdentity.findUnique({ where: { companyId_employeeKey: { companyId: tenant!.id, employeeKey: 'AIEMP-0001' } } });
    const agent = await db.agent.findUnique({ where: { id: identity!.agentDbId } });
    const startedAt = new Date(Date.now() - 5_000);
    const completedAt = new Date(Date.now() + 5_000);
    const review = JSON.stringify({ securityValidationPassed: true, heuristicValidationPassed: true });
    const instance = await db.agentInstance.create({
      data: { agentId: agent!.id, companyId: tenant!.id, status: 'active', healthStatus: 'healthy' },
    });
    const run = await db.agentRun.create({
      data: {
        id: 'fixture-run-aiemp-0001',
        agentId: agent!.id,
        companyId: tenant!.id,
        instanceId: instance.id,
        status: 'completed',
        input: 'Synthetic test fixture; not a live inference claim.',
        output: 'Synthetic test fixture output.',
        model: 'fixture-local-model',
        reviewResult: review,
        createdAt: startedAt,
        completedAt,
      },
    });
    const execution = await db.agentExecution.create({
      data: {
        requestId: 'fixture-execution-aiemp-0001',
        instanceId: instance.id,
        companyId: tenant!.id,
        assignedAgentId: agent!.id,
        agentRunId: run.id,
        input: 'Synthetic test fixture; not a live inference claim.',
        status: 'completed',
        executionOutput: 'Synthetic test fixture output.',
        reviewResult: review,
        startedAt,
        completedAt,
      },
    });

    await db.modelUsageRecord.create({
      data: {
        companyId: partnerCompany!.id,
        agentId: agent!.id,
        model: 'fixture-local-model',
        requestId: `${run.id}:model:1`,
        profile: 'free_general',
        status: 'success',
        inputTokens: 10,
        outputTokens: 32,
        totalTokens: 42,
        usageSource: 'locally_estimated',
        createdAt: new Date(startedAt.getTime() + 1_000),
      },
    });
    await expect(workforce.transitionAIEmployeeStatus({
      companyId: tenant!.id,
      employeeId: identity!.id,
      actor: { userId: 'company-admin', role: 'user', companyRole: 'admin' },
      status: 'tested',
      reason: 'Foreign-company usage must not satisfy the evidence gate.',
      verificationExecutionId: execution.id,
    })).rejects.toMatchObject({ status: 422, code: 'MODEL_USAGE_EVIDENCE_MISSING' });

    await db.modelUsageRecord.create({
      data: {
        companyId: tenant!.id,
        agentId: agent!.id,
        model: 'fixture-local-model',
        requestId: `${run.id}:model:1`,
        profile: 'free_general',
        status: 'success',
        inputTokens: 10,
        outputTokens: 32,
        totalTokens: 42,
        usageSource: 'locally_estimated',
        createdAt: new Date(startedAt.getTime() + 2_000),
      },
    });
    const tested = await workforce.transitionAIEmployeeStatus({
      companyId: tenant!.id,
      employeeId: identity!.id,
      actor: { userId: 'company-admin', role: 'user', companyRole: 'admin' },
      status: 'tested',
      reason: 'Synthetic test fixture; validates evidence correlation only.',
      verificationExecutionId: execution.id,
    });
    expect(tested.status).toBe('tested');

    await expect(workforce.transitionAIEmployeeStatus({
      companyId: tenant!.id,
      employeeId: identity!.id,
      actor: { userId: 'company-admin', role: 'user', companyRole: 'admin' },
      status: 'active',
      reason: 'Company admins may not activate.',
    })).rejects.toMatchObject({ status: 403, code: 'SUPER_ADMIN_REQUIRED' });
    const active = await workforce.transitionAIEmployeeStatus({
      companyId: tenant!.id,
      employeeId: identity!.id,
      actor: { userId: 'super-admin', role: 'super_admin' },
      status: 'active',
      reason: 'Synthetic test fixture; Super Admin approval is explicit.',
    });
    expect(active.status).toBe('active');

    const verification = workforce.verifyAIEmployeeIdentities(
      workforce.buildAIEmployeePlan(plan().agents),
      await employeeStore.listEmployees(tenant!.id),
      tenant!.id,
    );
    expect(verification.ok).toBe(true);
    expect(verification.counts.active).toBe(1);
  }, 120_000);
});
