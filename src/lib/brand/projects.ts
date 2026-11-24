/**
 * The public project showcase, as data.
 *
 * ── The rule this file exists to enforce ────────────────────────────────────
 * Nothing goes in here that we cannot point at. Each entry is limited to work
 * that is visible in this repository or running in this deployment, and every
 * claim is annotated with the thing that supports it in `evidence`. If a
 * project's status is uncertain, it is labelled uncertain rather than promoted.
 *
 * What is deliberately absent:
 *
 *   • Customer names. No client has granted permission to be named, and
 *     inventing one is the single most damaging thing a showcase page can do.
 *   • Testimonials. Same reason. The site states this openly instead of
 *     padding the page.
 *   • Performance and revenue metrics. We do not have measured, attributable
 *     numbers for these projects, so there are none on the page. Counts that
 *     *are* checkable (models, routes, tests) appear only where they are
 *     measured from the repository, and are labelled as such.
 *   • Screenshots of screens a visitor cannot reach. The platform is behind
 *     authentication; a mocked-up screenshot of a real product would be a
 *     fabricated claim. Where a real UI exists, it is named by route so a
 *     reader understands what the product's surface actually is.
 *
 * ── On ALO Education and ALO English AI ─────────────────────────────────────
 * The brief asked us to evaluate these. The repository audit
 * (docs/ALO_EDUCATION_PHASE0_AUDIT.md) records that the education domain in
 * this codebase is a thin slice — university and course reference data plus
 * tutoring seed data — not a delivered student platform, and that "ALO English
 * AI" has no implementing module here. They are therefore listed in
 * `UNPUBLISHED_CANDIDATES` with the reason, rather than shown as showcases with
 * a flattering label. That list is rendered on the page: saying "not ready to
 * show, and here is why" is worth more than a logo wall.
 */

export type ProjectState = 'live' | 'partial' | 'planned'

export const PROJECT_STATE_LABEL: Record<ProjectState, string> = {
  live: 'Live',
  partial: 'Partial',
  planned: 'Planned',
}

export interface ProjectEvidence {
  /** What the claim is. */
  claim: string
  /** Where a reader could verify it. */
  basis: string
}

export interface ShowcaseProject {
  slug: string
  name: string
  /** Short line for the card. */
  summary: string
  /** Honest status. */
  state: ProjectState
  /** What kind of thing it is — product, platform, service. */
  kind: string
  /** The business problem in the client's own terms. */
  problem: string
  /** The architecture, described from the code rather than the pitch. */
  architecture: string[]
  /** What was actually implemented, in verifiable terms. */
  implementation: string[]
  /** Where the real surfaces live. No invented screenshots. */
  surfaces: { label: string; detail: string }[]
  /** Capabilities that are verified, each with what it rests on. */
  verified: ProjectEvidence[]
  /** What is explicitly *not* done. Shown, not hidden. */
  notYet: string[]
  /** Technology actually in use. */
  stack: string[]
  /** Where a visitor can go next. */
  links: { label: string; href: string; external?: boolean }[]
}

