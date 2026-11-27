/**
 * Super Admin Command Center — instruction understanding.
 *
 * The administrator types ordinary language; this module decides *what kind of
 * operation* was asked for, *how risky* it is, and therefore whether it may run
 * immediately or must stop at an approval gate.
 *
 * It is deliberately deterministic — weighted vocabulary, no model call — for
 * three reasons:
 *
 * 1. **A classifier that decides its own risk level must be testable.** "Deploy
 *    the approved changes to production" has to produce the same answer on every
 *    run, in every process, with no provider availability.
 * 2. **Prompt injection must not be able to raise privilege.** The words in the
 *    instruction can select an intent, but they cannot lower the intent's risk:
 *    risk is a property of the intent table, not of the text.
 * 3. **The plan shown to the operator must be the plan that runs.** The steps
 *    here are the steps the dispatcher writes into the persisted run, so what the
 *    administrator reads before approving is literally the work order.
 *
 * This module is client-safe: no `@/lib/db`, no Node built-ins, no environment
 * reads. The panel imports it to preview a plan before submitting.
 */

/** How much damage the operation can do if it goes wrong. */
export type OperatorRisk = 'read' | 'reversible' | 'production' | 'destructive';

/**
 * Whether the platform can actually carry the intent out today.
 *
 * This field is the difference between a command center and a demo: an intent
 * whose tools do not exist yet is still recognised, still planned, and still
 * dispatchable — but it is labelled `not_wired` / `needs_agent` up front so the
 * operator is never told that something ran when nothing could.
 */
export type OperatorCapability =
  /** Every step maps to a module that exists in this repository. */
  | 'wired'
  /** Steps need a tool or credential this deployment may not have (e.g. browser). */
  | 'needs_capability'
  /** Steps need an agent/provider that is not configured in this deployment. */
  | 'needs_agent'
  /** Correctly refused without an approval decision. */
  | 'needs_approval';

export type OperatorIntentId =
  | 'inspect_repository'
  | 'review_website'
  | 'run_tests'
  | 'inspect_agents'
  | 'inspect_capacity'
  | 'configure_provider'
  | 'create_environment'
  | 'deploy_to_staging'
  | 'deploy_to_production'
  | 'rotate_credential'
  | 'migrate_database'
  | 'cross_tenant_access'
  | 'general_task';

export type OperatorAttachmentKind = 'image' | 'video' | 'file' | 'url' | 'repository';

export interface OperatorAttachment {
  kind: OperatorAttachmentKind;
  /** Original filename, URL or repository slug — never file contents. */
  name: string;
  /** Byte size when the browser supplied one. */
  size?: number;
  /** MIME type when the browser supplied one. */
  mimeType?: string;
}

export interface OperatorIntent {
  id: OperatorIntentId;
  label: string;
  /** One sentence a non-engineer can act on. */
  summary: string;
  risk: OperatorRisk;
  capability: OperatorCapability;
  /** Why the capability is limited, in the operator's terms. Empty when `wired`. */
  capabilityNote?: string;
  /** Ordered steps. Each names the module, route or tool that performs it. */
  steps: string[];
  /** Where the proof of completion is written. */
  evidence: string[];
  /** Approval type written to the `Approval` table when the intent is gated. */
  approvalType?: string;
  /** Weighted vocabulary. Higher weight wins ties; specificity breaks them. */
  terms: { weight: number; phrase: string }[];
}

const APPROVAL_TYPES = {
  deploy: 'deployment',
  production: 'deployment',
  rotate: 'shell_command',
  migrate: 'shell_command',
  crossTenant: 'tool_approval',
} as const;

/**
 * The intent table. Order matters only for determinism of equal scores: the
 * earlier entry wins, so the most dangerous intents are listed first and an
 * ambiguous instruction is read in the direction of *more* caution.
 */
