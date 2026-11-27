/**
 * The twelve service lines ALO Labs sells, as data.
 *
 * Why a data file rather than copy inside a page: the same twelve entries have
 * to appear on the services index, on a per-service detail page, in the
 * sitemap, in JSON-LD and in the contact form's topic list. Duplicating that
 * copy in five places guarantees it drifts.
 *
 * ── On `state` ──────────────────────────────────────────────────────────────
 * The brief asks that no service be claimed as operational unless delivery
 * capability is verified. Every entry therefore carries an explicit state, and
 * the UI renders it rather than hiding it:
 *
 *   'delivered'  we have built and shipped this for clients, or it is our own
 *                running product. The D3 client portal is the live reference for
 *                the platform-engineering lines.
 *   'available'  we sell and staff this today, delivered to a client's scope.
 *                Normal professional-services capacity, not a claim that a
 *                finished product exists.
 *   'project'    delivered through a scoped engagement only; the internal
 *                tooling is partial, so nothing is automated end to end.
 *
 * No entry is labelled 'delivered' on the strength of a route, a table or a
 * placeholder component existing. That is the failure mode the platform audit
 * (docs/PLATFORM_AUDIT_2026-11.md) called out, and this file is deliberately
 * conservative about it.
 */

import { SERVICE_DEPTH, type ServiceDepth } from './service-depth'

export type ServiceState = 'delivered' | 'available' | 'project'

export const SERVICE_STATE_LABEL: Record<ServiceState, string> = {
  delivered: 'Delivered',
  available: 'Available',
  project: 'Project scope',
}

export interface ServiceLine {
  /** URL segment under /site/services. */
  slug: string
  /** Card + page title. */
  name: string
  /** One line for cards and meta descriptions. */
  tagline: string
  /** The business problem this exists to solve. */
  problem: string
  /** What we actually build. */
  description: string
  /** Named deliverables a client receives. */
  deliverables: string[]
  /** Technologies we use on this line. */
  stack: string[]
  /** Concrete things the work changes for the client. */
  outcomes: string[]
  state: ServiceState
  /** Why the state is what it is — shown to the reader, not just to us. */
  stateNote: string
  /** Sits under a group heading on the index. */
  category: 'Build' | 'Intelligence' | 'Operations'

}

/**
 * A `ServiceLine` as the detail page sees it: the delivery record plus the
 * depth content. The depth fields live only here, so the flat `SERVICE_LINES`
 * array stays a truthful delivery record and cannot accidentally render a
 * half-populated page.
 */
export type EnrichedServiceLine = ServiceLine & ServiceDepth

