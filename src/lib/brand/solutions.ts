/**
 * The twelve business solutions ALO Labs sells, as data.
 *
 * Why this is a separate file from `service-lines.ts` rather than a second
 * hand-written page:
 *
 *   solutions  answer "what business outcome can you buy?"  — the buying view
 *   services   answer "how is that delivered, and is it real?" — the engineering view
 *
 * They overlap but they are not the same list, and a sales page that disagrees
 * with a delivery page is how companies start lying by accident. Each solution
 * therefore references the service line it is delivered through (`service`),
 * and the two files are cross-checked by `__tests__/unit/lib/solutions.test.ts`:
 * a solution cannot point at a service slug that does not exist, and no
 * solution may claim to be running when its underlying service is not.
 *
 * ── On `state` ──────────────────────────────────────────────────────────────
 * Every entry carries the same honesty constraint as the service lines:
 *
 *   'live'       running today, in our own products or shipped client work
 *   'available'  sold and staffed now, scoped and agreed per engagement
 *   'scoped'     delivered through a scoped project only; some enabling
 *                component (telephony provider, media pipeline) is not
 *                provisioned in this deployment, so nothing here is self-serve
 *
 * The state is rendered on every card and every detail page, in the same
 * vocabulary the rest of the site uses. No solution is labelled 'live' on the
 * strength of a route or a component existing.
 */

export type SolutionState = 'live' | 'available' | 'scoped'

export const SOLUTION_STATE_LABEL: Record<SolutionState, string> = {
  live: 'Live today',
  available: 'Available now',
  scoped: 'Scoped per project',
}

/** One line explaining what a state means, shown next to the legend. */
export const SOLUTION_STATE_MEANING: Record<SolutionState, string> = {
  live: 'Running in production — our own products, or work already shipped.',
  available: 'Sold and staffed now; scope, timeline and price agreed before work starts.',
  scoped: 'Delivered as a scoped project. An enabling component is not provisioned here, so nothing is self-serve.',
}

export type SolutionGroup = 'Intelligence' | 'Engineering' | 'Growth' | 'Operations'

export const SOLUTION_GROUP_BLURB: Record<SolutionGroup, string> = {
  Intelligence: 'Systems that reason, decide and act — with the limits that make acting safe.',
  Engineering: 'The software itself: products, platforms and the interfaces people use.',
  Growth: 'Reaching the right people, and producing the material that earns their attention.',
  Operations: 'The plumbing that keeps a business running: data, integrations, cloud and support.',
}

export interface BusinessSolution {
  /** URL segment under /site/solutions. */
  slug: string
  /** Card and page title. */
  name: string
  /** One sentence for cards, meta descriptions and JSON-LD. */
  tagline: string
  /** What it does, in the plainest terms we can manage. */
  whatItDoes: string
  /** The business problem this exists to solve, stated as the client feels it. */
  businessProblem: string
  /** Named things the client receives — deliverables, not adjectives. */
  youReceive: string[]
  /** How ALO Labs actually delivers it, step by step. */
  howWeDeliver: string[]
  /** What is genuinely available today, including what is not. */
  availableToday: string
  /** Honest delivery state, rendered in the UI. */
  state: SolutionState
  /** The service line this is delivered through (must exist in SERVICE_LINES). */
  service: string
  /** Short capability tags for the card. */
  tags: string[]
  /** Which index group it sits in. */
  group: SolutionGroup
}

