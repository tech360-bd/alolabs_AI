#!/usr/bin/env tsx
/**
 * Database relational-integrity audit (and targeted repair).
 *
 * Walks every relation declared in prisma/schema.prisma (parsed with the same
 * parser scripts/sqlite-push.ts uses) and counts child rows whose foreign key
 * does not resolve to a parent row. Works against SQLite (PRISMA_SQLITE_ADAPTER=1) and MySQL —
 * the same DATABASE_URL conventions as the application.
 *
 *   npx tsx scripts/db-integrity-audit.ts                 # report only (exit 2 if orphans)
 *   npx tsx scripts/db-integrity-audit.ts --fix           # apply registered remaps
 *   npx tsx scripts/db-integrity-audit.ts --fix --quarantine <dir>
 *                                                         # export unrecoverable rows to JSON, then delete
 *   npx tsx scripts/db-integrity-audit.ts --json out.json # also write the report
 *
 * Repair policy (deliberately narrow — nothing is deleted implicitly):
 *   AgentHealth.agentId → Agent.id
 *     Root cause: the health monitor used to write the business key
 *     Agent.agentId into the FK column. `--fix` remaps such rows to the
 *     matching Agent.id. Rows that match no agent by either key are only
 *     removed with `--quarantine <dir>`, after being written to
 *     <dir>/AgentHealth-<timestamp>.json.
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { db } from '../src/lib/db';
import { parseSchema } from './lib/prisma-schema';

type OrphanFinding = {
  model: string;
  table: string;
  relation: string;
  fkColumns: string[];
  parentModel: string;
  parentTable: string;
  parentColumns: string[];
  orphanCount: number;
  sampleIds: string[];
};

type Report = {
  generatedAt: string;
  provider: 'sqlite' | 'mysql' | 'other';
  relationsChecked: number;
  findings: OrphanFinding[];
  repairs: Array<{ model: string; action: string; count: number; detail?: string }>;
  ok: boolean;
};

const args = process.argv.slice(2);
const FIX = args.includes('--fix');
const quarantineIdx = args.indexOf('--quarantine');
const QUARANTINE_DIR = quarantineIdx >= 0 ? args[quarantineIdx + 1] : undefined;
const jsonIdx = args.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;

const url = process.env.DATABASE_URL ?? '';
const provider: Report['provider'] = url.startsWith('mysql') ? 'mysql' : url.startsWith('file:') ? 'sqlite' : 'other';
const q = (ident: string) => (provider === 'mysql' ? `\`${ident}\`` : `"${ident}"`);

const schemaIdx = args.indexOf('--schema');
const SCHEMA_PATH = resolve(process.cwd(), schemaIdx >= 0 ? args[schemaIdx + 1] : 'prisma/schema.prisma');

async function countOrphans(
  childTable: string,
  fkCols: string[],
  parentTable: string,
  parentCols: string[],
): Promise<{ count: number; sample: string[] }> {
  const joinCond = fkCols.map((c, i) => `c.${q(c)} = p.${q(parentCols[i])}`).join(' AND ');
  const notNull = fkCols.map((c) => `c.${q(c)} IS NOT NULL`).join(' AND ');
  const parentNull = `p.${q(parentCols[0])} IS NULL`;
  const base = `FROM ${q(childTable)} c LEFT JOIN ${q(parentTable)} p ON ${joinCond} WHERE ${notNull} AND ${parentNull}`;
  const countRows = await db.$queryRawUnsafe<Array<{ n: number | bigint }>>(`SELECT COUNT(*) AS n ${base}`);
  const count = Number(countRows[0]?.n ?? 0);
  let sample: string[] = [];
  if (count > 0) {
    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT c.${q('id')} AS id ${base} LIMIT 5`).catch(() => []);
    sample = rows.map((r) => String(r.id));
  }
  return { count, sample };
}

async function audit(): Promise<Report> {
  const models = parseSchema(readFileSync(SCHEMA_PATH, 'utf-8'));
  const byName = new Map(models.map((m) => [m.name, m]));
  const findings: OrphanFinding[] = [];
  let relationsChecked = 0;

  for (const model of models) {
    for (const field of model.fields) {
      if (!field.relation || field.relation.fields.length === 0) continue;
      const parent = byName.get(field.type);
      if (!parent) continue;
      const fkCols = field.relation.fields;
      const parentCols = field.relation.references.length > 0
        ? field.relation.references
        : parent.fields.filter((f) => f.isId).map((f) => f.name);
      if (parentCols.length !== fkCols.length) continue;
      relationsChecked += 1;
      const { count, sample } = await countOrphans(model.name, fkCols, parent.name, parentCols);
      if (count > 0) {
        findings.push({
          model: model.name,
          table: model.name,
          relation: field.name,
          fkColumns: fkCols,
          parentModel: parent.name,
          parentTable: parent.name,
          parentColumns: parentCols,
          orphanCount: count,
          sampleIds: sample,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    provider,
    relationsChecked,
    findings,
    repairs: [],
    ok: findings.length === 0,
  };
}

/** AgentHealth.agentId written with the business key → remap to Agent.id. */
async function repairAgentHealth(report: Report): Promise<void> {
  const finding = report.findings.find((f) => f.model === 'AgentHealth' && f.relation === 'agent');
  if (!finding) return;

  const orphans = await db.$queryRawUnsafe<Array<{ id: string; agentId: string }>>(
    `SELECT c.${q('id')} AS id, c.${q('agentId')} AS agentId FROM ${q('AgentHealth')} c
     LEFT JOIN ${q('Agent')} p ON c.${q('agentId')} = p.${q('id')} WHERE p.${q('id')} IS NULL`,
  );

  let remapped = 0;
  const unrecoverable: Array<{ id: string; agentId: string }> = [];
  for (const row of orphans) {
    const agent = await db.agent.findUnique({ where: { agentId: row.agentId }, select: { id: true } });
    if (!agent) { unrecoverable.push(row); continue; }
    // Merge into an existing row for the same agent if one exists (keep newest).
    const existing = await db.agentHealth.findFirst({ where: { agentId: agent.id }, orderBy: { checkedAt: 'desc' } });
    if (existing && existing.id !== row.id) {
      await db.$executeRawUnsafe(`DELETE FROM ${q('AgentHealth')} WHERE ${q('id')} = ?`, row.id);
      report.repairs.push({ model: 'AgentHealth', action: 'merged-duplicate', count: 1, detail: `${row.id} → ${existing.id}` });
    } else {
      await db.$executeRawUnsafe(`UPDATE ${q('AgentHealth')} SET ${q('agentId')} = ? WHERE ${q('id')} = ?`, agent.id, row.id);
      remapped += 1;
    }
  }
  if (remapped > 0) report.repairs.push({ model: 'AgentHealth', action: 'remapped-business-key-to-id', count: remapped });

  if (unrecoverable.length > 0) {
    if (QUARANTINE_DIR) {
      mkdirSync(QUARANTINE_DIR, { recursive: true });
      const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM ${q('AgentHealth')} WHERE ${q('id')} IN (${unrecoverable.map(() => '?').join(',')})`,
        ...unrecoverable.map((r) => r.id),
      );
      const file = join(QUARANTINE_DIR, `AgentHealth-${Date.now()}.json`);
      writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), reason: 'orphan AgentHealth rows (no Agent by id or agentId)', rows }, null, 2));
      await db.$executeRawUnsafe(
        `DELETE FROM ${q('AgentHealth')} WHERE ${q('id')} IN (${unrecoverable.map(() => '?').join(',')})`,
        ...unrecoverable.map((r) => r.id),
      );
      report.repairs.push({ model: 'AgentHealth', action: 'quarantined', count: unrecoverable.length, detail: file });
    } else {
      report.repairs.push({ model: 'AgentHealth', action: 'left-in-place (use --quarantine <dir>)', count: unrecoverable.length });
    }
  }
}

async function main() {
  const report = await audit();
  if (FIX && !report.ok) {
    await repairAgentHealth(report);
    const after = await audit();
    report.findings = after.findings;
    report.ok = after.ok;
  }
  const text = JSON.stringify(report, null, 2);
  if (JSON_OUT) writeFileSync(JSON_OUT, text);
  console.log(text);
  await db.$disconnect();
  process.exit(report.ok ? 0 : 2);
}

main().catch(async (err) => {
  console.error('[db-integrity-audit] failed:', err);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
