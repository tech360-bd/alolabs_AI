/**
 * Stack register — the human and agent view of every upstream link we were sent.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Two catalogues already exist in this repository and neither was reachable by a
 * person:
 *
 *   1. `src/lib/link-coverage/registry.ts` — 88 upstream links, each with a
 *      verdict (implemented / in_kind / reference / gap / not_applicable), the
 *      files that prove the claim, and the next step for every gap.
 *   2. `src/lib/integrations/registry.ts` — 26 external-system adapters, each
 *      with a licence class and an integration strategy (REUSE /
 *      API_INTEGRATE / LEARN).
 *
 * `GET /api/integrations/catalog` exposed (2) to machines and nothing rendered
 * it; (1) was only read by a super-admin panel and a test. This module joins the
 * two into one ranked, filterable view — plus a short *agent brief* per system,
 * which is the part that turns a catalogue into usable knowledge.
 *
 * HARD CONSTRAINTS
 * ----------------
 *  · No Node APIs and no `@/lib/db` import here: this module is imported by the
 *    public `/site/stack` page **and** its client explorer. Anything that needs
 *    Prisma (the adapter registry does) is injected by a server-only caller.
 *  · Nothing is enabled by being listed. A row is a statement about this
 *    repository, not a promise that the upstream system is running.
 */

import { LINK_COVERAGE } from '@/lib/link-coverage/registry';
import type { CoverageEntry, CoverageVerdict } from '@/lib/link-coverage/types';

// ─── Verdicts ────────────────────────────────────────────────────────────────

export interface VerdictMeta {
  /** Short label rendered on the badge. */
  label: string
  /** One sentence a reader needs to interpret the badge correctly. */
  meaning: string
  /** Tailwind tone keys used by both the light site page and the dark panel. */
  tone: 'green' | 'blue' | 'slate' | 'amber' | 'rose'
}

export const VERDICT_META: Record<CoverageVerdict, VerdictMeta> = {
  implemented: {
    label: 'Implemented',
    meaning: 'The capability exists here and is exercised by code or tests — an adapter, a route or a first-party subsystem.',
    tone: 'green',
  },
  in_kind: {
    label: 'In kind',
    meaning: 'An equivalent subsystem already exists here, built first-party. Upstream code was not copied.',
    tone: 'blue',
  },
  reference: {
    label: 'Reference',
    meaning: 'Useful as a design or feature reference only. Porting it would duplicate something we already own.',
    tone: 'slate',
  },
  gap: {
    label: 'Gap',
    meaning: 'Concrete and implementable, but not built yet. The next step is written down, not implied.',
    tone: 'amber',
  },
  not_applicable: {
    label: 'Not applicable',
    meaning: 'Nothing to integrate: an account listing, content, hardware or a licence we cannot use.',
    tone: 'rose',
  },
}

/** Verdict order for lists: what works first, what is missing next. */
export const VERDICT_ORDER: CoverageVerdict[] = ['implemented', 'in_kind', 'reference', 'gap', 'not_applicable'];

// ─── Pillars ─────────────────────────────────────────────────────────────────

export interface StackPillar {
  id: string
  label: string
  blurb: string
}

export const STACK_PILLARS: StackPillar[] = [
  { id: 'models', label: 'Models & gateways', blurb: 'Inference backends, routers, providers and the model catalogue.' },
  { id: 'agents', label: 'Agents & coding', blurb: 'Agent runtimes, coding assistants and the tool loop.' },
  { id: 'automation', label: 'Automation & data', blurb: 'Workflow builders, durable execution, data platforms and CRMs.' },
  { id: 'voice', label: 'Voice & messaging', blurb: 'Telephony, SMS, WhatsApp and speech engines.' },
  { id: 'media', label: 'Media & creation', blurb: 'Video, avatars, transcription and content generation.' },
  { id: 'ops', label: 'Ops & delivery', blurb: 'Deployment, monitoring, backups and the deployment pipeline.' },
  { id: 'research', label: 'Research & learning', blurb: 'Reference material, datasets and educational surfaces.' },
  { id: 'applied', label: 'Applied & other', blurb: 'Domain-specific links that map to one product surface each.' },
]

