import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ─── SUBSCRIPTION PLANS ──────────────────────────────────────────────────────

const plans = [
  {
    name: 'Starter',
    slug: 'starter',
    description: 'Perfect for small teams getting started with AI agents',
    priceMonthly: 0,
    priceYearly: 0,
    agentLimit: 50,
    skillLimit: 100,
    workflowLimit: 25,
    monthlyTokens: 100000,
    monthlyRequests: 10000,
    features: JSON.stringify(['Basic CRM', 'Email support', '5 API keys']),
    isEnterprise: false,
    sortOrder: 0,
    isActive: true,
  },
  {
    name: 'Professional',
    slug: 'professional',
    description: 'For growing teams that need more power and flexibility',
    priceMonthly: 9900,
    priceYearly: 99000,
    agentLimit: 200,
    skillLimit: 500,
    workflowLimit: 100,
    monthlyTokens: 1000000,
    monthlyRequests: 50000,
    features: JSON.stringify(['Advanced CRM', 'Priority support', '25 API keys', 'Custom branding', 'Webhooks']),
    isEnterprise: false,
    sortOrder: 1,
    isActive: true,
  },
  {
    name: 'Business',
    slug: 'business',
    description: 'For organizations that need enterprise-grade capabilities',
    priceMonthly: 29900,
    priceYearly: 299000,
    agentLimit: 500,
    skillLimit: 2000,
    workflowLimit: 500,
    monthlyTokens: 5000000,
    monthlyRequests: 200000,
    features: JSON.stringify(['Full CRM', 'Dedicated support', '100 API keys', 'Custom domain', 'SSO', 'Audit logs']),
    isEnterprise: false,
    sortOrder: 2,
    isActive: true,
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    description: 'Unlimited power for large organizations with custom needs',
    priceMonthly: 0,
    priceYearly: 0,
    agentLimit: -1,
    skillLimit: -1,
    workflowLimit: -1,
    monthlyTokens: 50000000,
    monthlyRequests: -1,
    features: JSON.stringify(['Everything in Business', 'Dedicated instance', 'SLA 99.9%', 'Custom integrations', 'On-premise option']),
    isEnterprise: true,
    sortOrder: 3,
    isActive: true,
  },
]

// ─── MARKETPLACE LISTINGS ───────────────────────────────────────────────────

const agentListings = [
  {
    type: 'agent',
    title: 'Customer Support Agent',
    description: 'An intelligent customer support agent that handles inquiries, resolves issues, and escalates complex cases. Trained on FAQ databases and can integrate with ticketing systems for seamless support workflows.',
    category: 'Support',
    tags: JSON.stringify(['customer-support', 'helpdesk', 'ticketing', 'faq', 'automation']),
    version: '2.4.1',
    authorName: 'ALO Labs',
    pricing: 'premium',
    priceMonthly: 4900,
    rating: 4.7,
    reviewCount: 128,
    installCount: 342,
    featured: true,
    status: 'published',
  },
  {
    type: 'agent',
    title: 'Sales Outreach Agent',
    description: 'Automate your sales pipeline with this outreach agent. It qualifies leads, crafts personalized emails, follows up at optimal times, and updates your CRM with interaction data and deal stages.',
    category: 'Sales',
    tags: JSON.stringify(['sales', 'outreach', 'lead-generation', 'email', 'crm']),
    version: '1.8.3',
    authorName: 'ALO Labs',
    pricing: 'premium',
    priceMonthly: 6900,
    rating: 4.5,
    reviewCount: 87,
    installCount: 215,
    featured: true,
    status: 'published',
  },
  {
    type: 'agent',
    title: 'Data Analyst Agent',
    description: 'Transform raw data into actionable insights. This agent connects to your data sources, runs statistical analyses, generates visualizations, and produces executive-ready reports with key findings.',
    category: 'Analytics',
    tags: JSON.stringify(['data-analysis', 'reporting', 'visualization', 'statistics', 'insights']),
    version: '3.1.0',
    authorName: 'ALO Labs',
    pricing: 'premium',
    priceMonthly: 5900,
    rating: 4.8,
    reviewCount: 64,
    installCount: 178,
    featured: false,
    status: 'published',
  },
  {
    type: 'agent',
    title: 'Content Writer Agent',
    description: 'Generate high-quality content at scale. From blog posts to social media captions, this agent maintains your brand voice while producing SEO-optimized content that drives engagement and conversions.',
    category: 'Content',
    tags: JSON.stringify(['content', 'writing', 'seo', 'blog', 'social-media']),
    version: '2.2.0',
    authorName: 'ALO Labs',
    pricing: 'free',
    priceMonthly: 0,
    rating: 4.3,
    reviewCount: 203,
    installCount: 567,
    featured: true,
    status: 'published',
  },
  {
    type: 'agent',
    title: 'Code Review Agent',
    description: 'Automated code review that catches bugs, suggests improvements, and enforces coding standards. Supports multiple languages and integrates with popular version control platforms for seamless workflow integration.',
    category: 'Engineering',
    tags: JSON.stringify(['code-review', 'development', 'quality', 'bug-detection', 'standards']),
    version: '1.5.2',
    authorName: 'ALO Labs',
    pricing: 'premium',
    priceMonthly: 3900,
    rating: 4.6,
    reviewCount: 95,
    installCount: 234,
    featured: false,
    status: 'published',
  },
]