export const SHOWCASE_PROJECTS: ShowcaseProject[] = [
  {
    slug: 'agentos',
    name: 'ALO Labs AgentOS',
    summary:
      'The AI agent operating system ALO Labs builds on: one conversational surface, a governed agent registry, an inference gateway with bounded failover, and tenant isolation enforced where the data lives.',
    state: 'live',
    kind: 'Own platform · runs the company’s systems',
    problem:
      'Every AI initiative starts the same way: a model API call, a prompt in production, and no answer to the questions that follow. Which provider actually answered? What did the agent do, and who approved it? Which company owned that record? AgentOS exists because those questions have to be answerable before an agent is allowed to act.',
    architecture: [
      'Five layers with one gateway: experience → orchestration → agents and permissions → inference → data and audit',
      'A single inference gateway with a four-attempt ceiling across the configured provider chain, recording which provider answered',
      'A versioned agent registry: each agent declares its tools, limits and role, and definitions are auditable',
      'Company scoping applied in the query layer, not filtered in the interface',
      'Usage metered inside the same transaction as the model call, so billing attributes to a real request',
      'Privileged operations stop at an approval gate; agents may propose changes to themselves but never approve them',
    ],
    implementation: [
      '250 Prisma models on a SQLite development schema with a parallel MySQL production schema',
      '509 API routes, each behind the request proxy’s authentication and rate-limit rules',
      'A multi-agent orchestrator with goal decomposition, skill-based assignment and parallel step execution',
      'Provider adapters for the major hosted APIs plus local-first routing rules with an explicit no-silent-fallback policy',
      'A client portal with projects, deliverables, billing and support, isolated per client account',
      'An administrative audit trail, with high-risk actions gated on explicit approval',
    ],
    surfaces: [
      {
        label: 'Public platform statement',
        detail: '/site/platform-overview — what the platform does, honestly labelled by state',
      },
      {
        label: 'Client portal',
        detail: '/portal — projects, deliverables, billing and support (authenticated)',
      },
      {
        label: 'Operational console',
        detail: '/dashboard — agent registry, routing and audit (internal, authenticated)',
      },
    ],
    verified: [
      {
        claim: 'Provider failover is bounded and recorded',
        basis: 'Gateway failover covered by the automated suite; the answering provider is persisted on the response',
      },
      {
        claim: 'Tenant isolation is enforced in the query',
        basis: 'Cross-tenant access tests return 404 and log a security event',
      },
      {
        claim: 'Deployments are gated',
        basis: 'CI runs typecheck, lint, the full test suite and a production build before release',
      },
      {
        claim: 'Administrative actions are auditable',
        basis: 'Audit records written for privileged operations; approval gate on high-risk actions',
      },
    ],
    notYet: [
      'Autonomous coding worker — needs container-isolated execution. Marked planned, not offered.',
      'Local-first inference — routing rules work, but no local runtime is provisioned in this deployment, so it is labelled partial.',
      'Bangla voice telephony — conversation layer verified; placing real calls needs a configured PSTN/SIP provider.',
    ],
    stack: ['Next.js', 'TypeScript', 'React', 'Prisma', 'PostgreSQL / MySQL', 'SQLite (dev)', 'Docker', 'Redis', 'Tailwind CSS'],
    links: [
      { label: 'Platform overview', href: '/site/platform-overview' },
      { label: 'Explore related services', href: '/site/services/multi-agent-systems' },
      { label: 'Discuss a build like this', href: '/site/contact' },
    ],
  },
  {
    slug: 'client-portal',
    name: 'ALO Labs Client Portal',
    summary:
      'The client-facing half of the platform: a tenant-isolated workspace where a client sees their projects, deliverables, invoices and support threads — and nothing belonging to anyone else.',
    state: 'live',
    kind: 'Own product · used by real client accounts',
    problem:
      'Agency work usually runs through email and a shared drive. The client cannot see status without asking, deliverables get lost in threads, and invoices arrive detached from the work that justifies them. The portal replaces that with one place a client can check.',
    architecture: [
      'A separate route group with its own audience: a client session reaches /portal and /api/portal only, never the internal surface',
      'Per-record ownership checks rather than a role check alone',
      'Deliverable review states, so “sent” and “approved” are different things',
      'Billing and support modelled against the same project record as the work itself',
    ],
    implementation: [
      'Projects and project detail with milestones',
      'Deliverables with review states and version history',
      'Invoices and billing history',
      'Support threads with attachments',
      'Account-scoped notifications',
      'A staff-side account manager role that manages client work without impersonating the client',
    ],
    surfaces: [
      { label: 'Portal home', detail: '/portal — authenticated, client audience' },
      { label: 'Projects', detail: '/portal/projects — milestones and status' },
      { label: 'Deliverables', detail: '/portal/deliverables — review and approval states' },
      { label: 'Billing', detail: '/portal/billing — invoices and history' },
    ],
    verified: [
      {
        claim: 'A client cannot reach another client’s records',
        basis: 'Audience separation and per-record ownership enforced server-side; covered by access-control tests',
      },
      {
        claim: 'Only the client-facing surface is visible to clients',
        basis: 'Route-group allowlist in the request proxy; the internal surface is denied by default',
      },
    ],
    notYet: [
      'Self-service signup — accounts are provisioned by ALO Labs, by design.',
      'Public demo credentials — we do not publish a shared login to a system holding client data.',
    ],
    stack: ['Next.js', 'TypeScript', 'Prisma', 'Session-based auth', 'Role-based access control'],
    links: [
      { label: 'Client login', href: '/login' },
      { label: 'Enterprise CRM & portals', href: '/site/solutions/enterprise-crm-portals' },
      { label: 'Request access', href: '/site/contact' },
    ],
  },
  {
    slug: 'public-website',
    name: 'This website',
    summary:
      'The site you are reading. Built as our own reference implementation of the web-engineering line: a real 3D product surface, honest capability states, reachable inquiry endpoints and a conversion path that does not fake success.',
    state: 'live',
    kind: 'Own product · the reference build',
    problem:
      'Technology companies describe capability they do not have. The website is where that habit starts, so the most useful thing this site can do is be the counter-example: every capability carries its real state, and every form posts to an endpoint that stores the submission.',
    architecture: [
      'Server components for content and metadata; client components only where interaction requires them',
      'A WebGL orb rendered with raw WebGL2 — no 3D library added to the bundle — with a CSS fallback and a reduced-motion path',
      'Design tokens split three ways: public site, authenticated application, print collateral. Changing one cannot repaint the others',
      'Content as data: the service lines, solutions and projects are single files that pages, sitemap and structured data all render from',
    ],
    implementation: [
      'A 3D hero with context-loss recovery, visibility pause and a static fallback for blocked WebGL',
      'Twelve service pages and twelve solution pages generated from data, with canonical URLs and JSON-LD',
      'An inquiry pipeline that validates, rate-limits, honeypots and persists a CRM lead before reporting success',
      'Honest state badges across capabilities, services and solutions, rendered from the same source as the sitemap',
      'Responsive layouts verified at 390, 768, 1024, 1440 and 1920 px, with no horizontal overflow',
    ],
    surfaces: [
      { label: 'Home', detail: '/' },
      { label: 'Solutions', detail: '/site/solutions' },
      { label: 'Services', detail: '/site/services' },
      { label: 'Projects', detail: '/site/projects' },
    ],
    verified: [
      {
        claim: 'Inquiry submissions are persisted, not simulated',
        basis: 'POST /api/public/contact writes a CRM contact and note, then reports whether the notification email was sent',
      },
      {
        claim: 'Search metadata is generated, not hand-maintained',
        basis: 'Canonical URLs, Open Graph, JSON-LD and the sitemap are built from the same data the pages render',
      },
      {
        claim: 'The site is reachable without WebGL',
        basis: 'A CSS fallback renders when the GL context fails; reduced-motion renders a single frame',
      },
    ],
    notYet: [
      'No customer logos or testimonials — none have been granted in writing.',
      'No self-serve pricing — engagements are scoped, so a public price list would be fiction.',
    ],
    stack: ['Next.js App Router', 'TypeScript', 'React', 'WebGL2', 'Tailwind CSS', 'Prisma'],
    links: [
      { label: 'Web application development', href: '/site/solutions/website-web-application-development' },
      { label: 'How we work', href: '/site/how-we-work' },
    ],
  },
]