/** Category → pillar. Unknown categories fall through to `applied`, never dropped. */
const CATEGORY_PILLAR: Record<string, string> = {
  'AI & models': 'models',
  'Developer tooling': 'agents',
  'Business operations': 'automation',
  'Voice, calls & SMS': 'voice',
  'Chat & messaging': 'voice',
  'Media & creation': 'media',
  'Monitoring & ops': 'ops',
  'Design systems': 'ops',
  'Research & science': 'research',
  Education: 'research',
  'Reference & content': 'research',
  'Social & publishing': 'media',
};

export function pillarOf(entry: Pick<CoverageEntry, 'category'>): StackPillar {
  const id = CATEGORY_PILLAR[entry.category] ?? 'applied';
  return STACK_PILLARS.find((pillar) => pillar.id === id) ?? STACK_PILLARS[STACK_PILLARS.length - 1];
}

// ─── Display names ───────────────────────────────────────────────────────────

/**
 * Curated names for rows where the URL alone is ambiguous (`/orgs/...`, a bare
 * account). Anything not listed falls back to a readable derivation from the
 * URL, so a new registry row renders sensibly without touching this map.
 */
const CURATED_NAMES: Record<string, string> = {
  'anomalyco-browse': 'Browse (browser MCP)',
  'ai-native-callcenter': 'AI-Native Call Center',
  'activepieces': 'Activepieces',
  'aider-org': 'Aider',
  'aider': 'Aider',
  'directus': 'Directus',
  'floppydata-cloud-browser': 'FloppyData Cloud Browser',
  'free-for-dev-mirror': 'free-for.dev (mirror)',
  'free-for-dev-site': 'free-for.dev',
  'free-for-dev-upstream': 'free-for.dev (upstream)',
  'librechat-org': 'LibreChat',
  'litellm-org': 'LiteLLM (BerriAI)',
  'monid': 'Monid',
  'monid-tools': 'Monid Tools directory',
  'nocobase': 'NocoBase',
  'open-webui-org': 'Open WebUI',
  'postman': 'Postman',
  'signudoc': 'SignuDoc',
  'temporalio': 'Temporal',
  'vllm': 'vLLM',
  'vllm-project-org': 'vLLM (organisation)',
  'youbtech01': 'YouBTech01 (account)',
  'minecraft': 'Minecraft',
};

export function displayName(entry: Pick<CoverageEntry, 'id' | 'url'>): string {
  const curated = CURATED_NAMES[entry.id];
  if (curated) return curated;
  const cleaned = entry.url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  const parts = cleaned.split('/').filter((part) => part && part !== 'orgs' && part !== 'repositories');
  if (cleaned.startsWith('github.com/') && parts.length >= 2) {
    const [owner, repo] = parts.slice(1);
    return repo && repo !== owner ? repo : owner;
  }
  return parts[0] ?? cleaned;
}

// ─── Agent briefs ────────────────────────────────────────────────────────────

/**
 * What an agent (or a new maintainer) needs before touching this system.
 *
 * `useWhen` is the trigger, `steps` is the safe happy path, `risks` is what has
 * actually gone wrong in this repository or is legally load-bearing. These are
 * deliberately short: a brief that repeats the claim is noise.
 */
export interface StackBrief {
  useWhen: string
  steps: string[]
  risks: string[]
}

