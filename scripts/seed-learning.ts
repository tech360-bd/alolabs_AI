import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const EVOLUTION_LEVELS = [
  { level: 1, name: 'Novice',           minMaturity: 0,   minKnowledge: 0 },
  { level: 2,  name: 'Learner',          minMaturity: 10,  minKnowledge: 5 },
  { level: 3,  name: 'Apprentice',       minMaturity: 20,  minKnowledge: 15 },
  { level: 4,  name: 'Practitioner',     minMaturity: 30,  minKnowledge: 30 },
  { level: 5,  name: 'Specialist',       minMaturity: 40,  minKnowledge: 50 },
  { level: 6,  name: 'Expert',           minMaturity: 55,  minKnowledge: 75 },
  { level: 7,  name: 'Master',           minMaturity: 70,  minKnowledge: 100 },
  { level: 8,  name: 'Authority',        minMaturity: 82,  minKnowledge: 140 },
  { level: 9,  name: 'Pioneer',          minMaturity: 92,  minKnowledge: 180 },
  { level: 10, name: 'Industrial Model', minMaturity: 98,  minKnowledge: 250 },
];

const KNOWLEDGE_CATEGORIES = ['domain', 'pattern', 'correction', 'strategy', 'tool_usage', 'communication'];
const EVOLUTION_PATHS = ['specialist', 'generalist', 'hybrid', 'industrial'];
const TRIGGER_TYPES = ['task_completion', 'feedback', 'scheduled', 'manual', 'cross_agent'];

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min: number, max: number) { return Math.random() * (max - min) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const DEPARTMENT_KNOWLEDGE: Record<string, string[]> = {
  'Engineering': ['REST API design patterns', 'Database query optimization', 'System architecture principles', 'Code review best practices', 'CI/CD pipeline configuration', 'Error handling strategies', 'TypeScript type safety patterns', 'Performance profiling techniques', 'Microservice communication protocols', 'Container orchestration basics'],
  'Marketing': ['Content strategy frameworks', 'SEO optimization techniques', 'Social media engagement patterns', 'Brand voice consistency', 'A/B testing methodologies', 'Customer segmentation strategies', 'Email campaign optimization', 'Conversion funnel analysis', 'Market research approaches', 'Competitive analysis frameworks'],
  'Sales': ['Lead qualification criteria', 'Objection handling techniques', 'Pipeline management strategies', 'Customer needs assessment', 'Negotiation frameworks', 'CRM data entry best practices', 'Follow-up timing optimization', 'Cross-sell/upsell identification', 'Contract closing strategies', 'Customer retention approaches'],
  'Support': ['Ticket triage prioritization', 'Customer empathy techniques', 'Knowledge base article writing', 'Escalation criteria', 'Response time optimization', 'Issue categorization patterns', 'Root cause analysis methods', 'Customer satisfaction metrics', 'Multi-channel support coordination', 'Documentation standards'],
  'Finance': ['Invoice processing accuracy', 'Budget variance analysis', 'Financial reporting standards', 'Expense categorization rules', 'Tax compliance requirements', 'Cash flow forecasting', 'Audit trail maintenance', 'Payment reconciliation', 'Cost optimization strategies', 'Revenue recognition principles'],
  'HR': ['Candidate screening criteria', 'Interview question frameworks', 'Onboarding process optimization', 'Employee engagement strategies', 'Performance review methodologies', 'Compensation benchmarking', 'Policy compliance monitoring', 'Workforce planning models', 'Training needs assessment', 'Conflict resolution approaches'],
  'Operations': ['Workflow efficiency metrics', 'Resource allocation optimization', 'Quality control checklists', 'Supply chain coordination', 'Process automation identification', 'Bottleneck analysis methods', 'Capacity planning models', 'SLA compliance monitoring', 'Incident response procedures', 'Continuous improvement frameworks'],
  'Research': ['Data collection methodologies', 'Statistical analysis techniques', 'Research hypothesis formulation', 'Literature review approaches', 'Experiment design principles', 'Data visualization best practices', 'Peer review criteria', 'Reproducibility standards', 'Citation management', 'Research ethics compliance'],
};

async function seed() {
  console.log('Seeding self-learning system for 2000 agents...');

  const agents = await db.agent.findMany({ select: { id: true, departmentName: true, role: true } });
  console.log(`Found ${agents.length} agents`);

  let totalKnowledge = 0;
  let totalSessions = 0;

  // Process in batches of 100
  for (let i = 0; i < agents.length; i += 100) {
    const batch = agents.slice(i, i + 100);

    await Promise.all(batch.map(async (agent) => {
      // Simulate varying learning levels based on agent index (give some agents more experience)
      const seed = i + batch.indexOf(agent);
      const experienceFactor = Math.sin(seed * 0.01) * 0.5 + 0.5; // 0-1
      const numKnowledge = Math.floor(experienceFactor * 40) + rand(1, 10);
      const numSessions = Math.floor(experienceFactor * 20) + rand(1, 5);

      const deptKnowledge = DEPARTMENT_KNOWLEDGE[agent.departmentName] || DEPARTMENT_KNOWLEDGE['Engineering'];

      // Create knowledge entries
      const knowledgePromises = Array.from({ length: numKnowledge }, (_, ki) => {
        const category = pick(KNOWLEDGE_CATEGORIES);
        const baseContent = deptKnowledge[ki % deptKnowledge.length];
        const suffix = ki > deptKnowledge.length ? ` (variant ${ki})` : '';
        return db.agentKnowledge.create({
          data: {
            agentId: agent.id,
            category,
            content: `[${agent.departmentName}] ${baseContent}${suffix}`,
            source: pick(TRIGGER_TYPES),
            confidence: randFloat(0.3, 0.9),
            useCount: rand(0, 20),
            successCount: rand(0, 15),
            failCount: rand(0, 3),
            temperature: pick(['hot', 'warm', 'cold']),
            isVerified: Math.random() > 0.7,
            tags: JSON.stringify([agent.departmentName.toLowerCase(), category, pick(['high-value', 'verified', 'auto-learned', 'reinforced'])]),
          },
        });
      });

      // Create learning sessions
      const sessionPromises = Array.from({ length: numSessions }, (_, si) => {
        const knowledgeGained = rand(0, 5);
        const insights = Array.from({ length: rand(0, 3) }, () =>
          `Learned: ${deptKnowledge[si % deptKnowledge.length]}`
        );
        const daysAgo = rand(0, 30);
        const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        return db.agentLearningSession.create({
          data: {
            agentId: agent.id,
            triggerType: pick(TRIGGER_TYPES),
            triggerDetail: `Auto-learning session #${si + 1}`,
            knowledgeBefore: numKnowledge - knowledgeGained,
            knowledgeAfter: numKnowledge,
            insights: JSON.stringify(insights),
            corrections: JSON.stringify([]),
            durationMs: rand(50, 2000),
            status: 'completed',
            completedAt: new Date(createdAt.getTime() + rand(100, 5000)),
            createdAt,
          },
        });
      });

      await Promise.all([...knowledgePromises, ...sessionPromises]);
      totalKnowledge += numKnowledge;
      totalSessions += numSessions;

      // Calculate evolution metrics
      const knowledgeFactor = Math.min(40, (numKnowledge / 250) * 40);
      const confidenceFactor = randFloat(0.2, 0.7) * 30;
      const sessionFactor = Math.min(15, (numSessions / 50) * 15);
      const maturityScore = Math.min(100, knowledgeFactor + confidenceFactor + sessionFactor);

      let level = 1;
      let levelName = 'Novice';
      for (let l = EVOLUTION_LEVELS.length - 1; l >= 0; l--) {
        if (maturityScore >= EVOLUTION_LEVELS[l].minMaturity && numKnowledge >= EVOLUTION_LEVELS[l].minKnowledge) {
          level = EVOLUTION_LEVELS[l].level;
          levelName = EVOLUTION_LEVELS[l].name;
          break;
        }
      }

      const coveredCategories = KNOWLEDGE_CATEGORIES.filter(() => Math.random() > 0.3);
      const evolutionPath = coveredCategories.length >= 5 ? 'generalist' : coveredCategories.length >= 3 ? 'hybrid' : 'specialist';

      const achievements: string[] = [];
      if (numKnowledge >= 10) achievements.push('10 Knowledge Units');
      if (numKnowledge >= 50) achievements.push('50 Knowledge Units');
      if (maturityScore >= 50) achievements.push('50% Maturity');
      if (maturityScore >= 90) achievements.push('90% Maturity');
      if (maturityScore >= 80) achievements.push('Model-Ready Candidate');
      if (coveredCategories.length >= 4) achievements.push('Multi-Domain Knowledge (4+ domains)');

      // Create evolution record
      await db.agentEvolution.create({
        data: {
          agentId: agent.id,
          level,
          levelName,
          totalKnowledge: numKnowledge,
          totalSessions: numSessions,
          totalCorrections: rand(0, 5),
          avgConfidence: randFloat(0.3, 0.8),
          maturityScore,
          knowledgeDensity: numSessions > 0 ? numKnowledge / numSessions : 0,
          protectiveScore: rand(85, 100),
          modelReadiness: Math.min(100, (maturityScore * 0.4) + (randFloat(0.3, 0.7) * 30) + (Math.min(1, numKnowledge / 200) * 30)),
          domainCoverage: JSON.stringify(coveredCategories),
          strengthAreas: JSON.stringify(coveredCategories.slice(0, 3)),
          weakAreas: JSON.stringify(KNOWLEDGE_CATEGORIES.filter(c => !coveredCategories.includes(c))),
          evolutionPath,
          achievements: JSON.stringify(achievements),
          lastEvolvedAt: level > 1 ? new Date(Date.now() - rand(1, 60) * 24 * 60 * 60 * 1000) : null,
          nextEvolutionAt: level < 10 ? new Date(Date.now() + rand(5, 90) * 24 * 60 * 60 * 1000) : null,
        },
      });

      // Create protective mode config
      await db.agentProtectiveMode.create({
        data: {
          agentId: agent.id,
          enabled: true,
          safetyLevel: pick(['standard', 'standard', 'standard', 'strict']),
          blockedPatterns: JSON.stringify(['(?:password|secret|api.?key)\\s*[:=]\\s*\\S+', 'credit\\s*card\\s*\\d']),
          allowedDomains: JSON.stringify([agent.departmentName.toLowerCase()]),
          maxKnowledgePerDay: rand(20, 100),
          maxConfidence: 0.95,
          requireVerification: Math.random() > 0.3,
          autoFilterToxic: true,
          learningScope: pick(['task_domain', 'task_domain', 'cross_domain']),
          dataRetentionDays: 90,
          violationCount: Math.random() > 0.8 ? rand(0, 3) : 0,
        },
      });
    }));

    console.log(`  Processed ${i + batch.length}/${agents.length} agents...`);
  }

  console.log(`\nSeeding complete!`);
  console.log(`  Total knowledge entries: ~${totalKnowledge}`);
  console.log(`  Total learning sessions: ~${totalSessions}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