const skillListings = [
  {
    type: 'skill',
    title: 'Email Composition',
    description: 'Craft professional emails tailored to context. Includes templates for sales, support, follow-ups, and internal communication. Supports tone adjustment, personalization, and multi-language output.',
    category: 'Communication',
    tags: JSON.stringify(['email', 'communication', 'templates', 'professional', 'writing']),
    version: '1.3.0',
    authorName: 'ALO Labs',
    pricing: 'free',
    priceMonthly: 0,
    rating: 4.4,
    reviewCount: 312,
    installCount: 890,
    featured: true,
    status: 'published',
  },
  {
    type: 'skill',
    title: 'Lead Scoring',
    description: 'Score and prioritize leads based on engagement data, firmographics, and behavioral signals. Uses machine learning models to predict conversion likelihood and recommend the best follow-up actions.',
    category: 'Sales',
    tags: JSON.stringify(['lead-scoring', 'sales', 'ml', 'prioritization', 'conversion']),
    version: '2.0.1',
    authorName: 'ALO Labs',
    pricing: 'premium',
    priceMonthly: 2900,
    rating: 4.6,
    reviewCount: 76,
    installCount: 189,
    featured: false,
    status: 'published',
  },
  {
    type: 'skill',
    title: 'Document Analysis',
    description: 'Extract, summarize, and analyze documents at scale. Supports PDF, DOCX, and plain text. Identifies key entities, sentiments, and action items. Perfect for contract review and research.',
    category: 'Productivity',
    tags: JSON.stringify(['document', 'analysis', 'extraction', 'summarization', 'nlp']),
    version: '1.7.2',
    authorName: 'ALO Labs',
    pricing: 'free',
    priceMonthly: 0,
    rating: 4.5,
    reviewCount: 145,
    installCount: 423,
    featured: false,
    status: 'published',
  },
  {
    type: 'skill',
    title: 'Meeting Summarization',
    description: 'Automatically generate concise meeting summaries with action items, decisions, and key discussion points. Integrates with calendar apps and can distribute summaries to attendees automatically.',
    category: 'Productivity',
    tags: JSON.stringify(['meeting', 'summarization', 'action-items', 'calendar', 'notes']),
    version: '1.2.0',
    authorName: 'ALO Labs',
    pricing: 'free',
    priceMonthly: 0,
    rating: 4.2,
    reviewCount: 178,
    installCount: 501,
    featured: false,
    status: 'published',
  },
  {
    type: 'skill',
    title: 'Code Generation',
    description: 'Generate production-ready code from natural language descriptions. Supports TypeScript, Python, Go, and more. Includes unit test generation, documentation, and follows best practices and design patterns.',
    category: 'Engineering',
    tags: JSON.stringify(['code-generation', 'development', 'typescript', 'python', 'testing']),
    version: '2.5.0',
    authorName: 'ALO Labs',
    pricing: 'premium',
    priceMonthly: 4900,
    rating: 4.7,
    reviewCount: 234,
    installCount: 678,
    featured: true,
    status: 'published',
  },
]

