/** Standalone synthetic fixtures. No database client, credentials or real agent IDs. */
import { EVOLUTION_LEVELS, KNOWLEDGE_CATEGORIES } from '../../src/lib/agent-learning/catalog';
import { pick, randInt as rand } from './sample';

const TRIGGER_TYPES = ['task_completion', 'feedback', 'scheduled', 'manual', 'cross_agent'];
function randFloat(min: number, max: number) { return Math.random() * (max - min) + min; }

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

function simulateAgent(seed: number, department: string) {
  const agentId = `preview:${seed + 1}`;
  const experienceFactor = Math.sin(seed * 0.01) * 0.5 + 0.5; // 0-1
  const numKnowledge = Math.floor(experienceFactor * 40) + rand(1, 10);
  const numSessions = Math.floor(experienceFactor * 20) + rand(1, 5);

  const deptKnowledge = DEPARTMENT_KNOWLEDGE[department];

  // Create knowledge entries
  const knowledge = Array.from({ length: numKnowledge }, (_, ki) => {
    const category = pick(KNOWLEDGE_CATEGORIES);
    const baseContent = deptKnowledge[ki % deptKnowledge.length];
    const suffix = ki > deptKnowledge.length ? ` (variant ${ki})` : '';
    return {
      agentId,
      category,
      content: `[${department}] ${baseContent}${suffix}`,
      source: pick(TRIGGER_TYPES),
      confidence: randFloat(0.3, 0.9),
      useCount: rand(0, 20),
      successCount: rand(0, 15),
      failCount: rand(0, 3),
      temperature: pick(['hot', 'warm', 'cold']),
      isVerified: Math.random() > 0.7,
      tags: JSON.stringify([department.toLowerCase(), category, pick(['high-value', 'verified', 'auto-learned', 'reinforced'])]),
    };
  });

  // Create learning sessions
  const sessions = Array.from({ length: numSessions }, (_, si) => {
    const knowledgeGained = rand(0, 5);
    const insights = Array.from({ length: rand(0, 3) }, () =>
      `Learned: ${deptKnowledge[si % deptKnowledge.length]}`
    );
    const daysAgo = rand(0, 30);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return {
      agentId,
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
    };
  });

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

  // Simulate evolution metrics; never overwrite a real agent.
  const evolution = {
    agentId,
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
  };

  // Sample protection settings, not an active policy.
  const protection = {
    agentId,
    enabled: true,
    safetyLevel: pick(['standard', 'standard', 'standard', 'strict']),
    blockedPatterns: JSON.stringify(['(?:password|secret|api.?key)\\s*[:=]\\s*\\S+', 'credit\\s*card\\s*\\d']),
    allowedDomains: JSON.stringify([department.toLowerCase()]),
    maxKnowledgePerDay: rand(20, 100),
    maxConfidence: 0.95,
    requireVerification: Math.random() > 0.3,
    autoFilterToxic: true,
    learningScope: pick(['task_domain', 'task_domain', 'cross_domain']),
    dataRetentionDays: 90,
    violationCount: Math.random() > 0.8 ? rand(0, 3) : 0,
  };
  return { kind: 'synthetic-learning-preview' as const, department, knowledge, sessions, evolution, protection };
}

/** Stream one labelled synthetic profile at a time (the original fleet size was 2,000). */
export function* previewLearning(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 2000) throw Error('Preview count must be an integer from 1 to 2000.');
  const departments = Object.keys(DEPARTMENT_KNOWLEDGE);
  for (let i = 0; i < count; i++) yield simulateAgent(i, departments[i % departments.length]);
}
