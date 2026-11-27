#!/usr/bin/env npx tsx
/**
 * verify:operator — runtime proof that the Command Center dispatch path works.
 *
 * The unit and route tests mock the database. This script does the opposite: it
 * talks to a real SQLite database, dispatches two instructions through the real
 * dispatcher, and checks the rows that must exist afterwards.
 *
 *   read-only instruction  → Command + AgentOSRun + QueueItem + RunEvent
 *   production instruction → Command(blocked) + Approval, and **no** run
 *
 * It writes only to `runtime-verify-co` and deletes what it created before it
 * exits, so it is safe to run against a development database and safe to run
 * twice. It refuses to run against anything that looks like production.
 *
 * Usage:
 *   PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npm run verify:operator
 */

import { db } from '../src/lib/db';
import { dispatchOperatorInstruction } from '../src/lib/super-admin/dispatch';

const PROBE_SLUG = 'runtime-verify-co';
const COMPANY = 'Verification Probe Co';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];
function check(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name} — ${detail}`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to run against NODE_ENV=production');
  }

  const company =
    (await db.company.findFirst({ where: { slug: PROBE_SLUG } })) ??
    (await db.company.create({ data: { name: COMPANY, slug: PROBE_SLUG, status: 'active' } }));

  const created = { commands: [] as string[], approvals: [] as string[], runs: [] as string[] };

  try {
    // ── 1. A read-only instruction must become a durable run ────────────────
    const read = await dispatchOperatorInstruction({
      instruction: 'Show me which agents are running and what they are doing',
      companyId: company.id,
    });
    check('read instruction classified as an inspection', read.status === 'dispatched', read.status);
    if (read.status !== 'dispatched') throw new Error(`expected dispatched, got ${read.status}`);
    created.commands.push(read.commandId);
    created.runs.push(read.runId);

    const run = await db.agentOSRun.findUnique({ where: { id: read.runId } });
    check('run row persisted', Boolean(run), run ? `status=${run.status} company=${run.companyId}` : 'missing');
    check('run carries the dispatching tenant', run?.companyId === company.id, String(run?.companyId));

    const queueItem = await db.queueItem.findFirst({ where: { jobId: read.runId } });
    check('queue item enqueued for the run', Boolean(queueItem), queueItem ? `status=${queueItem.status}` : 'missing');

    const events = await db.runEvent.findMany({ where: { runId: read.runId }, orderBy: { createdAt: 'asc' } });
    check(
      'run.queued event recorded (replayable timeline)',
      events.some((event) => event.type === 'run.queued'),
      events.map((event) => event.type).join(',') || 'none',
    );

    const command = await db.command.findUnique({ where: { id: read.commandId } });
    check('command row persisted with the parsed intent', command?.parsedIntent === 'inspect_agents', String(command?.parsedIntent));
    check('command marked processing', command?.status === 'processing', String(command?.status));

    // ── 2. A production instruction must stop at an approval ───────────────
    const gated = await dispatchOperatorInstruction({
      instruction: 'Deploy the approved changes to production',
      companyId: company.id,
    });
    check('production instruction gated', gated.status === 'approval_required', gated.status);
    if (gated.status !== 'approval_required') throw new Error(`expected approval_required, got ${gated.status}`);
    created.commands.push(gated.commandId);
    created.approvals.push(gated.approvalId);

    const approval = await db.approval.findUnique({ where: { id: gated.approvalId } });
    check('approval row persisted', Boolean(approval), approval ? `type=${approval.type} risk=${approval.riskLevel}` : 'missing');
    check('approval is scoped to the tenant', approval?.companyId === company.id, String(approval?.companyId));
    check('approval request carries the work order', (approval?.requestJson ?? '').includes('deploy_to_production'), 'requestJson');

    const gatedRun = await db.agentOSRun.findFirst({ where: { commandId: gated.commandId } });
    check('no run was started for the gated instruction', gatedRun === null, gatedRun ? gatedRun.id : 'none');

    const gatedCommand = await db.command.findUnique({ where: { id: gated.commandId } });
    check('gated command is blocked, not failed or done', gatedCommand?.status === 'blocked', String(gatedCommand?.status));

    // ── 3. An unmatched instruction is refused cleanly, not silently run ───
    const empty = await dispatchOperatorInstruction({ instruction: '   ', companyId: company.id });
    check('empty instruction rejected', empty.status === 'rejected', empty.status);

    const noTenant = await dispatchOperatorInstruction({ instruction: 'Inspect capacity', companyId: 'default-company' });
    check('pseudo-tenant rejected (T-2)', noTenant.status === 'rejected', noTenant.status);
  } finally {
    // Leave the database exactly as it was found.
    for (const runId of created.runs) {
      await db.queueItem.deleteMany({ where: { jobId: runId } }).catch(() => {});
      await db.runEvent.deleteMany({ where: { runId } }).catch(() => {});
      await db.agentOSRun.deleteMany({ where: { id: runId } }).catch(() => {});
    }
    for (const approvalId of created.approvals) {
      await db.auditEvent.deleteMany({ where: { resourceId: approvalId } }).catch(() => {});
      await db.approval.deleteMany({ where: { id: approvalId } }).catch(() => {});
    }
    for (const commandId of created.commands) {
      await db.task.deleteMany({ where: { commandId } }).catch(() => {});
      await db.command.deleteMany({ where: { id: commandId } }).catch(() => {});
    }
    await db.auditEvent.deleteMany({ where: { companyId: company.id } }).catch(() => {});
    await db.company.deleteMany({ where: { slug: PROBE_SLUG } }).catch(() => {});
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\nverify:operator — ${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('verify:operator failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
