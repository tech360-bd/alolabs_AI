/**
 * Real-database test harness.
 *
 * Creates a throw-away SQLite database with the exact schema the application
 * uses (via scripts/sqlite-push.ts) and returns the application's own Prisma
 * singleton (src/lib/db.ts) bound to it — foreign keys ON, WAL, busy timeout.
 *
 * Test files that use this helper MUST run in the node environment:
 *   // @vitest-environment node
 * and must not mock '@/lib/db'.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const root = process.cwd();
const tsxCli = join(root, 'node_modules/tsx/dist/cli.mjs');
const pushScript = join(root, 'scripts/sqlite-push.ts');

export interface RealDb {
  dir: string;
  file: string;
  url: string;
  db: PrismaClient;
  /** Environment to pass to child processes that should hit the same DB. */
  env: NodeJS.ProcessEnv;
  cleanup: () => Promise<void>;
}

export async function createRealDb(label = 'alo-realdb'): Promise<RealDb> {
  const dir = mkdtempSync(join(tmpdir(), `${label}-`));
  const file = join(dir, 'test.sqlite');
  const url = `file:${file}`;
  execFileSync(process.execPath, [tsxCli, pushScript], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    timeout: 60_000,
    stdio: 'pipe',
  });

  process.env.PRISMA_SQLITE_ADAPTER = '1';
  process.env.DATABASE_URL = url;
  // src/lib/db.ts caches the client on globalThis outside production.
  delete (globalThis as { prisma?: unknown }).prisma;
  vi.resetModules();
  const mod = await import('@/lib/db');
  const db = mod.db as PrismaClient;

  return {
    dir,
    file,
    url,
    db,
    env: { ...process.env, PRISMA_SQLITE_ADAPTER: '1', DATABASE_URL: url },
    cleanup: async () => {
      await db.$disconnect().catch(() => undefined);
      delete (globalThis as { prisma?: unknown }).prisma;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Creates (or reuses) a department and an agent with the given business key. */
export async function seedAgent(db: PrismaClient, agentId: string, overrides: { name?: string; department?: string } = {}) {
  const departmentSlug = overrides.department ?? 'qa';
  const department = await db.department.upsert({
    where: { slug: departmentSlug },
    update: {},
    create: { name: departmentSlug.toUpperCase(), slug: departmentSlug },
  });
  return db.agent.upsert({
    where: { agentId },
    update: {},
    create: {
      agentId,
      name: overrides.name ?? agentId,
      slug: agentId.toLowerCase(),
      departmentId: department.id,
      departmentName: department.name,
      purpose: `Test agent ${agentId}`,
    },
  });
}

/** Creates a company with a unique slug. */
export async function seedCompany(db: PrismaClient, name: string) {
  return db.company.create({
    data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 8)}` },
  });
}