/**
 * Candidates the brief asked us to evaluate that are *not* publishable as
 * showcases today. Listed honestly, with the reason — a showcase page that
 * quietly omits the projects you asked about is worse than one that explains.
 */
export const UNPUBLISHED_CANDIDATES = [
  {
    name: 'ALO Education CRM',
    status: 'Not published',
    reason:
      'An education domain exists in the codebase — university, faculty, course, scholarship and intake reference data with supporting routes — but the student, application, offer and counsellor workflow that makes it a CRM is not implemented here. Presenting reference data as a CRM case study would misrepresent it.',
  },
  {
    name: 'ALO English AI',
    status: 'Not verified',
    reason:
      'No implementing module for this product was found in the repository during the audit. Until there is something to point at, it does not appear as work.',
  },
  {
    name: 'Voice contact centre',
    status: 'In development',
    reason:
      'The conversation layer is built and tested, but placing real calls requires a configured telephony provider. It is described on the platform page with its honest state rather than as a delivered product.',
  },
  {
    name: 'Client engagements',
    status: 'Permission required',
    reason:
      'Most of our work is bespoke client systems. Those belong to the client, and a case study is published only with their written approval. Ask us directly and, where permission exists, we will talk you through relevant experience.',
  },
] as const

export function projectBySlug(slug: string): ShowcaseProject | undefined {
  return SHOWCASE_PROJECTS.find((p) => p.slug === slug)
}
