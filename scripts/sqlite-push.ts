#!/usr/bin/env node
/**
 * ALO Labs AgentOS — SQLite Push (air-gapped `prisma db push` replacement)
 *
 * Parses prisma/schema.prisma and applies the equivalent SQLite DDL directly
 * with node:sqlite. This exists for environments where the Prisma engines CDN
 * (binaries.prisma.sh) is unreachable and `prisma db push` cannot download the
 * schema-engine binary.
 *
 * In production (with CDN access), prefer the standard:
 *     npx prisma db push          (SQLite dev)
 *     npx prisma migrate deploy   (MySQL/Postgres prod)
 *
 * Usage:
 *     DATABASE_URL=file:./db/custom.db npx tsx scripts/sqlite-push.ts [--schema=prisma/schema.prisma]
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { parseSchema, type ParsedField, type ParsedModel } from './lib/prisma-schema';

// ─── DDL generation ──────────────────────────────────────────────────────────

function sqlType(field: ParsedField): string {
  switch (field.type) {
    case 'String': return 'TEXT';
    case 'Int': return 'INTEGER';
    case 'Float': return 'REAL';
    case 'Boolean': return 'BOOLEAN';
    case 'DateTime': return 'DATETIME';
    case 'BigInt': return 'BIGINT';
    case 'Json': return 'JSON';
    case 'Bytes': return 'BLOB';
    case 'Decimal': return 'DECIMAL';
    default: return 'TEXT';
  }
}

function quoteIdent(name: string): string {
  return `"${name}"`;
}

function defaultClause(field: ParsedField): string {
  const raw = field.defaultRaw;
  if (raw === null || field.isUpdatedAt) return '';
  if (raw === 'now()') return ' DEFAULT CURRENT_TIMESTAMP';
  if (raw === 'true') return ' DEFAULT 1';
  if (raw === 'false') return ' DEFAULT 0';
  if (/^-?\d+(\.\d+)?$/.test(raw)) return ` DEFAULT ${raw}`;
  if (raw.startsWith('"') && raw.endsWith('"')) {
    const inner = raw.slice(1, -1).replace(/'/g, "''");
    return ` DEFAULT '${inner}'`;
  }
  // cuid(), uuid(), autoincrement(), dbgenerated(...), env(...) — client-side or unsupported
  return '';
}

function refAction(action: string | null, fallback: string): string {
  switch (action) {
    case 'Cascade': return 'CASCADE';
    case 'SetNull': return 'SET NULL';
    case 'Restrict': return 'RESTRICT';
    case 'NoAction': return 'NO ACTION';
    case 'SetDefault': return 'SET DEFAULT';
    default: return fallback;
  }
}

function generateDDL(models: ParsedModel[]): string[] {
  const statements: string[] = [];

  for (const model of models) {
    const columnDefs: string[] = [];
    const fkDefs: string[] = [];
    const columnFields = model.fields.filter((f) => f.isScalar && !f.isList);

    for (const field of columnFields) {
      let def = `${quoteIdent(field.name)} ${sqlType(field)}`;
      if (field.isId) {
        def += ' PRIMARY KEY';
      } else if (!field.optional) {
        def += ' NOT NULL';
      }
      if (field.isUnique && !field.isId) def += ' UNIQUE';
      def += defaultClause(field);
      columnDefs.push(def);
    }

    for (const field of model.fields) {
      if (!field.relation || field.relation.fields.length === 0) continue;
      const refs = field.relation.references.length > 0
        ? field.relation.references
        : ['id'];
      const cols = field.relation.fields.map(quoteIdent).join(', ');
      const refCols = refs.map(quoteIdent).join(', ');
      const onDelete = refAction(field.relation.onDelete, field.optional ? 'SET NULL' : 'RESTRICT');
      const onUpdate = refAction(field.relation.onUpdate, 'CASCADE');
      fkDefs.push(
        `FOREIGN KEY (${cols}) REFERENCES ${quoteIdent(field.type)} (${refCols}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`,
      );
    }

    for (const unique of model.uniques) {
      columnDefs.push(`UNIQUE (${unique.map(quoteIdent).join(', ')})`);
    }

    const allDefs = [...columnDefs, ...fkDefs];
    statements.push(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(model.name)} (\n  ${allDefs.join(',\n  ')}\n);`,
    );

    // Field-level @index
    for (const field of columnFields) {
      if (/@index\b/.test(field.attrs)) {
        statements.push(
          `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${model.name}_${field.name}_idx`)} ON ${quoteIdent(model.name)} (${quoteIdent(field.name)});`,
        );
      }
    }
    // Block-level @@index
    model.indexes.forEach((fields, i) => {
      if (fields.length === 0) return;
      const name = `${model.name}_${fields.join('_')}_idx`;
      statements.push(
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(name)} ON ${quoteIdent(model.name)} (${fields.map(quoteIdent).join(', ')});`,
      );
    });
  }

  return statements;
}

// ─── Apply ───────────────────────────────────────────────────────────────────

function resolveDbPath(url: string): string {
  const withoutPrefix = url.replace(/^file:/, '');
  return path.resolve(process.cwd(), withoutPrefix);
}

function main() {
  const args = process.argv.slice(2);
  const schemaArg = args.find((a) => a.startsWith('--schema='))?.split('=')[1];
  const schemaPath = path.resolve(process.cwd(), schemaArg ?? 'prisma/schema.prisma');
  const databaseUrl = process.env.DATABASE_URL ?? 'file:./db/custom.db';

  const schemaText = fs.readFileSync(schemaPath, 'utf-8');
  const models = parseSchema(schemaText);
  const ddl = generateDDL(models);

  const dbFile = resolveDbPath(databaseUrl);
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });

  const db = new DatabaseSync(dbFile);
  // CREATE TABLE IF NOT EXISTS cannot retrofit constraints. Fail before any
  // DDL on an old database rather than claiming that its relations were fixed.
  const existing = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name));
  for (const model of models) {
    if (!existing.has(model.name)) continue;
    const actual = db.prepare(`PRAGMA foreign_key_list(${quoteIdent(model.name)})`).all() as Array<{
      table: string; from: string; to: string; on_delete: string; on_update: string;
    }>;
    for (const relation of model.fields.filter((field) => field.relation?.fields.length)) {
      const refs = relation.relation?.references.length ? relation.relation.references : ['id'];
      for (const [index, from] of relation.relation!.fields.entries()) {
        if (!actual.some((fk) => fk.table === relation.type && fk.from === from && fk.to === refs[index])) {
          db.close();
          throw new Error(`Existing ${model.name}.${from} lacks a declared foreign key; refusing implicit migration. Restore a backup and apply a reviewed table-rebuild migration in isolation.`);
        }
      }
    }
  }
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  let applied = 0;
  db.exec('BEGIN;');
  try {
    for (const statement of ddl) {
      try {
        db.exec(statement);
      } catch (e) {
        console.error('FAILED STATEMENT:\n' + statement);
        throw e;
      }
      applied += 1;
    }
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    console.error('Failed to apply DDL:', error);
    process.exit(1);
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  db.close();

  console.log(`sqlite-push: applied ${applied} statements to ${dbFile}`);
  console.log(`sqlite-push: ${models.length} models, ${tables.length} tables present`);
}

main();