const workflowListings = [
  {
    type: 'workflow',
    title: 'Customer Onboarding',
    description: 'Streamline your customer onboarding process from signup to activation. This workflow handles welcome emails, account setup, data collection, team provisioning, and sends automated follow-ups to ensure successful adoption.',
    category: 'Operations',
    tags: JSON.stringify(['onboarding', 'customer-success', 'automation', 'welcome', 'activation']),
    version: '1.4.0',
    authorName: 'ALO Labs',
    pricing: 'premium',
    priceMonthly: 1900,
    rating: 4.5,
    reviewCount: 67,
    installCount: 156,
    featured: true,
    status: 'published',
  },
  {
    type: 'workflow',
    title: 'Lead Nurturing',
    description: 'Nurture leads through your sales funnel with personalized touchpoints. This workflow scores leads, sends targeted content, schedules follow-ups, and alerts sales reps when leads show high-intent buying signals.',
    category: 'Sales',
    tags: JSON.stringify(['lead-nurturing', 'sales', 'automation', 'email', 'scoring']),
    version: '2.1.0',
    authorName: 'ALO Labs',
    pricing: 'premium',
    priceMonthly: 2900,
    rating: 4.4,
    reviewCount: 53,
    installCount: 134,
    featured: false,
    status: 'published',
  },
  {
    type: 'workflow',
    title: 'Content Publishing',
    description: 'End-to-end content publishing workflow from ideation to distribution. Includes content briefs, AI drafting, editorial review, SEO optimization, scheduling, and cross-platform publishing to blogs and social media.',
    category: 'Content',
    tags: JSON.stringify(['content', 'publishing', 'seo', 'social-media', 'workflow']),
    version: '1.6.0',
    authorName: 'ALO Labs',
    pricing: 'free',
    priceMonthly: 0,
    rating: 4.3,
    reviewCount: 89,
    installCount: 267,
    featured: false,
    status: 'published',
  },
]

// ─── MARKETPLACE REVIEWS ────────────────────────────────────────────────────

const reviewTemplates = [
  { rating: 5, title: 'Excellent!', comment: 'This has transformed our workflow. Highly recommend to any team looking to scale.' },
  { rating: 4, title: 'Great tool', comment: 'Very useful and well-built. Minor setup issues but support was helpful.' },
  { rating: 5, title: 'Must have', comment: 'We replaced 3 separate tools with this. ROI was immediate.' },
  { rating: 3, title: 'Decent', comment: 'Does what it says. Could use more customization options.' },
  { rating: 4, title: 'Solid product', comment: 'Good integration with our existing stack. Performance is reliable.' },
  { rating: 5, title: 'Game changer', comment: 'Our team productivity increased by 40% since installing this.' },
  { rating: 4, title: 'Very good', comment: 'Clean interface, powerful features. Looking forward to future updates.' },
  { rating: 5, title: 'Outstanding', comment: 'Best-in-class functionality. The AI quality is impressive.' },
]

