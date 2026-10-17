import { describe, it, expect } from 'vitest';
import {
  dropStatements,
  insertStatement,
  quoteIdent,
  quoteString,
  renderDump,
  sqlLiteral,
  validateDump,
  type TableDump,
} from '@/lib/backups/dump';

const TABLE: TableDump = {
  name: 'agents',
  schema: 'CREATE TABLE "agents" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "score" REAL)',
  columns: ['id', 'name', 'score'],
  rows: [
    ['a1', "O'Brien", 1.5],
    ['a2', null, 0],
  ],
};

describe('identifier quoting', () => {
  it('quotes per dialect', () => {
    expect(quoteIdent('agents', 'sqlite')).toBe('"agents"');
    expect(quoteIdent('agents', 'postgresql')).toBe('"agents"');
    expect(quoteIdent('agents', 'mysql')).toBe('`agents`');
  });

  it('rejects empty and reserving identifiers', () => {
    expect(() => quoteIdent('', 'sqlite')).toThrow();
    expect(() => quoteIdent('bad"name', 'sqlite')).toThrow();
    expect(() => quoteIdent('bad`name', 'mysql')).toThrow();
    expect(() => quoteIdent('bad\0name', 'sqlite')).toThrow();
  });
});

describe('literal rendering', () => {
  it('renders primitives', () => {
    expect(sqlLiteral(null, 'sqlite')).toBe('NULL');
    expect(sqlLiteral(undefined, 'mysql')).toBe('NULL');
    expect(sqlLiteral(42, 'sqlite')).toBe('42');
    expect(sqlLiteral(1.25, 'postgresql')).toBe('1.25');
    expect(sqlLiteral(true, 'sqlite')).toBe('1');
    expect(sqlLiteral(false, 'mysql')).toBe('0');
    expect(sqlLiteral(true, 'postgresql')).toBe('TRUE');
    expect(sqlLiteral(10n, 'sqlite')).toBe('10');
  });

  it('escapes quotes and backslashes per dialect', () => {
    expect(quoteString("O'Brien", 'sqlite')).toBe("'O''Brien'");
    expect(quoteString("O'Brien", 'mysql')).toBe("'O''Brien'");
    expect(quoteString('a\\b', 'mysql')).toBe("'a\\\\b'");
    expect(quoteString('a\\b', 'postgresql')).toBe("E'a\\\\b'");
    expect(quoteString('a\\b', 'sqlite')).toBe("'a\\b'");
  });

  it('renders dates, bytes and objects without coercion surprises', () => {
    expect(sqlLiteral(new Date('2026-10-17T00:00:00.000Z'), 'sqlite')).toBe("'2026-10-17T00:00:00.000Z'");
    expect(sqlLiteral(new Uint8Array([0, 15, 255]), 'sqlite')).toBe("X'000fff'");
    expect(sqlLiteral(new Uint8Array([0, 15, 255]), 'mysql')).toBe('0x000fff');
    expect(sqlLiteral(new Uint8Array([0, 15, 255]), 'postgresql')).toBe("decode('000fff', 'hex')");
    expect(sqlLiteral({ a: 1 }, 'sqlite')).toBe('\'{"a":1}\'');
  });

  it('rejects values that cannot be represented', () => {
    expect(() => sqlLiteral(Number.NaN, 'sqlite')).toThrow();
    expect(() => sqlLiteral(new Date('nope'), 'sqlite')).toThrow();
    expect(() => sqlLiteral(() => 1, 'sqlite')).toThrow();
    expect(() => sqlLiteral('bad\0string', 'sqlite')).toThrow();
  });
});

describe('insert statements', () => {
  it('renders a multi-row insert', () => {
    const sql = insertStatement('agents', ['id', 'name'], [['a1', 'Ada'], ['a2', 'Bo']], 'sqlite');
    expect(sql).toBe('INSERT INTO "agents" ("id", "name") VALUES\n  (\'a1\', \'Ada\'),\n  (\'a2\', \'Bo\');');
  });

  it('rejects arity mismatches', () => {
    expect(() => insertStatement('agents', ['id', 'name'], [['only-one']], 'sqlite')).toThrow(/expected 2/);
  });
});

describe('full dump', () => {
  it('produces a validation-passing dump with every row', () => {
    const rendered = renderDump([TABLE], {
      dialect: 'sqlite',
      database: './db/custom.db',
      generatedAt: new Date('2026-10-17T12:00:00.000Z'),
    });

    expect(rendered.tables).toBe(1);
    expect(rendered.rows).toBe(2);
    expect(rendered.sql).toContain('BEGIN TRANSACTION;');
    expect(rendered.sql).toContain('CREATE TABLE "agents"');
    expect(rendered.sql).toContain("INSERT INTO \"agents\"");
    expect(rendered.sql).toContain("'O''Brien'");

    const validation = validateDump(rendered.sql);
    expect(validation.ok).toBe(true);
    expect(validation.tables).toBe(1);
    expect(validation.inserts).toBe(1);
    expect(validation.hasTransaction).toBe(true);
  });

  it('splits rows into batches', () => {
    const rows = Array.from({ length: 250 }, (_, i) => [i, `agent-${i}`, i]);
    const rendered = renderDump([{ ...TABLE, rows }], { dialect: 'mysql', database: 'alo' }, { batchSize: 100 });
    // 1 CREATE TABLE + ceil(250/100) INSERT batches
    expect(rendered.statements).toBe(4);
    expect(rendered.rows).toBe(250);
    expect(validateDump(rendered.sql).inserts).toBe(3);
  });
});

describe('dump validation', () => {
  it('rejects empty and stub dumps', () => {
    expect(validateDump('').ok).toBe(false);
    const stub = '-- SQLite Backup\n-- Generated: now\n\n-- Table: agents\n\n-- 3 rows\n';
    const result = validateDump(stub);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/no CREATE TABLE or INSERT/);
  });

  it('accepts dumps with inserts only', () => {
    const result = validateDump('INSERT INTO "agents" ("id") VALUES (\'a1\');');
    expect(result.ok).toBe(true);
    expect(result.inserts).toBe(1);
  });
});

describe('drop statements', () => {
  it('skips sqlite internals', () => {
    expect(dropStatements(['agents', 'sqlite_sequence'], 'sqlite')).toEqual(['DROP TABLE IF EXISTS "agents";']);
    expect(dropStatements(['agents'], 'mysql')).toEqual(['DROP TABLE IF EXISTS `agents`;']);
  });
});