export const STACK_BRIEFS: Record<string, StackBrief> = {
  'litellm-org': {
    useWhen: 'A customer already runs LiteLLM, or one gateway should front many providers with unified spend limits.',
    steps: [
      'Register credentials through ONE Runtime (`/api/integrations` → `gateway.litellm`) with the tenant’s companyId.',
      'Call `testConnection` before enabling: it lists models without mutating the proxy.',
      'Map returned model names onto the model registry so capability routing still filters ineligible models.',
    ],
    risks: [
      'Enterprise-only LiteLLM features are separately licensed — do not assume MIT covers them.',
      'A proxy hides provider errors; keep the fallback event trail so failures stay attributable.',
    ],
  },
  'signudoc': {
    useWhen: 'A deliverable, invoice or contract needs a legally defensible signature rather than a click-to-accept.',
    steps: [
      'Model the artefact first: `DocumentSignature` (documentId, signerId, companyId, sha256, signedAt, ip).',
      'Store the document hash *before* sending it for signature, and re-hash on receipt.',
      'Implement the adapter against a self-hosted SignuDoc instance; register it under ONE Runtime.',
    ],
    risks: [
      'Evidence requirements differ per jurisdiction (eIDAS / ESIGN); get legal sign-off before selling it.',
      'A signature row without the hash is decoration — verification must fail on a tampered document.',
    ],
  },
  'floppydata-cloud-browser': {
    useWhen: 'An agent task needs a real browser session (SPA login, canvas, file download) that HTTP fetch cannot do.',
    steps: [
      'Open an isolated session per run; never share cookies across tenants.',
      'Record every navigation and screenshot as run artefacts so a human can audit the action.',
      'Gate credentialed flows behind the approval engine before the first navigation.',
    ],
    risks: [
      'Browser sessions are the highest-risk tool in the system: SSRF and credential exfiltration both become reachable.',
      'A hosted provider sees your content — check data-residency terms before pointing it at customer data.',
    ],
  },
  'temporalio': {
    useWhen: 'You need durable execution semantics beyond what the native run engine already provides.',
    steps: [
      'Read `src/lib/runs/index.ts` first: checkpoint, retry, cancel and crash recovery already exist and are tested.',
      'Only introduce Temporal if you need cross-process, long-running timers with its own visibility store.',
      'The `automation.temporal` adapter is for reading an existing cluster, not for migrating work into it.',
    ],
    risks: [
      'Two orchestration engines in one deployment is the failure mode this repository explicitly avoids.',
      'Temporal’s MIT licence covers the server; managed Temporal Cloud is a paid service.',
    ],
  },
  'activepieces': {
    useWhen: 'A tenant wants to attach their own automation builder rather than author workflows in the platform.',
    steps: [
      'Register the tenant’s Activepieces base URL + API key under `automation.activepieces`.',
      'List flows to confirm connectivity; execution stays inside Activepieces.',
      'Mirror only the flow *identifiers* into the platform so audit trails remain joinable.',
    ],
    risks: [
      'Activepieces pieces run arbitrary third-party code — do not treat a flow as a sandboxed tool.',
      'Webhook callbacks must be signature-verified or they become an injection path.',
    ],
  },
  'nocobase': {
    useWhen: 'A customer keeps internal tools in NocoBase and wants agent reads against those collections.',
    steps: [
      'Register with an API token scoped to the collections the tenant consents to.',
      'List collections first, then read; there is no write path wired today.',
      'Keep the AGPL boundary intact: talk HTTP, never import NocoBase code.',
    ],
    risks: [
      'AGPL-3.0 core with commercial plugins — vendoring it would change this repository’s licence obligations.',
      'Collection schemas drift; a cached field list will silently return undefined.',
    ],
  },
  'directus': {
    useWhen: 'Content lives in a Directus instance that must stay the system of record.',
    steps: [
      'Register the Directus URL and a read-scoped token under `content.directus`.',
      'Read items through the adapter so licence and tenant scoping stay in one place.',
      'Keep the Prisma schema authoritative for platform data; Directus is a side-car.',
    ],
    risks: [
      'Source-available (BSL-style) licence: check the revenue threshold before embedding it in a product.',
      'Two admin surfaces for the same records is a support burden — pick one owner per collection.',
    ],
  },
  'aider-org': {
    useWhen: 'An agent must propose code edits to a repository as reviewable diffs.',
    steps: [
      'Use `aiderFormatHunks` / `aiderParseHunks` so edits are expressed as hunks, not whole-file rewrites.',
      'Route the diff through the approval engine before anything is written.',
      'Keep the repository workspace disposable per run; never run it against the deployment checkout.',
    ],
    risks: [
      'REUSE strategy: copied code needs attribution; do not blend Aider source into proprietary modules.',
      'A model-produced diff that applies cleanly can still be wrong — the test suite is the gate, not the diff.',
    ],
  },
  'librechat-org': {
    useWhen: 'A team already uses LibreChat and wants the platform to see the same model list.',
    steps: [
      'Register the LibreChat base URL and key under `ai-chat.librechat`.',
      'List models to validate connectivity; conversations are not imported.',
      'Where the platform needs chat itself, use `/platform/chat` so tenancy and usage metering apply.',
    ],
    risks: [
      'Model lists say nothing about reachability — probe health before routing traffic.',
      'Duplicating conversation history across two UIs creates a data-retention question nobody owns.',
    ],
  },
  'open-webui-org': {
    useWhen: 'Open WebUI is the operator’s front end for local Ollama/vLLM backends.',
    steps: [
      'Register the instance URL and key under `ai-chat.open-webui`.',
      'Treat its model list as advisory; the model registry decides what is selectable.',
      'Keep branding intact — the licence restricts removing it.',
    ],
    risks: [
      'Source-available licence with a branding clause: do not rebrand or redistribute the frontend.',
      'Open WebUI proxies model calls; usage metering must stay on our side or spend becomes invisible.',
    ],
  },
  'free-for-dev-upstream': {
    useWhen: 'Choosing a free tier for a capability this product actually implements.',
    steps: [
      'Check `src/lib/free-resources.ts` first — it is the curated subset, not the whole list.',
      'Open the row’s `verifyUrl` and re-read the vendor terms before relying on the allowance.',
      'Enable it through env config or `AIProviderConfig`; nothing is enabled by being listed.',
    ],
    risks: [
      'Free allowances change without notice; a quoted number is a dated observation, not a contract.',
      '“No licence file” upstream means the list itself has no reuse grant — cite, do not copy wholesale.',
    ],
  },
  'postman': {
    useWhen: 'An integrator or customer needs to call the platform API from Postman or generate a client.',
    steps: [
      'Start from the zod request schemas in the route you care about (they are the contract).',
      'Read `scripts/classify-routes.mjs` output to see which routes are public vs authenticated.',
      'Generate the OpenAPI document first, then export the collection from it — never hand-maintain both.',
    ],
    risks: [
      'A hand-written collection drifts from the routes within a sprint; generate it in CI or skip it.',
      'Never publish a collection containing example tokens or tenant ids.',
    ],
  },
  'monid': {
    useWhen: 'Browsing for a tool to adopt, and you need to know whether the platform already covers it.',
    steps: [
      'Check this register first: the capability may already be implemented or in kind.',
      'If it is genuinely new, add a `LINK_COVERAGE` row with evidence files before writing an adapter.',
      'Only then write the adapter and register it under ONE Runtime.',
    ],
    risks: [
      'Directories go stale; a tool listed there may be unmaintained or licence-incompatible.',
      'Adding a catalogue entry is not the same as integrating — do not let the list imply support.',
    ],
  },
  'vllm': {
    useWhen: 'A GPU host is available and throughput per token matters more than deployment simplicity.',
    steps: [
      'Deploy vLLM as an OpenAI-compatible server on the GPU host, pinned by version.',
      'Point the OpenAI-compatible provider at it and declare the model’s capabilities honestly.',
      'Run a live contract test (chat + streaming) before routing production traffic.',
    ],
    risks: [
      'No GPU here: the bundled compose runs Ollama, so vLLM is a documented option, not a deployed service.',
      'Capability metadata that overstates the model sends vision or long-context work to a backend that will fail.',
    ],
  },
};