export const OPERATOR_INTENTS: readonly OperatorIntent[] = [
  {
    id: 'deploy_to_production',
    label: 'Deploy to production',
    summary: 'Publish an already-verified release to the production environment.',
    risk: 'destructive',
    capability: 'needs_approval',
    capabilityNote:
      'Production deployment is an owner-authorised operation: the run stops at a deployment approval and can only continue once an authorised reviewer approves it.',
    approvalType: APPROVAL_TYPES.production,
    steps: [
      'Resolve the project, environment and release commit.',
      'Verify the release passed CI and the migration gate.',
      'Write a deployment approval with the exact commit, services and rollback.',
      'On approval: deploy through the allowlisted deployment operation.',
      'Verify health after deploy and record the evidence.',
    ],
    evidence: ['Approval row', 'deployment log', 'health-check result'],
    terms: [
      { weight: 60, phrase: 'deploy to production' },
      { weight: 55, phrase: 'production deploy' },
      { weight: 45, phrase: 'release to production' },
      { weight: 40, phrase: 'go live' },
      { weight: 22, phrase: 'production' },
      { weight: 18, phrase: 'deploy' },
      { weight: 18, phrase: 'release' },
    ],
  },
  {
    id: 'migrate_database',
    label: 'Apply a database migration',
    summary: 'Run a schema or data migration against an environment.',
    risk: 'destructive',
    capability: 'needs_approval',
    capabilityNote:
      'Schema and data migrations are never applied by an agent on its own: the run writes the approval with the migration file, the dry-run result and the rollback.',
    approvalType: APPROVAL_TYPES.migrate,
    steps: [
      'Identify the migration files and the ordered set that would run.',
      'Run the migration safety gate (`npm run verify:migrations`).',
      'Write a migration approval including the rollback pair.',
      'On approval: apply, then re-verify schema parity.',
    ],
    evidence: ['Approval row', 'migration gate output', 'schema parity report'],
    terms: [
      { weight: 60, phrase: 'migrate the database' },
      { weight: 55, phrase: 'run the migration' },
      { weight: 50, phrase: 'apply the migration' },
      { weight: 30, phrase: 'migration' },
      { weight: 25, phrase: 'schema change' },
      { weight: 20, phrase: 'prisma migrate' },
    ],
  },
  {
    id: 'rotate_credential',
    label: 'Rotate a credential',
    summary: 'Replace an API key or provider secret.',
    risk: 'destructive',
    capability: 'needs_approval',
    capabilityNote: 'Secret rotation is owner-authorised; the value is never echoed back after it is written.',
    approvalType: APPROVAL_TYPES.rotate,
    steps: [
      'Resolve the provider and the environments that consume the key.',
      'Write a rotation approval naming the provider only — never the value.',
      'On approval: write the new secret through the provider-config service.',
      'Validate the provider connection and record the outcome (no secret in the record).',
    ],
    evidence: ['Approval row', 'provider validation result', 'audit event'],
    terms: [
      { weight: 55, phrase: 'rotate the key' },
      { weight: 50, phrase: 'rotate the secret' },
      { weight: 45, phrase: 'rotate credentials' },
      { weight: 30, phrase: 'rotate' },
      { weight: 24, phrase: 'api key' },
      { weight: 20, phrase: 'credential' },
    ],
  },
  {
    id: 'cross_tenant_access',
    label: 'Inspect another company',
    summary: 'Read data across company boundaries.',
    risk: 'destructive',
    capability: 'needs_approval',
    capabilityNote:
      'Cross-tenant reads require the `system:cross-tenant` allowlist, a written reason and an audit row written *before* the work begins (T-7).',
    approvalType: APPROVAL_TYPES.crossTenant,
    steps: [
      'Confirm the caller holds `system:cross-tenant` (ALO_SYSTEM_OPERATORS).',
      'Record the reason and the target company in the audit log first.',
      'Read the minimum requested rows and report aggregate counts.',
    ],
    evidence: ['audit event (pre-written)', 'aggregate report'],
    terms: [
      { weight: 55, phrase: 'another company' },
      { weight: 50, phrase: "another tenant's" },
      { weight: 45, phrase: 'cross tenant' },
      { weight: 40, phrase: 'all companies' },
      { weight: 35, phrase: 'every tenant' },
      { weight: 20, phrase: 'impersonate' },
    ],
  },
  {
    id: 'deploy_to_staging',
    label: 'Deploy to staging',
    summary: 'Publish a build to a staging environment.',
    risk: 'production',
    capability: 'needs_approval',
    capabilityNote:
      'Staging is a shared environment, so it goes through the same approval gate; only a project-scoped preview may start without one.',
    approvalType: APPROVAL_TYPES.deploy,
    steps: [
      'Resolve project, staging environment and the commit to publish.',
      'Write a deployment approval scoped to staging only.',
      'On approval: deploy and verify the staging URL through the browser check.',
    ],
    evidence: ['Approval row', 'staging URL', 'browser verification'],
    terms: [
      { weight: 50, phrase: 'deploy to staging' },
      { weight: 45, phrase: 'staging deploy' },
      { weight: 35, phrase: 'staging environment' },
      { weight: 25, phrase: 'staging' },
      { weight: 18, phrase: 'preview environment' },
    ],
  },
  {
    id: 'create_environment',
    label: 'Create or configure an environment',
    summary: 'Add an environment or change its configuration.',
    risk: 'reversible',
    capability: 'needs_capability',
    capabilityNote:
      'The configuration store and its version history exist; the host-side apply step needs a deployment agent bound to the target project, which this deployment may not have.',
    steps: [
      'Resolve the project and the environment to create or change.',
      'Validate the requested variable names and values (secrets are write-only).',
      'Write a configuration version so the change can be rolled back.',
      'Apply to the target service only, then run a health check.',
    ],
    evidence: ['configuration version row', 'health-check result'],
    terms: [
      { weight: 45, phrase: 'new staging environment' },
      { weight: 42, phrase: 'create an environment' },
      { weight: 40, phrase: 'add an environment' },
      { weight: 38, phrase: 'environment variable' },
      { weight: 30, phrase: 'environment' },
      { weight: 22, phrase: 'env var' },
      { weight: 22, phrase: 'configuration' },
    ],
  },
  {
    id: 'configure_provider',
    label: 'Configure a provider or key',
    summary: 'Add or update a model/tool provider credential.',
    risk: 'reversible',
    capability: 'wired',
    steps: [
      'Resolve the provider from the AI Gateway provider registry.',
      'Validate the credential against the provider (a boolean, never the value).',
      'Store the credential encrypted with envelope encryption.',
      'Record the rotation history and the validation result.',
    ],
    evidence: ['provider config row', 'validation result'],
    terms: [
      { weight: 45, phrase: 'add the api key' },
      { weight: 42, phrase: 'add an api key' },
      { weight: 40, phrase: 'provider configuration' },
      { weight: 35, phrase: 'add provider' },
      { weight: 30, phrase: 'api provider' },
      { weight: 24, phrase: 'openrouter' },
      { weight: 24, phrase: 'provider' },
    ],
  },
  {
    id: 'inspect_capacity',
    label: 'Inspect host capacity',
    summary: 'Report memory, disk, budgets and pressure for this host.',
    risk: 'read',
    capability: 'wired',
    steps: [
      'Read the capacity plan and the effective service budgets.',
      'Compare them with the running service inventory.',
      'Report headroom against the 10 GB project ceiling and the 40 GB disk reserve.',
    ],
    evidence: ['capacity report', 'audit event'],
    terms: [
      { weight: 40, phrase: 'capacity' },
      { weight: 35, phrase: 'memory usage' },
      { weight: 35, phrase: 'disk usage' },
      { weight: 30, phrase: 'resource usage' },
      { weight: 25, phrase: 'oom' },
      { weight: 22, phrase: 'log rotation' },
    ],
  },
  {
    id: 'inspect_agents',
    label: 'Inspect running agents',
    summary: 'Report which agents are running and what they are doing.',
    risk: 'read',
    capability: 'wired',
    steps: [
      'List active runs for the company with their status and current step.',
      'List registered agents and their availability.',
      'Report pending approvals that are blocking work.',
    ],
    evidence: ['run list', 'agent registry snapshot'],
    terms: [
      { weight: 45, phrase: 'which agents are running' },
      { weight: 42, phrase: 'what are the agents doing' },
      { weight: 40, phrase: 'show me the agents' },
      { weight: 30, phrase: 'running agents' },
      { weight: 25, phrase: 'agent status' },
      { weight: 20, phrase: 'active runs' },
    ],
  },
  {
    id: 'inspect_repository',
    label: 'Review a repository',
    summary: 'Inspect a GitHub repository for security and compatibility.',
    risk: 'read',
    capability: 'needs_capability',
    capabilityNote:
      'Repository metadata and advisories are read through the public GitHub API; source-level review is performed by the run engine once a coding agent is configured.',
    steps: [
      'Resolve owner/repo and read metadata, licence, activity and advisories via the GitHub API.',
      'Fetch the public file listing and lockfile to read the dependency surface.',
      'Compare the capabilities with this repository’s register (no duplicate integration).',
      'Write the assessment: purpose, licence, risk, compatibility, recommendation.',
    ],
    evidence: ['repository assessment', 'advisory list', 'register comparison'],
    terms: [
      { weight: 45, phrase: 'github repository' },
      { weight: 42, phrase: 'review this repo' },
      { weight: 40, phrase: 'inspect the repository' },
      { weight: 35, phrase: 'open source' },
      { weight: 30, phrase: 'github' },
      { weight: 25, phrase: 'repository' },
      { weight: 20, phrase: 'license' },
    ],
  },
  {
    id: 'review_website',
    label: 'Verify a website in a browser',
    summary: 'Open a real page, inspect it and capture evidence.',
    risk: 'read',
    capability: 'needs_capability',
    capabilityNote:
      'The navigation policy, evidence format and route exist; the headless browser itself is only available when Playwright is installed in the deployment (see `/api/super-admin/browser/verify`, which reports `available: false` rather than pretending).',
    steps: [
      'Check the URL against the SSRF policy before any navigation.',
      'Open the page in an isolated browser context.',
      'Capture status, title, console errors, failed requests, links and a screenshot.',
      'Compare the result with the stated objective and report discrepancies.',
    ],
    evidence: ['screenshot', 'console/network log', 'verification verdict'],
    terms: [
      { weight: 45, phrase: 'open the website' },
      { weight: 42, phrase: 'check the page' },
      { weight: 40, phrase: 'inspect the live site' },
      { weight: 35, phrase: 'broken navigation' },
      { weight: 30, phrase: 'browser' },
      { weight: 25, phrase: 'screenshot' },
      { weight: 22, phrase: 'responsive' },
    ],
  },
  {
    id: 'run_tests',
    label: 'Run tests and fix failures',
    summary: 'Execute the test suite and repair what fails.',
    risk: 'reversible',
    capability: 'needs_agent',
    capabilityNote:
      'No shell-capable coding agent is bound in this deployment, so the run records the request, the exact command and the failure as `needs_agent` instead of reporting a pass it cannot produce.',
    steps: [
      'Identify the affected packages and the exact command (`npm run test -- --changed`).',
      'Execute through the coding agent and capture the raw output.',
      'Diagnose failures at the source; never weaken an assertion.',
      'Re-run the failed tests, then the full suite, and attach both logs.',
    ],
    evidence: ['test log', 'diff of the fix', 're-run result'],
    terms: [
      { weight: 50, phrase: 'run the test suite' },
      { weight: 45, phrase: 'run the tests' },
      { weight: 42, phrase: 'fix the failing tests' },
      { weight: 35, phrase: 'tests are failing' },
      { weight: 30, phrase: 'fix the build' },
      { weight: 25, phrase: 'typecheck' },
      { weight: 20, phrase: 'tests' },
    ],
  },
  {
    id: 'general_task',
    label: 'General task',
    summary: 'An objective that does not match a known operational intent.',
    risk: 'read',
    capability: 'wired',
    steps: [
      'Persist the objective and resolve the tenant, project and requester.',
      'Ask the configured agents for a plan and execute it through the run engine.',
      'Report the outcome with the evidence each step produced.',
    ],
    evidence: ['run events', 'final report'],
    terms: [],
  },
];

