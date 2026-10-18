#!/usr/bin/env node
/**
 * Canonicalise workflow definitions.
 *
 * Rewrites workflows/definitions/*.json so every definition references:
 *   - a department that exists in src/lib/department-registry/registry.ts
 *   - an agent that exists in the 2,000-agent workforce (docs/workforce/agents.csv)
 *   - a per-step config.instruction (the workflow engine uses it as the step text)
 *
 * The original department/agent labels are preserved in config.original and
 * config.agentHint for traceability. Idempotent: running twice changes nothing.
 *
 * Usage: node scripts/canonicalize-workflow-definitions.mjs [--dry-run]
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'workflows', 'definitions');
const DRY_RUN = process.argv.includes('--dry-run');

const CANONICAL_DEPARTMENTS = new Set(
  [...readFileSync(path.join(ROOT, 'src', 'lib', 'department-registry', 'registry.ts'), 'utf8')
    .matchAll(/departmentName:\s*'([^']+)'/g)].map((match) => match[1]),
);

/** Department renames: definition label → canonical registry name. */
const DEPARTMENT_MAP = {
  'Study & Academic AI': 'Learning & Development',
  'Server Automation': 'DevOps',
  'Executive CEO Control': 'Executive Office',
  'Software Development': 'Software Development',
  'Digital Marketing Strategy': 'Digital Marketing',
  'Educational Agency Operations': 'Student Counseling',
  'Image AI Studio': 'Content Marketing',
  'Song & Music AI': 'Content Marketing',
  'Project Management': 'Operations',
  'Proposal & Contract Factory': 'Sales',
  SEO: 'SEO',
  'Video Production AI': 'Content Marketing',
  'AI Website Builder, Web Clone & Scraper': 'Software Development',
  'WhatsApp Business': 'WhatsApp Operations',
};

/** Role selection by action verb / keyword, in priority order. */
const ROLE_RULES = [
  { role: 'Quality Assurance', test: /(^|_)(qa|quality|verify|copyright|smoke|test|check|audit|compliance|validate|safety|robot|review)(_|$)/ },
  { role: 'Safety & Compliance', test: /(visa|legal|policy|compliance_guard|copyright_check)/ },
  { role: 'Research', test: /(research|analy|crawl|scrape|competitor|keyword|interview|university_matching|find_)/ },
  { role: 'Strategic Planning', test: /(plan|design|architect|strategy|scope|wbs|schedule|timeline|breakdown|storyboard|structure)/ },
  { role: 'Data Analyst', test: /(collect|metric|data|structure_data|extract)/ },
  { role: 'Reporting', test: /(report|summary|dashboard|kpi|analytics)/ },
  { role: 'Task Coordinator', test: /(track|assign|manage|coordinate|application|calendar|schedule_team|team)/ },
  { role: 'Process Automation', test: /(deploy|setup|set_up|configure|config|ssl|security|install|render|export|build_project|smoke_test)/ },
  { role: 'Execution', test: /(build|create|generate|implement|write|produce|add|compile|integrate|prepare|draft|compose|arrange|record|render)/ },
  { role: 'Communication', test: /(copy|content|social|outreach|email|message|broadcast|reply|chat)/ },
];

/** Actions whose instruction benefits from a hand-written sentence. */
const INSTRUCTION_OVERRIDES = {
  take_brief: 'Capture the brief: audience, goal, tone, constraints, deadline and success criteria.',
  setup_ssl: 'Issue and install a TLS certificate, force HTTPS and verify the certificate chain.',
  smoke_test: 'Run post-deployment smoke tests against the live URL and record every failure.',
  check_robots: 'Read robots.txt and the terms of service; abort if crawling is not permitted.',
  quality_check: 'Review the deliverable against the brief and the quality checklist; list defects.',
  verify_original: 'Check the output against existing works for originality; flag anything too close.',
  verify_safe: 'Confirm the output does not reproduce third-party protected design or copy.',
  create_dashboard: 'Assemble the KPI dashboard with period-over-period comparisons and source links.',
  generate_report: 'Write the executive report: findings, metrics, risks and recommended actions.',
  collect_metrics: 'Collect the period metrics from each department and normalise definitions.',
  design_course: 'Design the course: modules, learning outcomes, prerequisites and assessment plan.',
  create_exams: 'Create the exam paper with sections, weighting, time limits and a marking scheme.',
  create_quizzes: 'Create quizzes per module with answer keys and difficulty levels.',
  create_flashcards: 'Create flashcards for each key concept with a prompt and a concise answer.',
  prepare_for_lms: 'Package the course for LMS import (sections, activities, completion rules).',
  plan_visa_journey: 'Map the visa route, required documents, fees, timelines and refusal risks.',
  create_wbs: 'Break the scope into a work breakdown structure with owners and effort estimates.',
  calculate_pricing: 'Calculate pricing from scope, effort, rates and margin; show the assumptions.',
  draft_terms: 'Draft the commercial terms: payment schedule, revisions, IP and termination.',
  export_pdf: 'Export the approved proposal as a print-ready PDF and store the source file.',
  research_target_market: 'Research the target market: size, segments, buying triggers and channels.',
  analyze_competitors: 'Analyse competitor positioning, pricing and messaging; cite sources.',
  plan_content: 'Plan the content calendar: topics, formats, channels and publishing cadence.',
  plan_social: 'Plan the social calendar with platform-specific formats and posting times.',
  plan_ads: 'Plan the paid campaign: objectives, audiences, budgets, creatives and bid strategy.',
  write_copy: 'Write the campaign copy for each channel and include two alternative headlines.',
  setup_database: 'Create the database schema, indexes and seed data for the application.',
  design_api: 'Design the API surface: resources, methods, payloads, errors and auth.',
  generate_frontend: 'Generate the frontend application shell, routes and state management.',
  create_deployment_package: 'Produce the deployment package with build output and run instructions.',
  match_universities: 'Shortlist universities that match the student profile, budget and intake.',
  prepare_documents: 'Prepare the document checklist and verify each file against requirements.',
  track_applications: 'Track every application through submission, offer and decision stages.',
  create_storyboard: 'Create a shot-by-shot storyboard with duration, visuals and voiceover.',
  render_video: 'Render the final video in the required formats and check playback.',
  create_subtitles: 'Create accurate subtitles and a matching SRT file.',
  build_chatbot: 'Build the chatbot flows: intents, fallbacks, handoff and data capture.',
  plan_broadcasts: 'Plan broadcast segments, consent checks, templates and send windows.',
  validate_domain: 'Validate domain ownership, DNS records and registrar access.',
  create_nginx_config: 'Create the Nginx virtual host, reverse proxy and caching configuration.',
  deploy_live: 'Deploy the build to the target server and switch traffic over.',
};