/**
 * Search synonyms per row.
 *
 * The placeholder tells a reader they can type "e-signature", but the registry
 * describes SignuDoc as "electronic signature" — so a literal substring search
 * would fail on the exact example the UI suggests. These keywords are the terms
 * people (and agents) actually use, kept separate from the claim so the prose
 * never has to be written for a search engine.
 */
export const STACK_KEYWORDS: Record<string, string[]> = {
  signudoc: ['e-signature', 'esign', 'electronic signature', 'document signing', 'contracts'],
  'floppydata-cloud-browser': ['browser', 'cloud browser', 'cdp', 'headless', 'automation session'],
  postman: ['openapi', 'swagger', 'collection', 'api client', 'sdk generation'],
  'litellm-org': ['gateway', 'proxy', 'router', 'provider aggregator'],
  temporalio: ['durable execution', 'workflow engine', 'saga', 'cron'],
  activepieces: ['automation', 'zapier', 'flows', 'no-code'],
  nocobase: ['no-code', 'internal tools', 'data platform', 'crud'],
  directus: ['cms', 'headless', 'data platform', 'admin'],
  'aider-org': ['coding agent', 'pair programming', 'code edit', 'diffs'],
  'librechat-org': ['chat ui', 'chatgpt alternative', 'multi-provider chat'],
  'open-webui-org': ['ollama ui', 'self-hosted chat', 'chat interface'],
  'free-for-dev-upstream': ['free tier', 'free hosting', 'free credits'],
  monid: ['directory', 'tool list', 'marketplace'],
  'monid-tools': ['directory', 'tool list', 'marketplace'],
  vllm: ['inference server', 'gpu', 'throughput', 'openai-compatible server'],
  youbtech01: ['account', 'unknown repository'],
};

