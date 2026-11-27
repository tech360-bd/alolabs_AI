#!/usr/bin/env npx tsx
/**
 * verify:orchestration — parent/child run relationships in the real database.
 *
 * Proves the persistence half of multi-agent fan-out: a parent run, several child
 * runs carrying `parentRunId`, the coordinator's events on the parent timeline, and
 * cascading cancellation through the run engine.
 *
 * **The executor is a stub.** No model is called and no agent does work: the point
 * is the plumbing (rows, relations, events, cancellation), which is exactly what a
 * mocked unit test cannot show. Everything it creates is deleted before it exits.
 *
 * Usage:
 *   PRISMA_SQLITE_ADAPTER=1 DATABASE_URL=file:./db/custom.db npm run verify:orchestration
 */

import { db } from '../src/lib/db';
import { createRun, cancelRun, getRun, recordRunEvent } from '../src/lib/runs';
import { orchestrate, type RunPort, type ChildResult } from '../src/lib/orchestration/coordinator';
import type { AgentDescriptor, Subtask } from '../src/lib/orchestration/plan';

const PROBE_SLUG = 'orchestration-verify-co';

const agents: AgentDescriptor[] = [
  { id: 'stub.a', name: 'Stub A', kind: 'analysis', capabilities: ['analysis'], tools: [], health: 'available', maxConcurrency: 1, tenantScope: 'platform', version: 'stub', resourceBudget: { tokensPerRun: 0, minutesPerRun: 1 } },
  { id: 'stub.b', name: 'Stub B', kind: 'analysis', capabilities: ['analysis'], tools: [], health: 'available', maxConcurrency: 1, tenantScope: 'platform', version: 'stub', resourceBudget: { tokensPerRun: 0, minutesPerRun: 1 } },
];

const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name} — ${detail}`);
};

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to run against NODE_ENV=production');

  const company =
    (await db.company.findFirst({ where: { slug: PROBE_SLUG } })) ??
    (await db.company.create({ data: { name: 'Orchestration Verify Co', slug: PROBE_SLUG, status: 'active' } }));

  const { runId: parentRunId } = await createRun({ objective: 'verify orchestration', companyId: company.id });
  const childIds: string[] = [];
  const startedAt = new Map<string, number>();
  let maxConcurrent = 0;
  const running = new Set<string>();

  const subtasks: Subtask[] = [
    { id: 'sub-1', title: 'First', instruction: 'first target', requiredCapabilities: ['analysis'], scope: 'read-only', dependsOn: [] },
    { id: 'sub-2', title: 'Second', instruction: 'second target', requiredCapabilities: ['analysis'], scope: 'read-only', dependsOn: [] },
  ];

  const port: RunPort = {
    async createChild({ parentRunId: parent, subtask }) {
      const child = await createRun({
        objective: `[stub] ${subtask.title}`,
        companyId: company.id,
        parentRunId: parent,
      });
      childIds.push(child.runId);
      startedAt.set(child.runId, Date.now());
      running.add(child.runId);
      maxConcurrent = Math.max(maxConcurrent, running.size);
      return child.runId;
    },
    async status(childRunId): Promise<ChildResult> {
      if (Date.now() - (startedAt.get(childRunId) ?? 0) < 150) return { status: 'running' };
      running.delete(childRunId);
      return { status: 'completed', summary: `stub output for ${childRunId.slice(0, 8)}` };
    },
    async cancel(childRunId) {
      await cancelRun(childRunId, company.id).catch(() => false);
    },
    async parentStopped() {
      return false;
    },
    async emit(parent, type, data) {
      await recordRunEvent({ runId: parent, type, source: 'orchestrator', data });
    },
  };

  try {
    const assignments = new Map<string, AgentDescriptor>([
      ['sub-1', agents[0]],
      ['sub-2', agents[1]],
    ]);

    const result = await orchestrate({
      parentRunId,
      subtasks,
      agents,
      assignments,
      port,
      concurrency: 2,
      pollIntervalMs: 25,
    });

    check('fan-out completed', result.outcome === 'completed', result.outcome);
    check('two child runs created', childIds.length === 2, String(childIds.length));
    check('children overlapped in time', maxConcurrent === 2, `maxConcurrent=${maxConcurrent}`);

    const children = await db.agentOSRun.findMany({ where: { parentRunId } });
    check('children carry parentRunId in the database', children.length === 2, `${children.length} rows`);

    const events = await db.runEvent.findMany({ where: { runId: parentRunId } });
    const types = events.map((event) => event.type);
    check('parent timeline recorded the fan-out', types.includes('run.fanout.planned') && types.includes('run.fanout.reconciled'), types.join(','));
    check('each child dispatch is on the timeline', types.filter((type) => type === 'run.fanout.dispatched').length === 2, `${types.filter((t) => t === 'run.fanout.dispatched').length} dispatches`);

    // Cascading cancellation through the real engine.
    await db.agentOSRun.update({ where: { id: childIds[1] }, data: { status: 'running' } });
    await cancelRun(parentRunId, company.id);
    const childAfter = await getRun(childIds[1]);
    check('cancelling the parent cancelled its child', childAfter?.status === 'cancelled', String(childAfter?.status));
  } finally {
    for (const childId of childIds) {
      await db.queueItem.deleteMany({ where: { jobId: childId } }).catch(() => {});
      await db.runEvent.deleteMany({ where: { runId: childId } }).catch(() => {});
      await db.agentOSRun.deleteMany({ where: { id: childId } }).catch(() => {});
    }
    await db.queueItem.deleteMany({ where: { jobId: parentRunId } }).catch(() => {});
    await db.runEvent.deleteMany({ where: { runId: parentRunId } }).catch(() => {});
    await db.agentOSRun.deleteMany({ where: { id: parentRunId } }).catch(() => {});
    await db.auditEvent.deleteMany({ where: { companyId: company.id } }).catch(() => {});
    await db.company.deleteMany({ where: { slug: PROBE_SLUG } }).catch(() => {});
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\nverify:orchestration — ${checks.length - failed.length}/${checks.length} checks passed (stub executor; no model called)`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('verify:orchestration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