/** Risk → whether the dispatcher must stop at an approval gate. */
export const RISK_REQUIRES_APPROVAL: Record<OperatorRisk, boolean> = {
  read: false,
  reversible: false,
  production: true,
  destructive: true,
};

const RISK_ORDER: readonly OperatorRisk[] = ['read', 'reversible', 'production', 'destructive'];

/** Higher is more dangerous; used for sorting and for the operator badge. */
export function riskWeight(risk: OperatorRisk): number {
  return RISK_ORDER.indexOf(risk);
}

const INTENT_BY_ID = new Map<OperatorIntentId, OperatorIntent>(
  OPERATOR_INTENTS.map((intent) => [intent.id, intent]),
);

export function getOperatorIntent(id: OperatorIntentId): OperatorIntent {
  const found = INTENT_BY_ID.get(id);
  // Unreachable for a literal id; returning the safe default keeps a widened
  // runtime id (e.g. from a stored plan) from throwing.
  return found ?? INTENT_BY_ID.get('general_task')!;
}

/**
 * Fold text into a padded, word-separated, lower-case haystack.
 *
 * Phrase matching cannot be done on raw text: an instruction that says
 * "review https://github.com/owner/repo" never contains the substring " github "
 * because a URL puts punctuation either side of the word. Normalising both sides
 * through the same function means `github` matches inside a URL and `prod` still
 * does not match `product`.
 */
