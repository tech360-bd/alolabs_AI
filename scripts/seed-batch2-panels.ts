import { db } from '../src/lib/db';

async function seed() {
  console.log('Seeding notifications, backups, workers data...');

  // Seed notifications
  const notificationTypes = [
    { type: 'approval_required', title: 'Deployment Approval Needed', message: 'Production deployment for api.alolabs.io requires your approval before proceeding.', read: false, priority: 'high' },
    { type: 'security_alert', title: 'Suspicious Login Detected', message: 'Multiple failed login attempts detected from IP 192.168.1.45. Account temporarily locked.', read: false, priority: 'critical' },
    { type: 'system_update', title: 'System Update Available', message: 'AgentOS v2.4.1 is available with performance improvements and security patches.', read: true, priority: 'low' },
    { type: 'job_completed', title: 'Monthly Report Generated', message: 'Finance department monthly report has been generated and is ready for review.', read: false, priority: 'medium' },
    { type: 'agent_alert', title: 'Agent Memory Threshold', message: 'Agent CRM-Sales-01 has exceeded 80% memory allocation. Consider scaling.', read: true, priority: 'high' },
    { type: 'usage_warning', title: 'Token Budget Warning', message: 'Company Acme Corp has used 85% of monthly token budget (170K/200K tokens).', read: false, priority: 'high' },
    { type: 'approval_required', title: 'New Agent Registration', message: 'Agent "Legal-Compliance-03" requests registration in the Legal department.', read: true, priority: 'medium' },
    { type: 'security_alert', title: 'API Key Expiring', message: 'API key for external integration "Salesforce" expires in 3 days. Rotate immediately.', read: false, priority: 'high' },
    { type: 'job_completed', title: 'Data Migration Complete', message: 'Migration of 15,000 company records completed successfully in 4m 23s.', read: true, priority: 'low' },
    { type: 'system_update', title: 'Database Maintenance', message: 'Scheduled database maintenance completed. All systems operational.', read: true, priority: 'low' },
    { type: 'agent_alert', title: 'Worker Pool Scaling', message: 'Auto-scale triggered: increased worker pool from 4 to 6 workers due to high queue depth.', read: false, priority: 'medium' },
    { type: 'usage_warning', title: 'Rate Limit Approaching', message: 'API endpoint /api/agents is approaching rate limit (950/1000 req/min).', read: true, priority: 'medium' },
  ];

  for (const n of notificationTypes) {
    await db.settings.upsert({
      where: { key: `notification:${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
      create: {
        key: `notification:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        value: JSON.stringify(n),
      },
      update: {},
    });
  }
  console.log(`  ✓ Seeded ${notificationTypes.length} notifications`);

  // Seed backups
  const backupEntries = [
    { type: 'scheduled', size: 245, status: 'completed', duration: 67, compression: true },
    { type: 'manual', size: 238, status: 'completed', duration: 52, compression: true },
    { type: 'scheduled', size: 220, status: 'completed', duration: 58, compression: true },
    { type: 'manual', size: 310, status: 'completed', duration: 89, compression: false },
    { type: 'scheduled', size: 215, status: 'failed', duration: 12, compression: true },
    { type: 'scheduled', size: 200, status: 'completed', duration: 45, compression: true },
  ];

  for (let i = 0; i < backupEntries.length; i++) {
    const b = backupEntries[i];
    const date = new Date();
    date.setDate(date.getDate() - i);
    await db.settings.create({
      data: {
        key: `backup:bk_${Date.now()}_${i}`,
        value: JSON.stringify({ backupId: `bk_${Date.now()}_${i}`, ...b }),
        createdAt: date,
        updatedAt: date,
      },
    });
  }
  console.log(`  ✓ Seeded ${backupEntries.length} backups`);

  // Seed backup config
  await db.settings.upsert({
    where: { key: 'backup_config' },
    create: { key: 'backup_config', value: JSON.stringify({ autoBackup: true, schedule: 'daily', retentionDays: 30, compression: true }) },
    update: {},
  });
  console.log('  ✓ Seeded backup config');

  // Seed workers
  const workerEntries = [
    { name: 'worker-cpu-01', type: 'cpu', status: 'running', currentJob: 'task_report_generation', completedCount: 1247, uptime: 86400, memory: 512 },
    { name: 'worker-cpu-02', type: 'cpu', status: 'running', currentJob: 'task_data_migration', completedCount: 983, uptime: 86400, memory: 384 },
    { name: 'worker-gpu-01', type: 'gpu', status: 'running', currentJob: 'task_model_inference', completedCount: 456, uptime: 43200, memory: 2048 },
    { name: 'worker-gpu-02', type: 'gpu', status: 'idle', currentJob: null, completedCount: 389, uptime: 43200, memory: 2048 },
    { name: 'worker-io-01', type: 'io', status: 'running', currentJob: 'task_file_processing', completedCount: 2103, uptime: 172800, memory: 256 },
    { name: 'worker-io-02', type: 'io', status: 'stopped', currentJob: null, completedCount: 1876, uptime: 0, memory: 0 },
  ];

  for (const w of workerEntries) {
    await db.settings.create({
      data: {
        key: `worker:${w.name}`,
        value: JSON.stringify(w),
      },
    });
  }
  console.log(`  ✓ Seeded ${workerEntries.length} workers`);

  // Seed worker pool config
  await db.settings.upsert({
    where: { key: 'worker_pool_config' },
    create: { key: 'worker_pool_config', value: JSON.stringify({ minWorkers: 2, maxWorkers: 8, autoScale: true }) },
    update: {},
  });
  console.log('  ✓ Seeded worker pool config');

  // Seed some deployments
  const existingDeployments = await db.domainDeployment.count();
  if (existingDeployments === 0) {
    const domains = [
      { domain: 'app.alolabs.io', projectType: 'nextjs', status: 'success', sslStatus: 'active' },
      { domain: 'api.alolabs.io', projectType: 'api', status: 'success', sslStatus: 'active' },
      { domain: 'docs.alolabs.io', projectType: 'static', status: 'success', sslStatus: 'active' },
      { domain: 'staging.alolabs.io', projectType: 'nextjs', status: 'failed', sslStatus: 'none' },
      { domain: 'portal.alolabs.io', projectType: 'react', status: 'pending', sslStatus: 'pending' },
    ];

    for (const d of domains) {
      const steps = [
        { step: 1, message: 'Deployment request received', timestamp: new Date().toISOString() },
        { step: 2, message: `Checking DNS for ${d.domain}`, timestamp: new Date().toISOString() },
        { step: 3, message: 'Building project assets', timestamp: new Date().toISOString() },
      ];
      if (d.status === 'success') {
        steps.push(
          { step: 4, message: 'Deploying to CDN', timestamp: new Date().toISOString() },
          { step: 5, message: 'Configuring SSL certificate', timestamp: new Date().toISOString() },
          { step: 6, message: `Deployment complete for ${d.domain}`, timestamp: new Date().toISOString() },
        );
      } else if (d.status === 'failed') {
        steps.push(
          { step: 4, message: 'Build failed: dependency resolution error', timestamp: new Date().toISOString() },
        );
      }

      await db.domainDeployment.create({
        data: {
          domain: d.domain,
          projectType: d.projectType,
          status: d.status,
          deployLog: JSON.stringify(steps),
          sslStatus: d.sslStatus,
        },
      });
    }
    console.log('  ✓ Seeded 5 deployments');
  }

  console.log('\n✅ All demo data seeded successfully!');
}

seed()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => process.exit(0));