function roleForAction(action, originalAgent) {
  for (const rule of ROLE_RULES) {
    if (rule.test.test(action)) return rule.role;
  }
  if (/generator|generation/i.test(originalAgent)) return 'Execution';
  if (/check|qa/i.test(originalAgent)) return 'Quality Assurance';
  return 'Senior Specialist';
}

const VERB_SENTENCES = {
  research: 'Research',
  analyze: 'Analyse',
  analyse: 'Analyse',
  design: 'Produce the design for',
  plan: 'Create the plan for',
  write: 'Write',
  create: 'Create',
  generate: 'Generate',
  build: 'Build',
  implement: 'Implement',
  setup: 'Set up',
  configure: 'Configure',
  collect: 'Collect',
  extract: 'Extract',
  structure: 'Structure',
  compile: 'Compile',
  integrate: 'Integrate',
  prepare: 'Prepare',
  draft: 'Draft',
  compose: 'Compose',
  arrange: 'Arrange',
  render: 'Render',
  export: 'Export',
  validate: 'Validate',
  deploy: 'Deploy',
  crawl: 'Crawl',
  scrape: 'Scrape',
  audit: 'Audit',
  track: 'Track',
  match: 'Match',
  find: 'Find',
  check: 'Check',
  verify: 'Verify',
  review: 'Review',
  test: 'Test',
  add: 'Add',
  assign: 'Assign',
  calculate: 'Calculate',
  define: 'Define',
  conduct: 'Conduct',
  convert: 'Convert',
  optimize: 'Optimise',
};

const ACRONYMS = new Map([
  ['crm', 'CRM'],
  ['seo', 'SEO'],
  ['kpi', 'KPIs'],
  ['ssl', 'SSL'],
  ['api', 'API'],
  ['ui', 'UI'],
  ['lms', 'LMS'],
  ['pdf', 'PDF'],
  ['qa', 'QA'],
]);

function objectPhrase(action) {
  const words = action.split('_').filter(Boolean);
  const rest = words.length > 1 ? words.slice(1) : words;
  return rest
    .map((word) => ACRONYMS.get(word) ?? word)
    .join(' ');
}

function instructionFor(action, workflowName) {
  if (INSTRUCTION_OVERRIDES[action]) return INSTRUCTION_OVERRIDES[action];
  const verb = action.split('_')[0];
  const phrase = objectPhrase(action);
  const lead = VERB_SENTENCES[verb] ?? 'Complete';
  return `${lead} ${phrase} for the ${workflowName} workflow; return the deliverable and its assumptions.`;
}

function canonicalise(file, def) {
  const originalDepartment = def.department;
  const department = DEPARTMENT_MAP[originalDepartment] ?? originalDepartment;
  if (!CANONICAL_DEPARTMENTS.has(department)) {
    throw new Error(`${file}: no canonical department for "${originalDepartment}"`);
  }

  def.department = department;
  def.steps = def.steps.map((step) => {
    // Preserve provenance across repeated runs: once canonicalised, the
    // original labels live in config and must not be overwritten by the
    // already-canonical agent name.
    const config = step.config && typeof step.config === 'object' ? step.config : {};
    const original = config.original && typeof config.original === 'object' ? config.original : null;
    const originalAgent = typeof original?.agent === 'string' ? original.agent : step.agent;
    const originalDept = typeof original?.department === 'string' ? original.department : originalDepartment;
    const instruction =
      typeof config.instruction === 'string' && config.instruction.trim().length > 0
        ? config.instruction
        : instructionFor(step.action, def.name);
    const role = roleForAction(step.action, originalAgent);
    return {
      step: step.step,
      agent: `${department} ${role} Agent`,
      action: step.action,
      config: {
        instruction,
        agentHint: typeof config.agentHint === 'string' ? config.agentHint : originalAgent,
        original: { department: originalDept, agent: originalAgent },
      },
    };
  });
  return def;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const files = readdirSync(DIR).filter((file) => file.endsWith('.json') && file !== 'workflows_registry.json');
let changed = 0;

for (const file of files) {
  const fullPath = path.join(DIR, file);
  const before = readFileSync(fullPath, 'utf8');
  const def = JSON.parse(before);
  const updated = canonicalise(file, def);
  const after = `${JSON.stringify(updated, null, 2)}\n`;
  if (after !== before) {
    changed += 1;
    if (!DRY_RUN) writeFileSync(fullPath, after);
    console.log(`${DRY_RUN ? 'would update' : 'updated'} ${file}`);
  }
}

console.log(`\n${files.length} definitions scanned, ${changed} ${DRY_RUN ? 'would change' : 'changed'}.`);
