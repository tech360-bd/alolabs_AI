// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealDb, seedAgent, seedCompany, type RealDb } from '../helpers/real-db';

/**
 * Proves that relation integrity is enforced THROUGH THE APPLICATION'S PRISMA
 * CLIENT, not only by the DDL. The better-sqlite3 driver adapter never issues
 * PRAGMA foreign_keys=ON on its own; src/lib/db.ts wraps the adapter factory
 * so every connection does.
 */
describe('Prisma client relational integrity (real SQLite database)', () => {
  let real: RealDb;

  beforeAll(async () => {
    real = await createRealDb('alo-prisma-fk');
  }, 90_000);

  afterAll(async () => {
    await real?.cleanup();
  });

  it('enables foreign_keys, WAL and a busy timeout on the connection', async () => {
    const fk = await real.db.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>('PRAGMA foreign_keys');
    expect(Number(fk[0].foreign_keys)).toBe(1);
    const journal = await real.db.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode');
    expect(journal[0].journal_mode).toBe('wal');
    const busy = await real.db.$queryRawUnsafe<Array<{ timeout: number | bigint }>>('PRAGMA busy_timeout');
    expect(Number(busy[0].timeout)).toBe(5000);
  });

  it('rejects an AgentHealth row whose agentId does not reference an Agent (P2003)', async () => {
    await expect(
      real.db.agentHealth.create({ data: { agentId: 'no-such-agent-primary-key', status: 'healthy' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await real.db.agentHealth.count()).toBe(0);
  });

  it('accepts the row when agentId is the Agent primary key, and cascades company deletes', async () => {
    const agent = await seedAgent(real.db, 'fk-probe-agent');
    const health = await real.db.agentHealth.create({ data: { agentId: agent.id, status: 'healthy' } });
    expect(health.agentId).toBe(agent.id);

    const company = await seedCompany(real.db, 'FK Co');
    await real.db.aIProviderConfig.create({
      data: { companyId: company.id, provider: 'openai-compatible', name: 'primary', models: '[]' },
    });
    expect(await real.db.aIProviderConfig.count({ where: { companyId: company.id } })).toBe(1);
    await real.db.company.delete({ where: { id: company.id } });
    expect(await real.db.aIProviderConfig.count({ where: { companyId: company.id } })).toBe(0);
  });

  it('prevents deleting an Agent that still has health rows (RESTRICT)', async () => {
    const agent = await real.db.agent.findUniqueOrThrow({ where: { agentId: 'fk-probe-agent' } });
    await expect(real.db.agent.delete({ where: { id: agent.id } })).rejects.toMatchObject({ code: 'P2003' });
    await real.db.agentHealth.deleteMany({ where: { agentId: agent.id } });
    await expect(real.db.agent.delete({ where: { id: agent.id } })).resolves.toBeTruthy();
  });
});
