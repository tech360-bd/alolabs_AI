import { db } from '../src/lib/db'

async function seed() {
  console.log('🌱 Seeding CRM demo data...')

  // Create a pipeline
  const pipeline = await db.crmPipeline.create({
    data: {
      name: 'Sales Pipeline',
      description: 'Default sales process',
      isDefault: true,
      sortOrder: 0,
      status: 'active',
    },
  })

  const stagesData = [
    { name: 'Lead', color: '#3B82F6', sortOrder: 0, probability: 10 },
    { name: 'Qualified', color: '#06B6D4', sortOrder: 1, probability: 25 },
    { name: 'Proposal', color: '#F59E0B', sortOrder: 2, probability: 50 },
    { name: 'Negotiation', color: '#F97316', sortOrder: 3, probability: 75 },
    { name: 'Closed Won', color: '#22C55E', sortOrder: 4, probability: 100 },
    { name: 'Closed Lost', color: '#EF4444', sortOrder: 5, probability: 0 },
  ]

  const stages = await Promise.all(
    stagesData.map(s => db.crmPipelineStage.create({ data: { pipelineId: pipeline.id, ...s } }))
  )

  // Create contacts
  const contactsData = [
    { firstName: 'Sarah', lastName: 'Chen', email: 'sarah.chen@techcorp.com', phone: '+1-555-0101', company: 'TechCorp', jobTitle: 'CTO', source: 'referral', status: 'customer', score: 82, tags: JSON.stringify(['enterprise', 'tech']), lastContactAt: new Date(Date.now() - 2 * 86400000) },
    { firstName: 'James', lastName: 'Wilson', email: 'james.wilson@growth.io', phone: '+1-555-0102', company: 'Growth.io', jobTitle: 'VP Sales', source: 'website', status: 'prospect', score: 65, tags: JSON.stringify(['saas', 'mid-market']), lastContactAt: new Date(Date.now() - 5 * 86400000) },
    { firstName: 'Emily', lastName: 'Rodriguez', email: 'emily.r@designstudio.co', phone: '+1-555-0103', company: 'DesignStudio', jobTitle: 'CEO', source: 'social', status: 'lead', score: 35, tags: JSON.stringify(['creative', 'small-biz']), lastContactAt: new Date(Date.now() - 14 * 86400000) },
    { firstName: 'Michael', lastName: 'Park', email: 'michael.park@financegroup.com', phone: '+1-555-0104', company: 'FinanceGroup', jobTitle: 'Director', source: 'email', status: 'prospect', score: 58, tags: JSON.stringify(['finance', 'enterprise']), lastContactAt: new Date(Date.now() - 7 * 86400000) },
    { firstName: 'Lisa', lastName: 'Thompson', email: 'lisa.t@mediaworks.com', phone: '+1-555-0105', company: 'MediaWorks', jobTitle: 'Marketing Lead', source: 'manual', status: 'customer', score: 91, tags: JSON.stringify(['media', 'loyal']), lastContactAt: new Date(Date.now() - 1 * 86400000) },
    { firstName: 'David', lastName: 'Kim', email: 'david.kim@startupx.io', phone: '+1-555-0106', company: 'StartupX', jobTitle: 'Founder', source: 'referral', status: 'lead', score: 22, tags: JSON.stringify(['startup']), lastContactAt: new Date(Date.now() - 30 * 86400000) },
    { firstName: 'Anna', lastName: 'Martinez', email: 'anna.m@healthtech.com', phone: '+1-555-0107', company: 'HealthTech', jobTitle: 'Product Manager', source: 'website', status: 'churned', score: 12, tags: JSON.stringify(['healthcare']), lastContactAt: new Date(Date.now() - 90 * 86400000) },
    { firstName: 'Robert', lastName: 'Taylor', email: 'robert.t@logisticsplus.com', phone: '+1-555-0108', company: 'LogisticsPlus', jobTitle: 'COO', source: 'email', status: 'prospect', score: 47, tags: JSON.stringify(['logistics', 'mid-market']), lastContactAt: new Date(Date.now() - 10 * 86400000) },
  ]

  const contacts = await Promise.all(
    contactsData.map(c => db.crmContact.create({ data: c }))
  )

  // Create deals
  const dealsData = [
    { contactId: contacts[0].id, pipelineId: pipeline.id, stageId: stages[3].id, title: 'Enterprise License Renewal', value: 120000, probability: 75, expectedClose: new Date(Date.now() + 30 * 86400000), status: 'active' },
    { contactId: contacts[0].id, pipelineId: pipeline.id, stageId: stages[4].id, title: 'API Integration Package', value: 45000, probability: 100, expectedClose: new Date(Date.now() - 10 * 86400000), actualClose: new Date(Date.now() - 10 * 86400000), status: 'won' },
    { contactId: contacts[1].id, pipelineId: pipeline.id, stageId: stages[2].id, title: 'SaaS Platform Deal', value: 85000, probability: 50, expectedClose: new Date(Date.now() + 60 * 86400000), status: 'active' },
    { contactId: contacts[2].id, pipelineId: pipeline.id, stageId: stages[0].id, title: 'Design System License', value: 15000, probability: 10, expectedClose: new Date(Date.now() + 90 * 86400000), status: 'active' },
    { contactId: contacts[3].id, pipelineId: pipeline.id, stageId: stages[1].id, title: 'Compliance Module', value: 200000, probability: 25, expectedClose: new Date(Date.now() + 45 * 86400000), status: 'active' },
    { contactId: contacts[4].id, pipelineId: pipeline.id, stageId: stages[4].id, title: 'Annual Media Plan', value: 95000, probability: 100, expectedClose: new Date(Date.now() - 5 * 86400000), actualClose: new Date(Date.now() - 5 * 86400000), status: 'won' },
    { contactId: contacts[5].id, pipelineId: pipeline.id, stageId: stages[0].id, title: 'MVP Development', value: 30000, probability: 10, expectedClose: new Date(Date.now() + 120 * 86400000), status: 'active' },
    { contactId: contacts[6].id, pipelineId: pipeline.id, stageId: stages[5].id, title: 'Healthcare Analytics', value: 75000, probability: 0, expectedClose: new Date(Date.now() - 30 * 86400000), actualClose: new Date(Date.now() - 30 * 86400000), lostReason: 'Budget constraints', status: 'lost' },
    { contactId: contacts[7].id, pipelineId: pipeline.id, stageId: stages[1].id, title: 'Logistics Dashboard', value: 55000, probability: 25, expectedClose: new Date(Date.now() + 75 * 86400000), status: 'active' },
  ]

  const deals = await Promise.all(
    dealsData.map(d => db.crmDeal.create({ data: d }))
  )

  // Create activities
  const activitiesData = [
    { contactId: contacts[0].id, dealId: deals[0].id, type: 'call', subject: 'Renewal Discussion', description: 'Discussed renewal terms and pricing for next year', direction: 'inbound', status: 'completed', durationMin: 45 },
    { contactId: contacts[0].id, dealId: deals[0].id, type: 'email', subject: 'Sent proposal v2', description: 'Updated pricing proposal with volume discount', direction: 'outbound', status: 'completed' },
    { contactId: contacts[1].id, dealId: deals[2].id, type: 'meeting', subject: 'Demo Call', description: 'Product demo for the sales team', direction: 'outbound', status: 'completed', durationMin: 60 },
    { contactId: contacts[2].id, type: 'email', subject: 'Intro Email', description: 'Sent introduction and case studies', direction: 'outbound', status: 'completed' },
    { contactId: contacts[3].id, dealId: deals[4].id, type: 'call', subject: 'Requirements Gathering', description: 'Discussed compliance module requirements', direction: 'inbound', status: 'completed', durationMin: 30 },
    { contactId: contacts[4].id, dealId: deals[5].id, type: 'meeting', subject: 'Kickoff Meeting', description: 'Annual media plan kickoff with the marketing team', direction: 'outbound', status: 'completed', durationMin: 90 },
    { contactId: contacts[5].id, type: 'note', subject: 'Initial contact', description: 'Met at tech conference, expressed interest in our platform', status: 'completed' },
    { contactId: contacts[6].id, dealId: deals[7].id, type: 'email', subject: 'Follow-up', description: 'Sent follow-up after initial meeting, no response', direction: 'outbound', status: 'completed' },
    { contactId: contacts[7].id, dealId: deals[8].id, type: 'meeting', subject: 'Discovery Call', description: 'Initial discovery call about logistics needs', direction: 'inbound', status: 'completed', durationMin: 35 },
    { contactId: contacts[0].id, type: 'task', subject: 'Prepare contract', description: 'Prepare contract document for renewal', status: 'scheduled', scheduledAt: new Date(Date.now() + 3 * 86400000) },
    { contactId: contacts[1].id, type: 'task', subject: 'Send case study', description: 'Send relevant case study for SaaS vertical', status: 'scheduled', scheduledAt: new Date(Date.now() + 1 * 86400000) },
    { contactId: contacts[3].id, dealId: deals[4].id, type: 'email', subject: 'Security questionnaire', description: 'Sent security compliance questionnaire', direction: 'outbound', status: 'completed' },
  ]

  await Promise.all(
    activitiesData.map(a => db.crmActivity.create({ data: a }))
  )

  // Create lead scores for top contacts
  const scoresData = [
    { contactId: contacts[0].id, score: 82, maxScore: 100, factors: JSON.stringify({ websiteVisits: 15, emailOpens: 8, dealValue: 165000, lastContactDaysAgo: 2 }) },
    { contactId: contacts[1].id, score: 65, maxScore: 100, factors: JSON.stringify({ websiteVisits: 8, emailOpens: 5, dealValue: 85000, lastContactDaysAgo: 5 }) },
    { contactId: contacts[2].id, score: 35, maxScore: 100, factors: JSON.stringify({ websiteVisits: 3, emailOpens: 2, dealValue: 15000, lastContactDaysAgo: 14 }) },
    { contactId: contacts[3].id, score: 58, maxScore: 100, factors: JSON.stringify({ websiteVisits: 10, emailOpens: 6, dealValue: 200000, lastContactDaysAgo: 7 }) },
    { contactId: contacts[4].id, score: 91, maxScore: 100, factors: JSON.stringify({ websiteVisits: 22, emailOpens: 12, dealValue: 95000, lastContactDaysAgo: 1 }) },
  ]

  await Promise.all(
    scoresData.map(s => db.crmLeadScore.create({ data: { ...s, calculatedBy: 'rule-engine' } }))
  )

  // Create notes
  const notesData = [
    { contactId: contacts[0].id, content: 'Key decision maker. Prefers email communication. Very responsive.' },
    { contactId: contacts[0].id, content: 'Budget approved for Q1. Ready to negotiate final terms.' },
    { contactId: contacts[4].id, content: 'Long-term client since 2022. High satisfaction with the platform.' },
    { contactId: contacts[1].id, content: 'Interested in custom integrations. Has a technical team.' },
    { contactId: contacts[6].id, content: 'Churned due to budget cuts. May return in Q3.' },
  ]

  await Promise.all(
    notesData.map(n => db.crmNote.create({ data: { ...n, createdBy: 'system' } }))
  )

  console.log('✅ CRM demo data seeded successfully!')
  console.log(`   - 1 pipeline with ${stages.length} stages`)
  console.log(`   - ${contacts.length} contacts`)
  console.log(`   - ${deals.length} deals`)
  console.log(`   - ${activitiesData.length} activities`)
  console.log(`   - ${scoresData.length} lead scores`)
  console.log(`   - ${notesData.length} notes`)
}

seed()
  .catch(console.error)
  .finally(() => process.exit(0))