function normaliseForMatching(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export interface InstructionPlan {
  intent: OperatorIntent;
  /** The matched vocabulary, strongest first — shown to the operator as the "why". */
  matched: { phrase: string; weight: number }[];
  /** 0–100. A score of 0 means nothing matched and the intent is `general_task`. */
  confidence: number;
  risk: OperatorRisk;
  requiresApproval: boolean;
  steps: string[];
  evidence: string[];
  /** Note shown next to the plan when the capability is limited. */
  capabilityNote?: string;
}

/**
 * Classify an instruction.
 *
 * Scoring: each intent sums the weight of every phrase it finds (case- and
 * whitespace-insensitive). The highest total wins. Because the table is ordered
 * from most to least dangerous, a tie resolves toward the more dangerous intent,
 * which is the only safe direction for a tie to break.
 */
export function classifyInstruction(instruction: string): InstructionPlan {
  const haystack = normaliseForMatching(instruction);
  let best: { intent: OperatorIntent; score: number; matched: { phrase: string; weight: number }[] } | null = null;

  for (const intent of OPERATOR_INTENTS) {
    if (intent.terms.length === 0) continue;
    let score = 0;
    const matched: { phrase: string; weight: number }[] = [];
    for (const term of intent.terms) {
      if (!haystack.includes(` ${normaliseForMatching(term.phrase).trim()} `)) continue;
      // Guard against double counting a phrase that is a substring of a longer
      // matched phrase from the same intent ("deploy" inside "deploy to staging").
      if (matched.some((entry) => entry.phrase.includes(term.phrase))) continue;
      score += term.weight;
      matched.push({ phrase: term.phrase, weight: term.weight });
    }
    if (score === 0) continue;
    matched.sort((a, b) => b.weight - a.weight);
    // Strict `>` keeps the table order as the tie-break (dangerous first).
    if (!best || score > best.score) best = { intent, score, matched };
  }

  const intent = best?.intent ?? getOperatorIntent('general_task');
  const matched = best?.matched ?? [];
  const requiresApproval = RISK_REQUIRES_APPROVAL[intent.risk];

  return {
    intent,
    matched,
    // Saturating scale: 45 points already means "certain", because a single
    // unambiguous multi-word phrase is worth at least that much.
    confidence: Math.min(100, matched.reduce((sum, entry) => sum + entry.weight, 0)),
    risk: intent.risk,
    // A recognised intent is authoritative; an unmatched instruction still
    // requires approval if the words imply a gated operation (see below).
    requiresApproval: requiresApproval || impliesGatedOperation(haystack),
    steps: intent.steps,
    evidence: intent.evidence,
    ...(intent.capabilityNote ? { capabilityNote: intent.capabilityNote } : {}),
  };
}

/**
 * Second, independent safety net.
 *
 * Even when the vocabulary does not match a specific intent, an instruction that
 * mentions a gated operation must not run unattended. This is intentionally
 * narrow: it only ever *adds* an approval, never removes one.
 */
const GATED_VOCABULARY = [
  'production',
  'prod server',
  'prod box',
  'live server',
  'drop table',
  'delete from',
  'truncate',
  'rotate',
  'secret',
  'ssh',
  'sudo',
  'rm rf',
  'force push',
  'dns',
];

export function impliesGatedOperation(instruction: string): boolean {
  const text = normaliseForMatching(instruction);
  return GATED_VOCABULARY.some((needle) => text.includes(` ${needle} `));
}

/** Presentation metadata for the panel. Kept here so UI and API cannot drift. */
export const RISK_META: Record<OperatorRisk, { label: string; meaning: string; tone: 'green' | 'blue' | 'amber' | 'rose' }> = {
  read: { label: 'Read only', meaning: 'Inspects state; changes nothing.', tone: 'green' },
  reversible: { label: 'Reversible', meaning: 'Writes can be undone from a recorded version.', tone: 'blue' },
  production: { label: 'Shared environment', meaning: 'Affects a shared environment; approval required.', tone: 'amber' },
  destructive: { label: 'Destructive / production', meaning: 'Irreversible or owner-gated; approval required.', tone: 'rose' },
};

export const CAPABILITY_META: Record<OperatorCapability, { label: string; tone: 'green' | 'amber' | 'rose' }> = {
  wired: { label: 'Wired', tone: 'green' },
  needs_capability: { label: 'Needs a capability', tone: 'amber' },
  needs_agent: { label: 'Needs a configured agent', tone: 'amber' },
  needs_approval: { label: 'Approval required', tone: 'rose' },
};

/**
 * Classify what an attachment is. The browser sends a name and a MIME type; no
 * file content crosses this boundary, because the run engine fetches content by
 * reference and the panel never holds customer bytes in memory.
 */
export function classifyAttachment(input: { name: string; mimeType?: string }): OperatorAttachmentKind {
  const name = input.name.toLowerCase();
  const mime = (input.mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|svg)$/.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(name)) return 'video';
  if (/^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/.test(name)) return 'repository';
  if (/^https?:\/\//.test(name)) return 'url';
  return 'file';
}

/** Human summary of the attached material, used in the plan preview. */
export function summariseAttachments(attachments: readonly OperatorAttachment[]): string {
  if (attachments.length === 0) return 'No attachments';
  const counts = attachments.reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([kind, count]) => `${count} ${kind}${count === 1 ? '' : 's'}`)
    .join(' · ');
}