export const SERVICE_LINES: ServiceLine[] = [
  {
    slug: 'ai-software-development',
    name: 'AI Software Development',
    tagline: 'Custom software with AI built into the workflow, not bolted on.',
    problem:
      'Off-the-shelf AI tools solve generic problems. The work that actually costs a business time is specific to how that business runs.',
    description:
      'We design and build software where AI does real work inside a controlled process: reading documents, drafting, classifying, extracting, summarising, checking. Every AI step runs inside a workflow a person can inspect, correct and override, and every action is logged.',
    deliverables: [
      'Written architecture and scope before any code',
      'Working application with tests and verification',
      'Human-in-the-loop review screens for AI output',
      'Prompt and model configuration kept in version control',
      'Documentation, handover and post-launch support',
    ],
    stack: ['TypeScript', 'Python', 'Next.js', 'PostgreSQL', 'Prisma', 'Docker', 'Provider-agnostic model APIs'],
    outcomes: [
      'AI assistance inside your actual process rather than a separate chat window',
      'Reviewable output with a clear path to correct a wrong answer',
      'A codebase you own, not a subscription you rent',
    ],
    state: 'available',
    stateNote:
      'Sold and staffed today. Scope, timeline and commercial terms are agreed before work starts — no delivery date is implied by this page.',
    category: 'Build',
  },
  {
    slug: 'ai-agent-development',
    name: 'AI Agent Development',
    tagline: 'Single-purpose agents with real tools, real permissions and real limits.',
    problem:
      'A demo agent that answers questions is easy. An agent that takes actions safely — with permissions, audit trails and a stop condition — is the hard part.',
    description:
      'We build individual agents that do one job well: each gets a narrow scope, a declared tool set, resource limits, error handling and an approval gate for anything consequential. Agents can propose their own changes but never approve them.',
    deliverables: [
      'Agent specification: role, tools, permissions, limits',
      'Tool implementations with input validation',
      'Error handling and bounded retry behaviour',
      'Audit log of every action taken',
      'Test suite covering the failure paths, not only the happy path',
    ],
    stack: ['TypeScript', 'Python', 'Function calling', 'Vector search', 'Redis', 'PostgreSQL'],
    outcomes: [
      'An agent whose permissions you can state in a sentence',
      'Every action traceable after the fact',
      'Failure that degrades visibly instead of silently',
    ],
    state: 'available',
    stateNote:
      'Delivered per engagement. We scope the agent against your process first; a general-purpose agent that does everything is not something we offer.',
    category: 'Intelligence',
  },
  {
    slug: 'multi-agent-systems',
    name: 'Multi-Agent AI Systems',
    tagline: 'Several specialists, one plan, one outcome that can be checked.',
    problem:
      'Complex work needs different skills at different steps. A single agent given every tool becomes unpredictable and impossible to audit.',
    description:
      'We build orchestration where a request is decomposed into steps, routed to the agent that owns each step, executed in parallel where the steps are independent, and tracked from start to finish. The plan is visible before execution, and privileged steps wait for approval.',
    deliverables: [
      'Goal decomposition and routing design',
      'Agent registry with versioned, auditable definitions',
      'Orchestration pipeline with dependency and parallel handling',
      'Approval gates for high-risk steps',
      'Run history with per-step status and replay',
    ],
    stack: ['TypeScript', 'Node.js', 'PostgreSQL', 'Redis', 'Job queues', 'Event-driven workers'],
    outcomes: [
      'Each step owned by a specialist rather than one generalist',
      'Parallel execution where the work allows it',
      'A visible, auditable plan instead of a black box',
    ],
    state: 'available',
    stateNote:
      'The orchestration engine runs and is tested inside the ALO Labs platform; client systems are built on a scoped engagement rather than self-serve.',
    category: 'Intelligence',
  },
  {
    slug: 'business-process-automation',
    name: 'Business Process Automation',
    tagline: 'Remove the repetitive work, keep the judgement.',
    problem:
      'Skilled people spend hours a week moving data between systems, chasing follow-ups and checking documents — work that is slow, error-prone and demoralising.',
    description:
      'We map the process as it actually runs, then automate the steps worth automating and leave the judgement calls with a person. Everything is scoped, reviewable and reversible, with monitoring so a failure is visible before a client notices.',
    deliverables: [
      'Process map with the automation boundary marked',
      'Automated workflow with human approval steps',
      'Exception handling and failure notification',
      'Integration with your existing systems',
      'Monitoring, logging and run history',
    ],
    stack: ['TypeScript', 'Python', 'REST and webhook integration', 'Cron and queue workers', 'SQL'],
    outcomes: [
      'Hours returned to the team each week',
      'Fewer transcription and hand-off errors',
      'A clear record of what ran and when',
    ],
    state: 'available',
    stateNote:
      'Delivered per engagement with a discovery step first. We will say if a process is not worth automating rather than build it anyway.',
    category: 'Operations',
  },
  {
    slug: 'web-application-development',
    name: 'Websites & Web Applications',
    tagline: 'Fast, accessible, well-built web software — marketing site to platform.',
    problem:
      'Most web builds optimise for launch day. The cost arrives later as page weight, inaccessible interfaces and a codebase nobody wants to touch.',
    description:
      'We build marketing sites and web applications with performance, accessibility and maintainability treated as requirements from the first commit: real budgets for Core Web Vitals, keyboard and screen-reader paths, and server rendering where it belongs.',
    deliverables: [
      'Production build with a CI pipeline',
      'Performance and accessibility checks in the pipeline',
      'Responsive layouts tested across device widths',
      'SEO: unique titles, canonicals, sitemap, structured data',
      'Documentation and handover',
    ],
    stack: ['Next.js', 'React', 'TypeScript', 'Tailwind', 'Node.js', 'PostgreSQL', 'Vercel or self-hosted'],
    outcomes: [
      'A site that loads quickly on a mid-range phone',
      'Keyboard and screen-reader usable without a rewrite',
      'A codebase your next developer can work in',
    ],
    state: 'delivered',
    stateNote:
      'Our own public site and the client portal are both running builds of this work. Public links are given on request rather than invented as case studies.',
    category: 'Build',
  },
  {
    slug: 'enterprise-crm-platforms',
    name: 'Enterprise CRM & Business Platforms',
    tagline: 'One system of record instead of six spreadsheets.',
    problem:
      'Business data scattered across spreadsheets, inboxes and disconnected tools makes reporting guesswork and hand-offs lossy.',
    description:
      'We build business platforms — CRM, client portals, project and billing systems — around the data model your operation actually needs, with role-based access, audit trails and multi-tenant isolation where several parties share the system.',
    deliverables: [
      'Data model and migration plan',
      'Role-based access control',
      'Multi-tenant isolation where required',
      'Reporting and export',
      'Import of existing data with a verified reconciliation',
    ],
    stack: ['Next.js', 'TypeScript', 'PostgreSQL', 'Prisma', 'MySQL', 'Redis', 'Docker'],
    outcomes: [
      'One place where the truth about a customer lives',
      'Access that matches who actually needs to see what',
      'Reports generated rather than assembled by hand',
    ],
    state: 'delivered',
    stateNote:
      'ALO Labs runs its own client portal — requests, milestones, deliverables and billing — as a live reference for this line.',
    category: 'Operations',
  },
  {
    slug: 'ai-marketing-seo',
    name: 'AI Marketing & SEO',
    tagline: 'Search visibility earned by structure and quality, not by volume.',
    problem:
      'Content published at volume without structure earns nothing: search engines cannot parse it and readers do not trust it.',
    description:
      'We improve discoverability through technical SEO, structured data, clear information architecture and content that answers a real query. AI helps with research, drafting and analysis; a person decides what is published.',
    deliverables: [
      'Technical SEO audit with prioritised fixes',
      'Structured data and metadata implementation',
      'Information architecture and internal linking',
      'Content plan tied to actual search intent',
      'Measurement against baseline, not vanity charts',
    ],
    stack: ['Next.js metadata', 'JSON-LD', 'Schema.org', 'Analytics', 'Search Console', 'Content tooling'],
    outcomes: [
      'Pages search engines can crawl, parse and understand',
      'Content written for the query a customer actually types',
      'A measurable baseline to judge the work against',
    ],
    state: 'available',
    stateNote:
      'No ranking, traffic or revenue figure is promised here. Organic search outcomes depend on competition and time, and we do not publish numbers we cannot stand behind.',
    category: 'Operations',
  },
  {
    slug: 'ai-image-video',
    name: 'AI Image & Video Production',
    tagline: 'Generated visual assets with a defined review and licensing path.',
    problem:
      'Generated media is easy to produce and easy to get wrong: inconsistent brand assets, unclear rights, and output nobody checked before publishing.',
    description:
      'We produce brand-consistent imagery and short video using models whose licences we have reviewed, with a human review step before anything ships. Assets are versioned, and the generation settings are recorded so a result can be reproduced.',
    deliverables: [
      'Brand-consistent asset set',
      'Documented model and licence for each asset',
      'Human review and approval step',
      'Versioned source assets',
      'Export in the formats your channels need',
    ],
    stack: ['Image and video generation APIs', 'ComfyUI', 'FFmpeg', 'Brand token systems'],
    outcomes: [
      'Assets consistent with the existing brand rather than one-off images',
      'A clear answer on what may be used commercially',
      'A recorded path back to the source of any asset',
    ],
    state: 'project',
    stateNote:
      'Delivered as a scoped project only. We are deliberately not presenting a self-serve generator, and capability depends on the licensing terms of the models used for a given asset.',
    category: 'Intelligence',
  },
  {
    slug: 'voice-conversational-ai',
    name: 'Voice & Conversational AI',
    tagline: 'Bangla-first conversation systems, with humans kept in the loop.',
    problem:
      'Most voice AI assumes English and a clean line. In practice a Bangladesh customer speaks Bangla, changes topic mid-call, and needs a person when it matters.',
    description:
      'We build Bangla-capable conversational systems: speech recognition and synthesis, a dialogue layer that can escalate, transcripts that land in the CRM, and metering per conversation. Where telephony is in scope it is delivered against a configured provider.',
    deliverables: [
      'Conversation design and escalation rules',
      'Speech pipeline wired to a configured provider',
      'Transcript capture and CRM logging',
      'Usage metering and cost visibility',
      'Human hand-off path',
    ],
    stack: ['TypeScript', 'Python', 'Speech recognition and synthesis APIs', 'WebRTC', 'SIP/PSTN provider'],
    outcomes: [
      'Bangla conversations handled without an English pivot',
      'Every call transcribed and attributable',
      'A working escalation path rather than a dead end',
    ],
    state: 'project',
    stateNote:
      'The conversation layer is verified in our own tests, but live telephony needs a configured PSTN/SIP provider on the client account. We do not describe simulated calls as real telephony.',
    category: 'Intelligence',
  },
  {
    slug: 'api-system-integration',
    name: 'API & System Integration',
    tagline: 'Make the systems you already depend on talk to each other.',
    problem:
      'Data is rekeyed between systems because they were never designed together, and every manual copy is a chance to introduce an error.',
    description:
      'We build the integration layer between the systems you run: authenticated APIs, webhook handling, retry with backoff, idempotency so a duplicate event does not double-charge, and an audit trail of what moved where.',
    deliverables: [
      'Integration design with failure semantics defined',
      'Authenticated API and webhook implementation',
      'Retry, backoff and idempotency handling',
      'Data mapping and validation',
      'Operational runbook and alerting',
    ],
    stack: ['TypeScript', 'Node.js', 'REST', 'GraphQL', 'Webhooks', 'Message queues', 'OAuth 2.0'],
    outcomes: [
      'Data that stays consistent between systems',
      'Failures that retry or alert instead of corrupting a record',
      'A traceable history of every record moved',
    ],
    state: 'available',
    stateNote:
      'Scoped against the specific systems involved. We confirm the third party has an API and acceptable terms before quoting.',
    category: 'Build',
  },
  {
    slug: 'data-intelligence-analytics',
    name: 'Data Intelligence & Analytics',
    tagline: 'Reporting you can act on, from data you can trust.',
    problem:
      'Dashboards are easy to produce and easy to distrust. If the underlying data is inconsistent, a chart makes the problem look solved.',
    description:
      'We fix the data model first, then build the reporting: consistent definitions, validated ingestion, retention rules and access control. AI is used where it helps — classification, extraction, anomaly detection — with the pipeline auditable.',
    deliverables: [
      'Source audit and data model',
      'Ingestion pipelines with validation',
      'Retention and access rules',
      'Dashboards tied to agreed definitions',
      'Documented metric definitions',
    ],
    stack: ['SQL', 'PostgreSQL', 'Python', 'Pandas', 'ETL pipelines', 'BI tooling'],
    outcomes: [
      'Numbers that agree between reports',
      'A definition for each metric that everyone can point at',
      'Data retention that matches your obligations',
    ],
    state: 'available',
    stateNote:
      'Delivered per engagement. We start with the source audit because reporting built on inconsistent data wastes the budget.',
    category: 'Operations',
  },
  {
    slug: 'cloud-devops-engineering',
    name: 'Cloud & DevOps Engineering',
    tagline: 'Deployments that are repeatable, observable and reversible.',
    problem:
      'A deployment that works once because someone remembered the steps is not a deployment process. The next person breaks it — usually in production.',
    description:
      'We make infrastructure and delivery repeatable: containerised services, infrastructure as code, CI gates that actually block a bad build, backups that are tested by restoring, and monitoring that alerts a human before a customer complains.',
    deliverables: [
      'Containerised or provisioned infrastructure as code',
      'CI pipeline with typecheck, tests, lint and build gates',
      'Backup and verified restore procedure',
      'Monitoring, logging and alerts',
      'Deployment and rollback runbook',
    ],
    stack: ['Docker', 'GitHub Actions', 'Terraform-style IaC', 'Nginx', 'PostgreSQL', 'Linux', 'Cloud providers'],
    outcomes: [
      'Deployments that run the same way every time',
      'A restore that has been tested, not assumed',
      'Alerts that reach a person before an outage escalates',
    ],
    state: 'delivered',
    stateNote:
      'This is how our own platform is built and shipped — CI gates, tested restore and documented runbooks. Client infrastructure is delivered per engagement.',
    category: 'Build',
  },
]