// ─── View model ──────────────────────────────────────────────────────────────

/** Minimal adapter shape injected by a server caller (see `adapters.ts`). */
export interface StackAdapter {
  id: string
  category: string
  strategy: string
  licenseClass: string
  description: string
  upstreamRepo: string
}

export interface StackEntryView {
  id: string
  name: string
  url: string
  kind: CoverageEntry['kind']
  category: string
  pillar: { id: string; label: string }
  upstream: string
  verdict: CoverageVerdict
  claim: string
  gap?: string
  evidence: CoverageEntry['evidence']
  checkedAt?: string
  stars?: number
  language?: string
  archived?: boolean
  /** Matched adapter, when one exists for this row. */
  adapter?: Pick<StackAdapter, 'id' | 'strategy' | 'licenseClass'>
  /** Search synonyms (see `STACK_KEYWORDS`) — never rendered as prose. */
  keywords?: string[]
  brief?: StackBrief
}

export interface StackStats {
  links: number
  implemented: number
  inKind: number
  reference: number
  gap: number
  notApplicable: number
  evidencePaths: number
  adapters: number
  briefs: number
}

export interface StackPillarSummary extends StackPillar {
  total: number
  gaps: number
  implemented: number
}

export interface StackReport {
  updatedAt: string
  stats: StackStats
  pillars: StackPillarSummary[]
  entries: StackEntryView[]
  verdicts: { id: CoverageVerdict; label: string; meaning: string; tone: VerdictMeta['tone']; count: number }[]
  notice: string
}

/**
 * Entry → adapter id. Explicit rather than heuristic: the adapter registry
 * identifies upstreams as `owner/repo`, while a link may be an organisation
 * page, a bare account or a hosted SaaS URL. A guess would silently mislabel.
 */
export const ENTRY_ADAPTER: Record<string, string> = {
  'litellm-org': 'gateway.litellm',
  'nocobase': 'automation.nocobase',
  'temporalio': 'automation.temporal',
  'activepieces': 'automation.activepieces',
  'directus': 'content.directus',
  'aider-org': 'coding-agent.aider',
  'librechat-org': 'ai-chat.librechat',
  'open-webui-org': 'ai-chat.open-webui',
};

export const STACK_UPDATED_AT = '2026-11-27';

export interface BuildStackOptions {
  /** Adapters from `integrationRegistry.catalog()`; omitted on the public page. */
  adapters?: StackAdapter[]
  entries?: readonly CoverageEntry[]
}

