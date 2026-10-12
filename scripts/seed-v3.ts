import { db } from '../src/lib/db'

async function main() {
  console.log('🌱 Seeding new enterprise tables...')

  // 1. Subscription Plans
  const plans = [
    { name: 'Starter', slug: 'starter', description: 'For small teams getting started with AI agents', priceMonthly: 99, priceYearly: 990, agentLimit: 50, skillLimit: 100, workflowLimit: 25, monthlyTokens: 500000, monthlyRequests: 10000, features: JSON.stringify(['5 Departments', '50 Agents', '100 Skills', 'Basic RAG', 'Email Support']), isEnterprise: false, sortOrder: 1, isActive: true },
    { name: 'Growth', slug: 'growth', description: 'For growing companies scaling their AI workforce', priceMonthly: 299, priceYearly: 2990, agentLimit: 200, skillLimit: 500, workflowLimit: 75, monthlyTokens: 2000000, monthlyRequests: 50000, features: JSON.stringify(['20 Departments', '200 Agents', '500 Skills', 'Advanced RAG', 'Priority Support', 'Custom Branding', 'API Access']), isEnterprise: false, sortOrder: 2, isActive: true },
    { name: 'Enterprise', slug: 'enterprise', description: 'Full AI workforce for large organizations', priceMonthly: 999, priceYearly: 9990, agentLimit: 1000, skillLimit: 2000, workflowLimit: 200, monthlyTokens: 10000000, monthlyRequests: 200000, features: JSON.stringify(['Unlimited Departments', '1000 Agents', '2000 Skills', 'Private RAG', 'Dedicated Support', 'Custom Integrations', 'SSO/SAML', 'SLA Guarantee', 'On-Premise Option']), isEnterprise: true, sortOrder: 3, isActive: true },
    { name: 'ALO Internal', slug: 'alo-internal', description: 'Internal plan for ALO Labs and sister companies', priceMonthly: 0, priceYearly: 0, agentLimit: 2000, skillLimit: 5000, workflowLimit: 500, monthlyTokens: 50000000, monthlyRequests: 1000000, features: JSON.stringify(['Unlimited Everything', 'Full Access', 'Priority Queue', 'Dedicated Infrastructure', 'Custom Development', 'Direct Engineering Support', 'All Future Features']), isEnterprise: true, sortOrder: 0, isActive: true },
  ]

  for (const plan of plans) {
    await db.subscriptionPlan.upsert({ where: { slug: plan.slug }, update: plan, create: plan })
  }
  console.log(`  ✅ ${plans.length} subscription plans`)

  // 2. Subscriptions for all companies
  const companies = await db.company.findMany({ select: { id: true, slug: true, name: true } })
  const aloInternalPlan = await db.subscriptionPlan.findUnique({ where: { slug: 'alo-internal' } })

  for (const company of companies) {
    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    await db.subscription.upsert({
      where: { companyId: company.id },
      update: {},
      create: {
        companyId: company.id,
        planId: aloInternalPlan!.id,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    })
  }
  console.log(`  ✅ ${companies.length} company subscriptions`)

  // 3. Token Budgets for all companies
  for (const company of companies) {
    await db.tokenBudget.upsert({
      where: { companyId: company.id },
      update: {},
      create: {
        companyId: company.id,
        monthlyBudget: 50000000,
        monthlyUsed: Math.floor(Math.random() * 5000000),
        dailyBudget: 2000000,
        dailyUsed: Math.floor(Math.random() * 100000),
        warningThreshold: 0.8,
        blockThreshold: 1.0,
        resetDayOfMonth: 1,
      },
    })
  }
  console.log(`  ✅ ${companies.length} token budgets`)

  // 4. Tenant Configs
  for (const company of companies) {
    await db.tenantConfig.upsert({
      where: { companyId: company.id },
      update: {},
      create: {
        companyId: company.id,
        primaryColor: '#003ABC',
        timezone: 'Asia/Dhaka',
        locale: 'en',
        notificationsEnabled: true,
        webhookTimeoutMs: 30000,
        maxConcurrentJobs: 5,
      },
    })
  }
  console.log(`  ✅ ${companies.length} tenant configs`)

  // 5. Job Queues
  const queues = [
    { name: 'agent-execution', description: 'Primary queue for agent execution jobs', concurrency: 5, maxRetries: 3, isActive: true },
    { name: 'workflow-execution', description: 'Workflow orchestration queue', concurrency: 3, maxRetries: 2, isActive: true },
    { name: 'email-delivery', description: 'Email sending queue with retry logic', concurrency: 2, maxRetries: 5, isActive: true },
    { name: 'report-generation', description: 'Background report generation', concurrency: 2, maxRetries: 1, isActive: true },
    { name: 'maintenance', description: 'System maintenance and cleanup jobs', concurrency: 1, maxRetries: 1, isActive: true },
  ]

  for (const q of queues) {
    await db.jobQueue.upsert({ where: { name: q.name }, update: {}, create: q })
  }
  console.log(`  ✅ ${queues.length} job queues`)

  // 6. Sample Queue Items
  const agentQueue = await db.jobQueue.findUnique({ where: { name: 'agent-execution' } })
  const workflowQueue = await db.jobQueue.findUnique({ where: { name: 'workflow-execution' } })

  const sampleItems = [
    { queueId: agentQueue!.id, jobType: 'agent_run', priority: 5, payload: JSON.stringify({ agentId: 'AGENT-0001', input: 'Process customer inquiry' }), status: 'completed', attempts: 1 },
    { queueId: agentQueue!.id, jobType: 'agent_run', priority: 3, payload: JSON.stringify({ agentId: 'AGENT-0005', input: 'Generate monthly report' }), status: 'completed', attempts: 1 },
    { queueId: agentQueue!.id, jobType: 'agent_run', priority: 7, payload: JSON.stringify({ agentId: 'AGENT-0012', input: 'Analyze sales data' }), status: 'processing', attempts: 1 },
    { queueId: agentQueue!.id, jobType: 'agent_run', priority: 2, payload: JSON.stringify({ agentId: 'AGENT-0020', input: 'Update CRM records' }), status: 'queued', attempts: 0 },
    { queueId: workflowQueue!.id, jobType: 'workflow_run', priority: 8, payload: JSON.stringify({ workflowId: 'wf-onboarding', companyId: companies[0]?.id }), status: 'completed', attempts: 1 },
    { queueId: workflowQueue!.id, jobType: 'workflow_run', priority: 4, payload: JSON.stringify({ workflowId: 'wf-report-generation' }), status: 'queued', attempts: 0 },
  ]

  for (const item of sampleItems) {
    await db.queueItem.create({
      data: {
        ...item,
        maxAttempts: 3,
        startedAt: item.status !== 'queued' ? new Date() : null,
        completedAt: item.status === 'completed' ? new Date() : null,
      },
    })
  }
  console.log(`  ✅ ${sampleItems.length} sample queue items`)

  // 7. Sample Marketplace Listings
  const agents = await db.agent.findMany({ take: 5, select: { id: true, name: true, purpose: true, departmentName: true } })
  const skills = await db.skill.findMany({ take: 5, select: { id: true, name: true, category: true, purpose: true } })

  const listings = [
    { type: 'agent', itemId: agents[0]?.id, title: `Customer Support Agent`, description: 'AI-powered customer support agent that handles inquiries, escalations, and follow-ups across multiple channels.', category: 'Customer Service', tags: JSON.stringify(['support', 'customer-service', 'multi-channel']), authorName: 'ALO Labs', pricing: 'free', installCount: 45, rating: 4.7, reviewCount: 12, featured: true },
    { type: 'agent', itemId: agents[1]?.id, title: `Data Analysis Specialist`, description: 'Specialized agent for data analysis, visualization, and insight generation from structured datasets.', category: 'Analytics', tags: JSON.stringify(['data', 'analytics', 'visualization']), authorName: 'ALO Labs', pricing: 'free', installCount: 32, rating: 4.5, reviewCount: 8 },
    { type: 'skill', itemId: skills[0]?.id, title: `Email Composition Pro`, description: 'Advanced email writing skill with tone adjustment, template management, and multi-language support.', category: 'Communication', tags: JSON.stringify(['email', 'writing', 'communication']), authorName: 'ALO Labs', pricing: 'premium', priceMonthly: 29, installCount: 78, rating: 4.8, reviewCount: 23, featured: true },
    { type: 'skill', itemId: skills[1]?.id, title: `Code Review Assistant`, description: 'Automated code review skill that checks for bugs, security vulnerabilities, and best practices.', category: 'Development', tags: JSON.stringify(['code', 'review', 'security']), authorName: 'ALO Labs', pricing: 'free', installCount: 56, rating: 4.6, reviewCount: 15 },
    { type: 'workflow', itemId: 'wf-onboarding', title: `Employee Onboarding Pipeline`, description: 'End-to-end employee onboarding workflow with document generation, IT setup, and training scheduling.', category: 'HR', tags: JSON.stringify(['onboarding', 'hr', 'automation']), authorName: 'ALO Labs', pricing: 'enterprise', priceMonthly: 99, installCount: 12, rating: 4.9, reviewCount: 5 },
  ]

  for (const listing of listings) {
    await db.marketplaceListing.create({ data: listing })
  }
  console.log(`  ✅ ${listings.length} marketplace listings`)

  // 8. Sample Metrics
  const metricNames = ['request_latency_ms', 'requests_total', 'errors_total', 'active_agents', 'queue_depth', 'token_usage_total', 'llm_calls_total']
  for (let i = 0; i < 50; i++) {
    const name = metricNames[Math.floor(Math.random() * metricNames.length)]
    await db.metric.create({
      data: {
        name,
        value: Math.floor(Math.random() * 1000),
        labels: JSON.stringify({ source: 'auto-generated' }),
        unit: name.includes('latency') ? 'ms' : name.includes('total') ? 'count' : '',
        createdAt: new Date(Date.now() - Math.random() * 86400000 * 7),
      },
    })
  }
  console.log(`  ✅ 50 sample metrics`)

  // 9. Sample Alerts
  const alerts = [
    { name: 'High Error Rate', severity: 'critical', condition: JSON.stringify({ metric: 'errors_total', threshold: 100, operator: '>' }) },
    { name: 'Token Budget Warning', severity: 'warning', condition: JSON.stringify({ metric: 'token_usage_total', threshold: 0.8, operator: '>' }) },
    { name: 'Queue Depth High', severity: 'warning', condition: JSON.stringify({ metric: 'queue_depth', threshold: 50, operator: '>' }) },
    { name: 'Agent Memory Low', severity: 'info', condition: JSON.stringify({ metric: 'memory_usage', threshold: 0.9, operator: '>' }) },
  ]

  for (const alert of alerts) {
    await db.alert.create({ data: { ...alert, isFiring: alert.severity === 'critical' } })
  }
  console.log(`  ✅ ${alerts.length} sample alerts`)

  // 10. Sample Token Usage Records
  for (let i = 0; i < 30; i++) {
    const agent = agents[Math.floor(Math.random() * agents.length)]
    const promptTokens = Math.floor(Math.random() * 5000)
    const completionTokens = Math.floor(Math.random() * 3000)
    await db.tokenUsage.create({
      data: {
        companyId: companies[Math.floor(Math.random() * companies.length)]?.id,
        agentId: agent?.id,
        model: ['deepseek-v3', 'deepseek-r1'][Math.floor(Math.random() * 2)],
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costEstimate: parseFloat(((promptTokens + completionTokens) * 0.000001).toFixed(6)),
        createdAt: new Date(Date.now() - Math.random() * 86400000 * 3),
      },
    })
  }
  console.log(`  ✅ 30 sample token usage records`)

  // 11. Sample Quality Assessments
  for (let i = 0; i < 20; i++) {
    const agent = agents[Math.floor(Math.random() * agents.length)]
    const levels = ['draft', 'junior', 'mid', 'senior', 'expert', 'dept_lead']
    await db.qualityAssessment.create({
      data: {
        agentId: agent?.id,
        assessor: ['system', 'human', 'peer'][Math.floor(Math.random() * 3)],
        level: levels[Math.floor(Math.random() * levels.length)],
        score: Math.floor(Math.random() * 40) + 60,
        criteria: JSON.stringify({ accuracy: Math.floor(Math.random() * 30) + 70, speed: Math.floor(Math.random() * 30) + 60, reliability: Math.floor(Math.random() * 30) + 75 }),
        notes: 'Automated quality assessment',
      },
    })
  }
  console.log(`  ✅ 20 quality assessments`)

  console.log('\n🎉 All new enterprise tables seeded successfully!')
}

main().catch(console.error).finally(() => process.exit(0))