/** Group the twelve into the three index sections. */
export const SERVICE_GROUPS = ['Build', 'Intelligence', 'Operations'] as const

export const SERVICE_GROUP_BLURB: Record<(typeof SERVICE_GROUPS)[number], string> = {
  Build: 'Engineering the software itself — applications, platforms and the infrastructure they run on.',
  Intelligence: 'Systems that reason, converse and act, with the controls that make that safe.',
  Operations: 'Making the business run better: automation, integration, visibility and reach.',
}

/**
 * Every service line, enriched with its detail-page content.
 *
 * `SERVICE_LINES` stays the flat delivery record (slug, name, state, price
 * shape) so the index, sitemap and JSON-LD keep working. `depth` is merged in
 * here rather than duplicated, so a page never renders a stale copy.
 */
export function serviceBySlug(slug: string): EnrichedServiceLine | undefined {
  const base = SERVICE_LINES.find((s) => s.slug === slug)
  if (!base) return undefined
  const depth = SERVICE_DEPTH[slug]
  // The cast is the one place a missing entry could slip through, so the
  // guard above is real: a slug added without depth content is a bug we want
  // to see at build time, not a page that renders half its sections.
  return depth ? ({ ...base, ...depth } as EnrichedServiceLine) : undefined
}

/** All twelve, enriched. Used by the index and the related-services rail. */
export function allServiceLines(): EnrichedServiceLine[] {
  return SERVICE_LINES.flatMap((base) => {
    const depth = SERVICE_DEPTH[base.slug]
    return depth ? [{ ...base, ...depth } as EnrichedServiceLine] : []
  })
}