export function buildStack({ adapters = [], entries = LINK_COVERAGE }: BuildStackOptions = {}): StackReport {
  const adapterById = new Map(adapters.map((adapter) => [adapter.id, adapter]));

  const views: StackEntryView[] = entries.map((entry) => {
    const pillar = pillarOf(entry);
    const adapterId = ENTRY_ADAPTER[entry.id];
    const adapter = adapterId ? adapterById.get(adapterId) : undefined;
    const view: StackEntryView = {
      id: entry.id,
      name: displayName(entry),
      url: entry.url,
      kind: entry.kind,
      category: entry.category,
      pillar: { id: pillar.id, label: pillar.label },
      upstream: entry.upstream,
      verdict: entry.verdict,
      claim: entry.claim,
      evidence: entry.evidence,
      ...(entry.gap ? { gap: entry.gap } : {}),
      ...(entry.upstreamMeta?.checkedAt ? { checkedAt: entry.upstreamMeta.checkedAt } : {}),
      ...(entry.upstreamMeta?.stars !== undefined ? { stars: entry.upstreamMeta.stars } : {}),
      ...(entry.upstreamMeta?.language ? { language: entry.upstreamMeta.language } : {}),
      ...(entry.upstreamMeta?.archived !== undefined ? { archived: entry.upstreamMeta.archived } : {}),
      ...(adapter
        ? { adapter: { id: adapter.id, strategy: adapter.strategy, licenseClass: adapter.licenseClass } }
        : {}),
      ...(STACK_BRIEFS[entry.id] ? { brief: STACK_BRIEFS[entry.id] } : {}),
      ...(STACK_KEYWORDS[entry.id] ? { keywords: STACK_KEYWORDS[entry.id] } : {}),
    };
    return view;
  });

  const byVerdict = (verdict: CoverageVerdict) => views.filter((view) => view.verdict === verdict).length;

  const stats: StackStats = {
    links: views.length,
    implemented: byVerdict('implemented'),
    inKind: byVerdict('in_kind'),
    reference: byVerdict('reference'),
    gap: byVerdict('gap'),
    notApplicable: byVerdict('not_applicable'),
    evidencePaths: views.reduce((total, view) => total + view.evidence.length, 0),
    adapters: adapters.length,
    briefs: views.filter((view) => view.brief).length,
  };

  const pillars: StackPillarSummary[] = STACK_PILLARS.map((pillar) => {
    const inPillar = views.filter((view) => view.pillar.id === pillar.id);
    return {
      ...pillar,
      total: inPillar.length,
      gaps: inPillar.filter((view) => view.verdict === 'gap').length,
      implemented: inPillar.filter((view) => view.verdict === 'implemented').length,
    };
  }).filter((pillar) => pillar.total > 0);

  return {
    updatedAt: STACK_UPDATED_AT,
    stats,
    pillars,
    entries: views,
    verdicts: VERDICT_ORDER.map((verdict) => ({
      id: verdict,
      label: VERDICT_META[verdict].label,
      meaning: VERDICT_META[verdict].meaning,
      tone: VERDICT_META[verdict].tone,
      count: byVerdict(verdict),
    })),
    notice:
      'A verdict describes this repository, not an upstream deployment. Listing a system here enables nothing: credentials are per tenant, and every adapter call is tenant-scoped and audited.',
  };
}

export interface StackFilter {
  q?: string
  verdict?: CoverageVerdict | 'all'
  pillar?: string | 'all'
}

/** Case-insensitive search across name, upstream, claim, gap, category and url. */
export function filterStack(entries: StackEntryView[], filter: StackFilter = {}): StackEntryView[] {
  const q = (filter.q ?? '').trim().toLowerCase();
  const verdict = filter.verdict ?? 'all';
  const pillar = filter.pillar ?? 'all';

  return entries.filter((entry) => {
    if (verdict !== 'all' && entry.verdict !== verdict) return false;
    if (pillar !== 'all' && entry.pillar.id !== pillar) return false;
    if (!q) return true;
    const haystack = [entry.name, entry.upstream, entry.claim, entry.gap ?? '', entry.category, entry.url, ...(entry.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    // "e signature" and "e-signature" are the same intent; normalise before the
    // substring test so the placeholder's own example actually matches.
    return haystack.includes(q) || haystack.includes(q.replace(/-/g, ' '));
  });
}

/** Entries an operator should look at next: gaps with a written next step, most concrete first. */
export function gapQueue(entries: StackEntryView[]): StackEntryView[] {
  return entries
    .filter((entry) => entry.verdict === 'gap' && entry.gap)
    .sort((a, b) => (b.brief ? 1 : 0) - (a.brief ? 1 : 0) || a.name.localeCompare(b.name));
}

export function findStackEntry(id: string, entries: StackEntryView[]): StackEntryView | undefined {
  return entries.find((entry) => entry.id === id);
}
