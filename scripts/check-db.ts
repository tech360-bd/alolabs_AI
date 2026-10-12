import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function check() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     ALO LABS AGENT HUB — COMPLETE DATABASE AUDIT        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const checks: [string, Promise<number>][] = [
    ['Users', db.user.count()],
    ['Roles', db.role.count()],
    ['Permissions', db.permission.count()],
    ['RolePermissions', db.rolePermission.count()],
    ['Companies', db.company.count()],
    ['CompanyUsers', db.companyUser.count()],
    ['CompanyApiKeys', db.companyApiKey.count()],
    ['CompanyPermissions', db.companyPermission.count()],
    ['Departments', db.department.count()],
    ['Agents', db.agent.count()],
    ['Skills', db.skill.count()],
    ['Workflows', db.workflow.count()],
    ['WorkflowSteps', db.workflowStep.count()],
    ['Tasks', db.task.count()],
    ['Approvals', db.approval.count()],
    ['UsageLogs', db.usageLog.count()],
    ['PaymentGuardLogs', db.paymentGuardLog.count()],
    ['ProtectionLogs', db.protectionLog.count()],
    ['AuditLogs', db.auditLog.count()],
    ['AgentMemory', db.agentMemory.count()],
    ['WebhookConfigs', db.webhookConfig.count()],
    ['Settings', db.settings.count()],
  ];

  let total = 0;
  const results: [string, number][] = [];
  for (const [name, promise] of checks) {
    const count = await promise;
    total += count;
    results.push([name, count]);
  }

  for (const [name, count] of results) {
    const icon = count > 0 ? '✅' : '⚪';
    const bar = '█'.repeat(Math.min(20, Math.ceil(count / 50)));
    console.log(`  ${icon} ${name.padEnd(22)} ${String(count).padStart(5)}  ${bar}`);
  }
  console.log('  ' + '─'.repeat(55));
  console.log(`  📊 TOTAL RECORDS:       ${total}`);
  console.log(`  📊 TOTAL TABLES CHECKED: ${results.length}\n`);

  // Agent range verification
  const first = await db.agent.findFirst({ orderBy: { agentId: 'asc' } });
  const last = await db.agent.findFirst({ orderBy: { agentId: 'desc' } });
  console.log(`  🔵 First Agent: ${first?.agentId} — ${first?.name}`);
  console.log(`  🔵 Last Agent:  ${last?.agentId} — ${last?.name}\n`);

  // Companies
  const companies = await db.company.findMany({ orderBy: { createdAt: 'asc' } });
  console.log('  🏢 Companies:');
  for (const c of companies) {
    const crm = c.webCrmConnected ? 'CRM✅' : '     ';
    console.log(`     ${crm}  ${c.name}`);
  }

  await db.$disconnect();
}

check().catch(e => { console.error(e.message); process.exit(1); });