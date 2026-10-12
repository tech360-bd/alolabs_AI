import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function check() {
  const first = await db.agent.findFirst({ orderBy: { agentId: 'asc' } });
  const last = await db.agent.findFirst({ orderBy: { agentId: 'desc' } });
  const count = await db.agent.count();
  const samples = await db.agent.findMany({
    where: { agentId: { in: ['AGENT-0001','AGENT-0500','AGENT-1000','AGENT-1500','AGENT-1900','AGENT-1999','AGENT-2000'] } },
    select: { agentId: true, name: true }
  });
  console.log('Total agents:', count);
  console.log('First by ID:', first?.agentId, '-', first?.name);
  console.log('Last by ID: ', last?.agentId, '-', last?.name);
  console.log('Samples:');
  for (const s of samples) console.log('  ', s.agentId, '-', s.name);

  // Check for missing agent IDs
  const all = await db.agent.findMany({ select: { agentId: true }, orderBy: { agentId: 'asc' } });
  const ids = all.map(a => a.agentId);
  const missing: string[] = [];
  for (let i = 1; i <= 2000; i++) {
    const id = 'AGENT-' + String(i).padStart(4, '0');
    if (!ids.includes(id)) missing.push(id);
  }
  if (missing.length > 0) {
    console.log('\nMISSING AGENT IDs (' + missing.length + '):');
    console.log('  First 10:', missing.slice(0, 10).join(', '));
    console.log('  Last 10:', missing.slice(-10).join(', '));
  } else {
    console.log('\nAll AGENT-0001 to AGENT-2000 present!');
  }

  await db.$disconnect();
}
check().catch(e => { console.error(e.message); process.exit(1); });