export const BUSINESS_SOLUTIONS: BusinessSolution[] = [
  {
    slug: 'ai-software-development',
    name: 'AI Software Development',
    tagline: 'Software where AI does real work inside a controlled process — not a chatbot bolted onto a form.',
    whatItDoes:
      'We build applications where a model reads, drafts, classifies, extracts or checks as one step inside a workflow a person can inspect: documents get parsed into structured records, support tickets get triaged, applications get summarised, and every AI step is logged with its input and output.',
    businessProblem:
      'Generic AI tools solve generic problems. The work that actually costs a business time is specific to how that business runs — the approval chain nobody documented, the spreadsheet three teams maintain by hand, the 40-page PDF a human re-keys into a system every morning.',
    youReceive: [
      'A written architecture and scope before any code is written',
      'A working application with automated tests and a deployment pipeline',
      'Human-in-the-loop review screens for AI output, with an override path',
      'Prompt, model and routing configuration held in version control',
      'Documentation, handover and a support arrangement you agree to',
    ],
    howWeDeliver: [
      'Discovery: we map the process as it actually runs, including the exceptions',
      'Architecture: mark exactly where AI acts, where a person decides, and what is logged',
      'Build: AI steps implemented as versioned, testable units behind a gateway',
      'Verification: evaluation cases for the AI steps, not only unit tests around them',
      'Handover: the code, the configuration and the runbook are yours',
    ],
    availableToday:
      'Sold and staffed now. Scope, timeline and commercial terms are agreed before work starts — no delivery date is implied by this page.',
    state: 'available',
    service: 'ai-software-development',
    tags: ['Workflow AI', 'Document processing', 'Human review'],
    group: 'Engineering',
  },
  {
    slug: 'custom-ai-agent-development',
    name: 'Custom AI Agent Development',
    tagline: 'Single-purpose agents with declared tools, real permissions and a stop condition.',
    whatItDoes:
      'We build agents that do one job well: each gets a narrow scope, an explicit tool list, resource limits, error handling and an approval gate before anything consequential happens. Agents can propose their own changes but never approve them.',
    businessProblem:
      'A demo agent that answers questions is easy. An agent that takes an action inside your business — issues a refund, updates a record, sends a customer message — and can be audited afterwards is the part that takes engineering. Most agent projects fail on permissions, not on intelligence.',
    youReceive: [
      'An agent specification: role, tools, permissions, limits, failure behaviour',
      'Tool implementations with input validation and timeouts',
      'Bounded retry and graceful degradation on provider failure',
      'An audit record of every action the agent took',
      'Tests covering the refusal and failure paths, not only the happy path',
    ],
    howWeDeliver: [
      'We write down what the agent may and may not do, in one page, and you sign it off',
      'Tools are built and tested against your systems first, agent behaviour second',
      'The agent runs behind an approval gate until its output has been reviewed in practice',
      'We hand over with monitoring, an audit view and a documented kill switch',
    ],
    availableToday:
      'Delivered per engagement. We scope the agent against a real process first; a general-purpose agent that does everything is not something we offer.',
    state: 'available',
    service: 'ai-agent-development',
    tags: ['Tool use', 'Permissions', 'Audit trail'],
    group: 'Intelligence',
  },
  {
    slug: 'multi-agent-ai-systems',
    name: 'Multi-Agent AI Systems',
    tagline: 'Several specialists, one plan, one outcome that can be checked afterwards.',
    whatItDoes:
      'We build orchestration where a request is decomposed into steps, each step is routed to the agent that owns it, independent steps run in parallel, and the whole run is tracked from request to result. The plan is visible before execution and privileged steps wait for approval.',
    businessProblem:
      'Complex work needs different skills at different steps. A single agent given every tool becomes unpredictable and impossible to audit — and when it goes wrong, there is no record of which step failed or why.',
    youReceive: [
      'Goal decomposition and routing design',
      'A versioned agent registry with auditable definitions',
      'An orchestration pipeline handling dependencies and parallel work',
      'Approval gates on high-risk steps',
      'Run history with per-step status, inputs, outputs and replay',
    ],
    howWeDeliver: [
      'We model the work as steps and decide which steps genuinely need a model',
      'Each specialist agent is specified, built and tested independently',
      'The orchestrator is wired with explicit dependencies, timeouts and retries',
      'We run shadow executions against real inputs before the system acts unattended',
    ],
    availableToday:
      'The orchestration engine runs and is tested inside the ALO Labs platform. Client systems are built on a scoped engagement rather than offered self-serve.',
    state: 'available',
    service: 'multi-agent-systems',
    tags: ['Orchestration', 'Parallel execution', 'Replay'],
    group: 'Intelligence',
  },
  {
    slug: 'business-process-automation',
    name: 'Business Process Automation',
    tagline: 'Remove the repetitive work; keep the judgement with the people who have it.',
    whatItDoes:
      'We map a process as it runs today, automate the steps worth automating, and leave the judgement calls with a person. Everything is scoped, reviewable and reversible, with monitoring so a failure is visible before a customer notices it.',
    businessProblem:
      'Skilled people spend hours a week moving data between systems, chasing follow-ups and re-checking documents. That work is slow, error-prone and demoralising — and it is usually the reason a good team cannot keep up with growth.',
    youReceive: [
      'A process map with the automation boundary drawn on it',
      'An automated workflow with explicit human approval steps',
      'Exception handling and failure notification to a named person',
      'Integrations with the systems you already run',
      'Monitoring, logging and a run history you can read',
    ],
    howWeDeliver: [
      'Discovery and measurement: how long each step takes and where it breaks',
      'We tell you which steps are not worth automating, and why',
      'Workflow built with idempotent steps and a rollback path',
      'Pilot on a real queue, then widen with monitoring in place',
    ],
    availableToday:
      'Delivered per engagement, with discovery first. If a process is not worth automating, we say so rather than build it anyway.',
    state: 'available',
    service: 'business-process-automation',
    tags: ['Process mapping', 'Approvals', 'Monitoring'],
    group: 'Operations',
  },
  {
    slug: 'website-web-application-development',
    name: 'Website & Web Application Development',
    tagline: 'Fast, accessible, well-built web software — from marketing site to production platform.',
    whatItDoes:
      'We design and build marketing sites and web applications where performance, accessibility and maintainability are release criteria from the first commit: real budgets for Core Web Vitals, keyboard and screen-reader paths, server rendering where it belongs, and a codebase a future team can work in.',
    businessProblem:
      'Most web builds optimise for launch day. The cost arrives later as page weight, inaccessible interfaces, SEO that never recovers from a bad migration, and a codebase nobody wants to touch — so every change becomes a negotiation with the original agency.',
    youReceive: [
      'A production build with a real CI pipeline',
      'Performance and accessibility checks enforced in that pipeline',
      'Responsive layouts verified at 390 / 768 / 1024 / 1440 / 1920 px',
      'SEO foundations: unique titles, canonicals, sitemap, structured data',
      'Documentation and a handover that does not require us',
    ],
    howWeDeliver: [
      'Content and information architecture before visual design',
      'Design system and component library built on brand tokens, not screenshots',
      'Engineering in reviewed increments with previews per change',
      'Launch checklist: performance, accessibility, SEO, analytics, rollback',
    ],
    availableToday:
      'Live. This website and the ALO Labs client portal are both running builds of exactly this work.',
    state: 'live',
    service: 'web-application-development',
    tags: ['Next.js', 'Core Web Vitals', 'Accessibility'],
    group: 'Engineering',
  },
  {
    slug: 'enterprise-crm-portals',
    name: 'Enterprise CRM & Client Portals',
    tagline: 'One system of record instead of six spreadsheets and an inbox nobody owns.',
    whatItDoes:
      'We build the business platforms that hold a company together — CRM, client portals, project and billing systems — around the data model your operation actually needs, with role-based access, audit trails and tenant isolation where several parties share the system.',
    businessProblem:
      'Business data scattered across spreadsheets, inboxes and disconnected tools makes reporting guesswork. Hand-offs are lossy, two teams disagree about the same customer, and nobody can say what was promised to whom.',
    youReceive: [
      'A data model designed from your real process, reviewed with you',
      'Role-based access with per-record permissions',
      'An audit trail of who changed what, and when',
      'Tenant isolation enforced at the query layer where parties share the system',
      'Reporting views your team can answer questions with',
    ],
    howWeDeliver: [
      'Domain modelling workshops with the people who use the data daily',
      'Migration plan for existing spreadsheets and systems, with reconciliation counts',
      'Build in slices: one workflow live, then the next',
      'Handover with admin training and documented permission model',
    ],
    availableToday:
      'Live in our own client portal. Client platforms are built on a scoped engagement against the client’s data model.',
    state: 'live',
    service: 'enterprise-crm-platforms',
    tags: ['Multi-tenant', 'RBAC', 'Audit log'],
    group: 'Engineering',
  },
  {
    slug: 'ai-marketing-seo',
    name: 'AI Marketing & SEO',
    tagline: 'Visibility earned by structure and substance, not by volume.',
    whatItDoes:
      'We make a site legible to search engines and AI answer engines: correct technical SEO, structured data that matches the real content, internal linking that reflects how the business actually works, and content produced with a named human accountable for every claim.',
    businessProblem:
      'AI content tools make it cheap to publish a lot and expensive to be believed. Sites fill with pages that rank briefly, cannibalise each other and damage the brand — while the technical reasons the site is invisible stay unfixed.',
    youReceive: [
      'A technical SEO audit with reproducible evidence per finding',
      'Fixes, or a prioritised list your team can execute',
      'Structured data (Organization, Service, FAQ, Breadcrumb) that matches the page',
      'An internal-linking and canonical strategy',
      'A content plan with an accountable human owner per page',
    ],
    howWeDeliver: [
      'Crawl and measure: titles, canonicals, sitemap, indexation, Core Web Vitals',
      'Fix the technical layer before writing anything',
      'Map topics to real commercial questions, one page per question',
      'Review every published claim against something verifiable',
    ],
    availableToday:
      'Sold and staffed now. AI assists the analysis and the drafting; a person is accountable for what is published.',
    state: 'available',
    service: 'ai-marketing-seo',
    tags: ['Technical SEO', 'Structured data', 'Content ops'],
    group: 'Growth',
  },
  {
    slug: 'ai-content-production',
    name: 'AI Content Production',
    tagline: 'Production capacity without the volume-for-its-own-sake problem.',
    whatItDoes:
      'We build a content pipeline — research, drafting, review, brand and factual checks, publishing — where AI carries the repetitive stages and a person signs off. Briefs, style rules, banned claims and approval states live in the system rather than in someone’s head.',
    businessProblem:
      'A business needs a steady output of pages, posts, product copy and documentation, but hiring for it is slow and buying raw AI output produces generic material nobody trusts — and the review burden quietly lands on the most senior person.',
    youReceive: [
      'A documented editorial pipeline with named stages and owners',
      'Brand voice rules and a banned-claims list enforced in tooling',
      'Templates and prompts kept in version control',
      'A review queue with approve / correct / reject states',
      'A publishing calendar wired to the channels you actually use',
    ],
    howWeDeliver: [
      'Voice, audience and factual boundaries written down first',
      'Pipeline built with human gates at the points that matter',
      'Pilot batch measured against your existing material',
      'Handover with training for the people who will approve output',
    ],
    availableToday:
      'Sold and staffed now, delivered as a pipeline inside your workflow. We do not sell “unlimited content” — output is bounded by the review capacity you want to fund.',
    state: 'available',
    service: 'ai-marketing-seo',
    tags: ['Pipelines', 'Brand voice', 'Review gates'],
    group: 'Growth',
  },
  {
    slug: 'image-video-audio',
    name: 'Image, Video & Audio Solutions',
    tagline: 'Generated and edited media with a defined review and licensing path.',
    whatItDoes:
      'We build media production workflows — image generation for product and campaign assets, video assembly and captioning, voiceover and audio cleaning — with a human review step and a recorded provenance note for each asset so nobody has to guess how it was made.',
    businessProblem:
      'Generated media is cheap to produce and expensive to get wrong: licensing is unclear, brand consistency drifts, and nobody can prove which asset was approved or what it was made from.',
    youReceive: [
      'A defined asset pipeline: brief, generate, review, approve, export',
      'Brand-consistent prompt and style presets, stored and versioned',
      'A licence and provenance note recorded per asset',
      'Export presets for the channels you publish to',
      'A review interface with approve / reject and written reasons',
    ],
    howWeDeliver: [
      'We agree the asset specification and the brand constraints up front',
      'Pipeline built and run on a pilot batch you judge, not on our samples',
      'Each asset carries its prompt, model and approval record',
      'Handover includes the presets, the licence notes and the review process',
    ],
    availableToday:
      'Delivered as a scoped project. Media generation APIs are billed per call and are not provisioned as a self-serve product in this deployment.',
    state: 'scoped',
    service: 'ai-image-video',
    tags: ['Asset pipeline', 'Provenance', 'Brand presets'],
    group: 'Growth',
  },
  {
    slug: 'voice-ai-customer-support',
    name: 'Voice AI & Customer Support',
    tagline: 'Bangla-first conversation loops, with humans kept in the loop.',
    whatItDoes:
      'We build voice and messaging support systems: inbound conversation handling, intent capture, transcript logging and a clean hand-off to a human when confidence drops or the customer asks. Bangla and English are handled as first-class languages, not a translation layer bolted on at the end.',
    businessProblem:
      'Support volume grows faster than headcount, and the repetitive calls crowd out the ones that need a person. Meanwhile the transcript of what customers actually say — the most useful product research a company has — is never written down.',
    youReceive: [
      'A conversation design covering intents, escalation and failure paths',
      'Working voice and messaging loops with transcript capture',
      'A human hand-off rule, tested against real conversations',
      'Conversation analytics: what people ask, where it breaks',
      'An integration path into your CRM or ticketing system',
    ],
    howWeDeliver: [
      'We record real conversations and design against them',
      'Conversation layer built and verified in test calls before any live traffic',
      'Telephony connection configured with your chosen PSTN/SIP provider',
      'Gradual rollout with a human on standby and a documented stop condition',
    ],
    availableToday:
      'The conversation layer is verified in our test suite. Placing real calls requires a configured PSTN/SIP provider on your account, so this is scoped per project — we do not describe simulated calls as live telephony.',
    state: 'scoped',
    service: 'voice-conversational-ai',
    tags: ['Bangla + English', 'Transcripts', 'Human hand-off'],
    group: 'Intelligence',
  },
  {
    slug: 'api-system-integration',
    name: 'API & System Integration',
    tagline: 'Make the tools you already pay for behave like one system.',
    whatItDoes:
      'We connect systems that were never designed to talk: documented APIs, webhooks, scheduled jobs, and where necessary a controlled adapter around a system that has no API at all. Every integration is idempotent, observable and able to survive the other side being down.',
    businessProblem:
      'When tools do not talk, people become the integration layer — copying data, chasing approvals, re-keying information. The business then cannot grow without adding people to do the copying.',
    youReceive: [
      'An integration map showing what data moves where, and how often',
      'Versioned API clients with typed contracts',
      'Idempotency, retry policy and dead-letter handling',
      'Monitoring and alerting per integration, not just per server',
      'Documentation of every endpoint and credential rotation procedure',
    ],
    howWeDeliver: [
      'Inventory the systems and the data that must move between them',
      'Agree the contract — schema, failure semantics, ownership — in writing',
      'Build with retries and reconciliation counts from day one',
      'Run a parallel period where both paths exist, then cut over',
    ],
    availableToday:
      'Sold and staffed now. We integrate against your accounts and credentials; integration is done inside your systems, never through shared passwords.',
    state: 'available',
    service: 'api-system-integration',
    tags: ['Webhooks', 'Idempotency', 'Observability'],
    group: 'Operations',
  },
  {
    slug: 'cloud-devops-engineering',
    name: 'Cloud & DevOps Engineering',
    tagline: 'Deployments that are repeatable, observable and reversible.',
    whatItDoes:
      'We make infrastructure and delivery repeatable: containerised services, infrastructure as code, CI gates that actually block a bad build, backups that are tested by restoring them, and monitoring that reaches a human before a customer complains.',
    businessProblem:
      'A deployment that works because someone remembered the steps is not a deployment process. The next person breaks it — usually in production, usually at night, usually with no rollback path.',
    youReceive: [
      'Containerised or provisioned infrastructure defined as code',
      'A CI pipeline gating typecheck, tests, lint and build',
      'A backup procedure and a restore that has been performed, not assumed',
      'Monitoring, logging and alert routing to a named person',
      'A deployment and rollback runbook',
    ],
    howWeDeliver: [
      'Audit the current setup and write down the real failure modes',
      'Make the build reproducible before making it faster',
      'Prove the backup by restoring it into a clean environment',
      'Hand over the runbook and rehearse one rollback together',
    ],
    availableToday:
      'Live. This is how our own platform is built and shipped — CI gates, tested restore and documented runbooks.',
    state: 'live',
    service: 'cloud-devops-engineering',
    tags: ['CI/CD', 'IaC', 'Tested restore'],
    group: 'Operations',
  },
]

export const SOLUTION_GROUPS: readonly SolutionGroup[] = ['Intelligence', 'Engineering', 'Growth', 'Operations']

export function solutionBySlug(slug: string): BusinessSolution | undefined {
  return BUSINESS_SOLUTIONS.find((s) => s.slug === slug)
}

/** Count of solutions by state, used for the honest summary line on the hub. */
export function solutionStateCounts(): Record<SolutionState, number> {
  return BUSINESS_SOLUTIONS.reduce(
    (acc, s) => {
      acc[s.state] += 1
      return acc
    },
    { live: 0, available: 0, scoped: 0 } as Record<SolutionState, number>,
  )
}
