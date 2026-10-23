import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyCompatibility } from '../../scripts/verify-mysql-compatibility';

const tempDirectories: string[] = [];
afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('static SQLite/MySQL Prisma schema compatibility', () => {
  it('verifies current model, field-type, index, relation and large-text checks', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = verifyCompatibility();
    expect(result.totalModels).toBe(192);
    expect(result.sqliteModels).toBe(192);
    expect(result.schemaParityErrors).toBe(0);
    expect(result.indexCollisions).toBe(0);
    expect(result.relationFieldCollisions).toBe(0);
    expect(result.criticalFieldsVerified).toBe(13);
    expect(result.errors).toEqual([]);
  });

  it('reports a missing logical field instead of silently passing parity', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alo-schema-parity-'));
    tempDirectories.push(directory);
    const source = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const changed = source.replace(/^\s+agentId\s+[^\n]+\n/m, '');
    expect(changed).not.toBe(source);
    const tempSchema = path.join(directory, 'schema.prisma');
    fs.writeFileSync(tempSchema, changed);

    const result = verifyCompatibility(tempSchema);
    expect(result.errors).toContain('MySQL schema has unexpected field Agent.agentId');
    expect(result.schemaParityErrors).toBeGreaterThan(0);
  });
});