// ─── MAIN SEED FUNCTION ─────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding enterprise data...')

  // 1. Seed Subscription Plans
  console.log('\n📦 Seeding subscription plans...')
  for (const plan of plans) {
    const existing = await db.subscriptionPlan.findUnique({ where: { slug: plan.slug } })
    if (!existing) {
      await db.subscriptionPlan.create({ data: plan })
      console.log(`  ✅ Created plan: ${plan.name}`)
    } else {
      console.log(`  ⏭️  Plan already exists: ${plan.name}`)
    }
  }

  // 2. Seed Marketplace Listings
  console.log('\n🏪 Seeding marketplace listings...')
  const allListings = [...agentListings, ...skillListings, ...workflowListings]
  const createdListings: { id: string; type: string; title: string }[] = []

  for (const listing of allListings) {
    const existing = await db.marketplaceListing.findFirst({
      where: { title: listing.title, type: listing.type },
    })
    if (!existing) {
      const created = await db.marketplaceListing.create({
        data: {
          ...listing,
          itemId: `seed-${listing.type}-${listing.slug || listing.title.toLowerCase().replace(/\s+/g, '-')}`,
        },
      })
      createdListings.push({ id: created.id, type: listing.type, title: listing.title })
      console.log(`  ✅ Created listing: ${listing.title} (${listing.type})`)
    } else {
      createdListings.push({ id: existing.id, type: existing.type, title: existing.title })
      console.log(`  ⏭️  Listing already exists: ${listing.title}`)
    }
  }

  // 3. Add some reviews to listings
  console.log('\n⭐ Adding marketplace reviews...')
  for (const listing of createdListings) {
    const existingReviews = await db.marketplaceReview.count({ where: { listingId: listing.id } })
    if (existingReviews === 0) {
      const numReviews = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < numReviews; i++) {
        const review = reviewTemplates[Math.floor(Math.random() * reviewTemplates.length)]
        await db.marketplaceReview.create({
          data: {
            listingId: listing.id,
            rating: review.rating,
            title: review.title,
            comment: review.comment,
          },
        })
      }
      console.log(`  ✅ Added reviews for: ${listing.title}`)
    } else {
      console.log(`  ⏭️  Reviews already exist for: ${listing.title}`)
    }
  }

  // 4. Seed Token Budgets for companies
  console.log('\n💰 Seeding token budgets...')
  const companies = await db.company.findMany({ select: { id: true, name: true } })
  console.log(`  Found ${companies.length} companies`)

  for (const company of companies) {
    const existing = await db.tokenBudget.findUnique({ where: { companyId: company.id } })
    if (!existing) {
      const monthlyBudget = 500000 + Math.floor(Math.random() * 4500000)
      const monthlyUsed = Math.floor(monthlyBudget * (0.2 + Math.random() * 0.6))
      const dailyBudget = Math.floor(monthlyBudget / 30)
      const dailyUsed = Math.floor(dailyBudget * (0.1 + Math.random() * 0.8))
      await db.tokenBudget.create({
        data: {
          companyId: company.id,
          monthlyBudget,
          monthlyUsed,
          dailyBudget,
          dailyUsed,
          warningThreshold: 0.8,
          blockThreshold: 1.0,
        },
      })
      console.log(`  ✅ Created token budget for: ${company.name}`)
    } else {
      console.log(`  ⏭️  Token budget exists for: ${company.name}`)
    }
  }

  // 5. Seed Usage Logs for last 7 days
  console.log('\n📊 Seeding usage logs for last 7 days...')
  const agentNames = [
    'AGENT-0001', 'AGENT-0002', 'AGENT-0003', 'AGENT-0010', 'AGENT-0020',
    'AGENT-0050', 'AGENT-0100', 'AGENT-0200', 'AGENT-0500', 'AGENT-1000',
  ]
  const models = ['deepseek-v3', 'gpt-4o', 'claude-3.5-sonnet', 'gpt-4o-mini']
  const actions = ['agent_run', 'skill_run', 'workflow_run', 'api_call']
  const statuses = ['completed', 'completed', 'completed', 'completed', 'completed', 'failed', 'completed']

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  let totalLogsCreated = 0

  // Check if we already have usage logs
  const existingLogs = await db.usageLog.count({
    where: { createdAt: { gte: sevenDaysAgo } },
  })
  if (existingLogs > 0) {
    console.log(`  ⏭️  Usage logs already exist (${existingLogs} records). Skipping.`)
  } else {
    for (const company of companies) {
      // Generate 30-100 logs per company over 7 days
      const numLogs = 30 + Math.floor(Math.random() * 70)
      for (let i = 0; i < numLogs; i++) {
        const randomTime = new Date(
          sevenDaysAgo.getTime() + Math.random() * (now.getTime() - sevenDaysAgo.getTime())
        )
        const tokensUsed = 100 + Math.floor(Math.random() * 5000)
        const isPaidApi = Math.random() > 0.7
        const agentIdx = Math.floor(Math.random() * agentNames.length)
        const modelIdx = Math.floor(Math.random() * models.length)

        await db.usageLog.create({
          data: {
            companyId: company.id,
            companyName: company.name,
            agentId: agentNames[agentIdx],
            agentName: agentNames[agentIdx],
            tokensOrLocalUsed: tokensUsed,
            paidApiUsed: isPaidApi,
            status: statuses[Math.floor(Math.random() * statuses.length)],
            startedAt: randomTime,
            completedAt: new Date(randomTime.getTime() + 1000 + Math.random() * 30000),
            createdAt: randomTime,
          },
        })
        totalLogsCreated++
      }
    }

    // Also create some TokenUsage records
    for (const company of companies) {
      const numUsageRecords = 10 + Math.floor(Math.random() * 20)
      for (let i = 0; i < numUsageRecords; i++) {
        const randomTime = new Date(
          sevenDaysAgo.getTime() + Math.random() * (now.getTime() - sevenDaysAgo.getTime())
        )
        const promptTokens = 100 + Math.floor(Math.random() * 3000)
        const completionTokens = 50 + Math.floor(Math.random() * 2000)

        await db.tokenUsage.create({
          data: {
            companyId: company.id,
            agentId: agentNames[Math.floor(Math.random() * agentNames.length)],
            model: models[Math.floor(Math.random() * models.length)],
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            costEstimate: ((promptTokens + completionTokens) / 1000000) * (2 + Math.random() * 10),
            createdAt: randomTime,
          },
        })
      }
    }

    console.log(`  ✅ Created ${totalLogsCreated} usage logs and token usage records`)
  }

  // 6. Seed some subscriptions for companies
  console.log('\n💳 Seeding subscriptions...')
  const planRecords = await db.subscriptionPlan.findMany({ select: { id: true, slug: true } })
  const starterPlan = planRecords.find((p) => p.slug === 'starter')
  const proPlan = planRecords.find((p) => p.slug === 'professional')
  const bizPlan = planRecords.find((p) => p.slug === 'business')
  const entPlan = planRecords.find((p) => p.slug === 'enterprise')

  const planAssignment = [starterPlan, proPlan, bizPlan, entPlan, proPlan, starterPlan, bizPlan, proPlan]
  const subStatuses = ['active', 'active', 'active', 'active', 'active', 'trial', 'active', 'past_due']

  for (let i = 0; i < companies.length && i < planAssignment.length; i++) {
    const plan = planAssignment[i]
    if (!plan) continue
    const existing = await db.subscription.findUnique({ where: { companyId: companies[i].id } })
    if (!existing) {
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      const isTrial = subStatuses[i] === 'trial'
      await db.subscription.create({
        data: {
          companyId: companies[i].id,
          planId: plan.id,
          status: subStatuses[i] || 'active',
          trialEndsAt: isTrial ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) : null,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      })
      console.log(`  ✅ Created subscription for: ${companies[i].name} (${plan.slug})`)
    } else {
      console.log(`  ⏭️  Subscription exists for: ${companies[i].name}`)
    }
  }

  console.log('\n✅ Enterprise seed complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })