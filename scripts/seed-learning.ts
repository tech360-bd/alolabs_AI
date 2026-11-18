/** One labelled, idempotent learning fixture on one explicitly selected local
 * agent. Never invent fleet-wide production knowledge or execution telemetry. */
import { previewLearning } from './shared/learning-preview';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--preview') {
    for (const sample of previewLearning(Number(args[1]))) console.log(JSON.stringify(sample));
    return;
  }
  if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.startsWith('file:') || args.length !== 2 || args[0] !== '--demo-agent') {
    throw new Error('Use --preview <1..2000> for synthetic JSON lines (no DB), or --demo-agent <id> on disposable local SQLite.');
  }
  const { db } = await import('../src/lib/db');
  try {
    const agent = await db.agent.findUniqueOrThrow({ where: { id: args[1] }, select: { id: true, companyId: true } });
    const id = `demo-learning:${agent.id}`;
    await db.$transaction([
      db.agentMemory.upsert({ where: { id }, update: {}, create: { id, agentId: agent.id, companyId: agent.companyId, category: 'learning', content: 'Demonstration learning record, not evidence of a completed agent run.', source: 'demo_fixture', tags: '["demo"]', isVerified: false } }),
      db.agentLearningSession.upsert({ where: { id }, update: {}, create: { id, agentId: agent.id, companyId: agent.companyId, triggerType: 'manual', triggerDetail: 'Demonstration only', status: 'pending' } }),
    ]);
    console.log('Local demo learning fixture present (one memory, one pending session).');
  } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
