// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createRealDb, seedAgent, type RealDb } from '../helpers/real-db';

const root = process.cwd();
const tsxCli = join(root, 'node_modules/tsx/dist/cli.mjs');
const auditScript = join(root, 'scripts/db-integrity-audit.ts');

function runAudit(env: NodeJS.ProcessEnv, ...extra: string[]) {
  const result = spawnSync(process.execPath, [tsxCli, auditScript, ...extra], {
    cwd: root, env, encoding: 'utf8', timeout: 60_000,
  });
  const jsonStart = result.stdout.indexOf('{');
  const report = jsonStart >= 0 ? JSON.parse(result.stdout.slice(jsonStart)) : null;
  return { status: result.status, report, stderr: result.stderr };
}

/**
 * Root cause of the orphan AgentHealth row found by the previous audit:
 * AgentHealthMonitor wrote the business key (Agent.agentId) into the FK
 * column AgentHealth.agentId, which references Agent.id. These tests prove
 * (1) the monitor now persists the primary key, (2) the integrity audit
 * detects legacy orphans, (3) `--fix` remaps them by business key and
 * (4) unrecoverable rows are only removed with an explicit quarantine export.
 */
describe('AgentHealth identity + db-integrity-audit (real SQLite database)', () => {
  let real: RealDb;

  beforeAll(async () => {
    real = await createRealDb('alo-agent-health');
  }, 90_000);

  afterAll(async () => {
    await real?.cleanup();
  });

  it('health monitor persists AgentHealth.agentId = Agent.id when given the business key', async () => {
    const agent = await seedAgent(real.db, 'AGENT-HEALTH-0001');
    const { getAgentHealthMonitor, clearAgentIdentityCache } = await import('@/lib/agent-runtime/health');
    clearAgentIdentityCache();
    const monitor = getAgentHealthMonitor();
    monitor.recordSuccess('AGENT-HEALTH-0001', 42);
    monitor.recordFailure('AGENT-HEALTH-0001', 10, 'boom');
    await monitor.persist();
    // the fire-and-forget upserts resolve on the next tick
    await new Promise((r) => setTimeout(r, 50));

    const rows = await real.db.agentHealth.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].agentId).toBe(agent.id);
    expect(rows[0].id).toBe(`health-${agent.id}`);
    expect(rows[0].consecutiveFailures).toBe(1);

    // Unknown agents are never persisted (that is how orphans were created).
    monitor.recordSuccess('AGENT-DOES-NOT-EXIST', 5);
    await monitor.persist();
    await new Promise((r) => setTimeout(r, 50));
    expect(await real.db.agentHealth.count()).toBe(1);
  });

  it('health monitor reloads from DB and reports by business key after a restart', async () => {
    const { getAgentHealthMonitor, clearAgentIdentityCache } = await import('@/lib/agent-runtime/health');
    clearAgentIdentityCache();
    const monitor = getAgentHealthMonitor();
    monitor.resetHealth('AGENT-HEALTH-0001');
    await monitor.load();
    const snapshot = monitor.getHealth('AGENT-HEALTH-0001');
    expect(snapshot.agentId).toBe('AGENT-HEALTH-0001');
    expect(snapshot.consecutiveFailures).toBe(1);
  });

  it('integrity audit passes on a clean database and checks every schema relation', () => {
    const { status, report } = runAudit(real.env);
    expect(status).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.relationsChecked).toBeGreaterThan(100);
  });

  it('detects legacy orphans, remaps those matching a business key, and quarantines the rest explicitly', async () => {
    const agent = await seedAgent(real.db, 'AGENT-HEALTH-0002');
    // Simulate rows written by the old code path (FK enforcement bypassed).
    const raw = new Database(real.file);
    raw.exec('PRAGMA foreign_keys=OFF');
    raw.prepare(
      "INSERT INTO AgentHealth (id, agentId, status, cpuUsage, memoryUsage, lastHeartbeat, consecutiveFailures, checkedAt) VALUES (?, ?, 'degraded', 0, 0, CURRENT_TIMESTAMP, 4, CURRENT_TIMESTAMP)",
    ).run('health-AGENT-HEALTH-0002', 'AGENT-HEALTH-0002');
    raw.prepare(
      "INSERT INTO AgentHealth (id, agentId, status, cpuUsage, memoryUsage, lastHeartbeat, consecutiveFailures, checkedAt) VALUES (?, ?, 'failed', 0, 0, CURRENT_TIMESTAMP, 9, CURRENT_TIMESTAMP)",
    ).run('health-ghost', 'GHOST-AGENT');
    raw.close();

    const detected = runAudit(real.env);
    expect(detected.status).toBe(2);
    expect(detected.report.ok).toBe(false);
    const finding = detected.report.findings.find((f: { model: string }) => f.model === 'AgentHealth');
    expect(finding.orphanCount).toBe(2);
    expect(finding.parentModel).toBe('Agent');

    // --fix alone: remap the recoverable row, leave the ghost in place.
    const fixed = runAudit(real.env, '--fix');
    expect(fixed.status).toBe(2);
    expect(fixed.report.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'remapped-business-key-to-id', count: 1 }),
      expect.objectContaining({ action: expect.stringContaining('left-in-place'), count: 1 }),
    ]));
    const remapped = await real.db.agentHealth.findUniqueOrThrow({ where: { id: 'health-AGENT-HEALTH-0002' } });
    expect(remapped.agentId).toBe(agent.id);
    expect(remapped.consecutiveFailures).toBe(4);
    expect(await real.db.$queryRawUnsafe<unknown[]>("SELECT id FROM AgentHealth WHERE id = 'health-ghost'")).toHaveLength(1);

    // --quarantine: export then delete the unrecoverable row.
    const quarantineDir = join(real.dir, 'quarantine');
    const quarantined = runAudit(real.env, '--fix', '--quarantine', quarantineDir);
    expect(quarantined.status).toBe(0);
    expect(quarantined.report.ok).toBe(true);
    expect(existsSync(quarantineDir)).toBe(true);
    const exportFile = readdirSync(quarantineDir).find((f) => f.startsWith('AgentHealth-'));
    expect(exportFile).toBeDefined();
    const exported = JSON.parse(readFileSync(join(quarantineDir, exportFile!), 'utf8'));
    expect(exported.rows).toHaveLength(1);
    expect(exported.rows[0].agentId).toBe('GHOST-AGENT');
    expect(await real.db.$queryRawUnsafe<unknown[]>("SELECT id FROM AgentHealth WHERE id = 'health-ghost'")).toHaveLength(0);
  }, 120_000);
});

describe('sqlite-push schema coverage', () => {
  it('generates one table per model in prisma/schema.prisma', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
    const modelCount = (schema.match(/^model\s+\w+\s*\{/gm) ?? []).length;
    const out = execFileSync(process.execPath, [tsxCli, join(root, 'scripts/sqlite-push.ts')], {
      cwd: root, env: { ...process.env, DATABASE_URL: `file:${join(root, '.arena-tmp', `coverage-${process.pid}.sqlite`)}` }, encoding: 'utf8', timeout: 60_000,
    });
    expect(out).toContain(`${modelCount} models, ${modelCount} tables present`);
  }, 60_000);
});
