import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

const root = process.cwd();
const cli = join(root, 'node_modules/tsx/dist/cli.mjs');
const generator = join(root, 'scripts/sqlite-push.ts');
const schemaModelCount = (readFileSync(join(root, 'prisma/schema.prisma'), 'utf8').match(/^model\s+\w+\s*\{/gm) ?? []).length;

describe('air-gapped SQLite schema integrity (real temporary databases)', () => {
  it('creates foreign keys, enforces them, and refuses silent drift on existing databases', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alo-fk-'));
    const file = join(dir, 'schema.sqlite');
    try {
      const env = { ...process.env, DATABASE_URL: `file:${file}` };
      execFileSync(process.execPath, [cli, generator], { cwd: root, env, timeout: 30000 });
      const db = new Database(file);
      try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        expect(schemaModelCount).toBeGreaterThanOrEqual(179);
        expect(tables).toHaveLength(schemaModelCount);
        const fks = db.prepare('PRAGMA foreign_key_list("RolePermission")').all() as Array<{ table: string; from: string }>;
        expect(fks).toEqual(expect.arrayContaining([
          expect.objectContaining({ table: 'Role', from: 'roleId' }),
          expect.objectContaining({ table: 'Permission', from: 'permissionId' }),
        ]));
        db.exec('PRAGMA foreign_keys=ON');
        expect(() => db.exec("INSERT INTO RolePermission (id, roleId, permissionId, createdAt) VALUES ('probe','missing','missing',CURRENT_TIMESTAMP)")).toThrow();
      } finally { db.close(); }
      // Existing compatible tables are idempotent, not silently rebuilt.
      execFileSync(process.execPath, [cli, generator], { cwd: root, env, timeout: 30000 });

      const legacy = join(dir, 'legacy.sqlite');
      copyFileSync(file, legacy);
      const old = new Database(legacy);
      old.exec('PRAGMA foreign_keys=OFF; DROP TABLE "RolePermission"; CREATE TABLE "RolePermission" (id TEXT PRIMARY KEY, roleId TEXT NOT NULL, permissionId TEXT NOT NULL, createdAt DATETIME NOT NULL);');
      old.close();
      const refusal = spawnSync(process.execPath, [cli, generator], {
        cwd: root, env: { ...process.env, DATABASE_URL: `file:${legacy}` }, timeout: 30000, encoding: 'utf8',
      });
      expect(refusal.status).not.toBe(0);
      expect(refusal.stderr).toContain('refusing implicit migration');
      const check = new Database(legacy);
      try { expect(check.prepare('PRAGMA foreign_key_list("RolePermission")').all()).toHaveLength(0); }
      finally { check.close(); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 90000);
});
