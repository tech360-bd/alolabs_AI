/**
 * Semantic patterns (upstream `semantic-patterns.md`).
 *
 * Semantic patterns describe **what a system does**; the 45 visual types
 * describe **how information is arranged**. Each of the nine named patterns is
 * encoded here as routing metadata plus a worked template spec on its nearest
 * visual type, so the studio can show the pattern and the engine draws it with
 * the ordinary layout grammar. One primary pattern per figure; the selected
 * type still owns page axis, connector grammar, spacing and type limits.
 */

import type { DiagramKind } from './tokens'
import type { DiagramSpec } from './spec'

export interface SemanticPattern {
  id: string
  name: string
  /** The routing-table row: what the reader must understand. */
  routing: string
  /** Selection triggers. */
  triggers: string
  /** Required primitives — the pieces the figure must carry. */
  requiredPrimitives: string[]
  budget: string
  antiPatterns: string[]
  staticFallback: string
  nearestKind: DiagramKind
  /** When to reach for a different visual type instead. */
  alternatives?: string
  /** Worked template on the nearest visual type. */
  template: DiagramSpec
}

// ─── Templates ───────────────────────────────────────────────────────────────

const FAN_IN_QUEUE: DiagramSpec = {
  slug: 'pattern-fan-in-queue',
  kind: 'data-flow',
  title: 'Many arrivals, one reviewer',
  desc: 'Four producer cohorts compete for one triage service with three queue slots; admitted work proceeds and overflow is deferred.',
  eyebrow: 'SEMANTIC PATTERN · FAN-IN QUEUE / BOTTLENECK',
  direction: 'horizontal',
  size: { w: 960, h: 520 },
  nodes: [
    { id: 'web', name: 'Web intake', sublabel: '4/hour', kind: 'input' },
    { id: 'email', name: 'Email intake', sublabel: '3/hour', kind: 'input' },
    { id: 'api', name: 'API intake', sublabel: '2/hour', kind: 'input' },
    { id: 'partner', name: 'Partner feed', sublabel: '1/hour', kind: 'input' },
    { id: 'queue', name: 'Triage queue', sublabel: '3 slots · FIFO', kind: 'store' },
    { id: 'triage', name: 'Triage desk', sublabel: '8/hour capacity', kind: 'focal' },
    { id: 'admitted', name: 'Admitted', sublabel: 'scheduled', kind: 'backend' },
    { id: 'deferred', name: 'Deferred', sublabel: 'returned to sender', kind: 'optional' },
  ],
  links: [
    { from: 'web', to: 'queue' },
    { from: 'email', to: 'queue' },
    { from: 'api', to: 'queue' },
    { from: 'partner', to: 'queue' },
    { from: 'queue', to: 'triage', label: 'next' },
    { from: 'triage', to: 'admitted', label: 'admit' },
    { from: 'triage', to: 'deferred', label: 'defer', dashed: true },
  ],
}

const STAGE_FRAMEWORK: DiagramSpec = {
  slug: 'pattern-stage-framework',
  kind: 'process',
  title: 'One question set, every stage',
  desc: 'The same question, input, and output slots repeat across three onboarding stages so the stages stay comparable.',
  eyebrow: 'SEMANTIC PATTERN · STAGE FRAMEWORK WITH SLOTS',
  direction: 'horizontal',
  size: { w: 1000, h: 480 },
  nodes: [
    { id: 's1q', name: 'What do they need?', sublabel: 'QUESTION', kind: 'input', col: 0, row: 0 },
    { id: 's1i', name: 'Passport scan', sublabel: 'INPUT', kind: 'store', col: 0, row: 1 },
    { id: 's1o', name: 'Eligibility record', sublabel: 'OUTPUT', kind: 'backend', col: 0, row: 2 },
    { id: 's2q', name: 'Who approves?', sublabel: 'QUESTION', kind: 'input', col: 1, row: 0 },
    { id: 's2i', name: 'Eligibility record', sublabel: 'INPUT', kind: 'store', col: 1, row: 1 },
    { id: 's2o', name: 'Offer letter', sublabel: 'OUTPUT', kind: 'backend', col: 1, row: 2 },
    { id: 's3q', name: 'When do they start?', sublabel: 'QUESTION', kind: 'input', col: 2, row: 0 },
    { id: 's3i', name: 'Offer letter', sublabel: 'INPUT', kind: 'store', col: 2, row: 1 },
    { id: 's3o', name: 'Start-date plan', sublabel: 'OUTPUT', kind: 'focal', col: 2, row: 2 },
  ],
  links: [
    { from: 's1q', to: 's1i' },
    { from: 's1i', to: 's1o' },
    { from: 's1o', to: 's2q', label: 'handoff' },
    { from: 's2q', to: 's2i' },
    { from: 's2i', to: 's2o' },
    { from: 's2o', to: 's3q', label: 'handoff' },
    { from: 's3q', to: 's3i' },
    { from: 's3i', to: 's3o' },
  ],
}

const STRUCTURED_ARTIFACT: DiagramSpec = {
  slug: 'pattern-structured-artifact',
  kind: 'data-flow',
  title: 'A rambling request becomes a durable brief',
  desc: 'An unstructured message is clarified, its fields extracted with provenance, and written into a versioned brief that records what is still unknown.',
  eyebrow: 'SEMANTIC PATTERN · UNSTRUCTURED INPUT → STRUCTURED ARTIFACT',
  direction: 'horizontal',
  size: { w: 900, h: 480 },
  nodes: [
    { id: 'utterance', name: '“It keeps failing…”', sublabel: 'SOURCE UTTERANCE', kind: 'input' },
    { id: 'clarify', name: 'Clarifying questions', sublabel: '2 exchanges', kind: 'backend' },
    { id: 'extract', name: 'Field extraction', sublabel: 'named transformation', kind: 'focal' },
    { id: 'artifact', name: 'Incident brief v1', sublabel: 'DURABLE ARTIFACT', kind: 'store' },
    { id: 'unknown', name: 'Unknown fields', sublabel: 'owner: —', kind: 'optional' },
  ],
  links: [
    { from: 'utterance', to: 'clarify' },
    { from: 'clarify', to: 'extract', label: 'quotes' },
    { from: 'utterance', to: 'extract', label: 'provenance', dashed: true },
    { from: 'extract', to: 'artifact', label: 'writes' },
    { from: 'extract', to: 'unknown', label: 'missing', dashed: true },
  ],
}

const PAIRED_TRACES: DiagramSpec = {
  slug: 'pattern-paired-traces',
  kind: 'flowchart',
  title: 'Two requests, one first divergence',
  desc: 'Rule-by-rule evaluation of two similar requests, with the first divergence at the limit rule and downstream rules marked not reached.',
  eyebrow: 'SEMANTIC PATTERN · PAIRED POLICY-EVALUATION TRACES',
  direction: 'horizontal',
  size: { w: 920, h: 560 },
  callouts: [{ text: 'the traces first diverge at the limit rule', at: 'top-right' }],
  nodes: [
    { id: 'a1', name: 'Rule 1 · identity', sublabel: 'PASS', kind: 'plain', col: 0, row: 0 },
    { id: 'a2', name: 'Rule 2 · limit', sublabel: 'PASS', kind: 'plain', col: 1, row: 0 },
    { id: 'a3', name: 'Rule 3 · sanctions', sublabel: 'NOT REACHED', kind: 'optional', col: 2, row: 0 },
    { id: 'a4', name: 'Allowed', sublabel: 'TRACE A OUTCOME', kind: 'backend', col: 3, row: 0 },
    { id: 'b1', name: 'Rule 1 · identity', sublabel: 'PASS', kind: 'plain', col: 0, row: 1 },
    { id: 'b2', name: 'Rule 2 · limit', sublabel: 'FAIL', kind: 'focal', col: 1, row: 1 },
    { id: 'b3', name: 'Rule 3 · sanctions', sublabel: 'SKIPPED', kind: 'optional', col: 2, row: 1 },
    { id: 'b4', name: 'Denied', sublabel: 'TRACE B OUTCOME', kind: 'store', col: 3, row: 1 },
  ],
  links: [
    { from: 'a1', to: 'a2', label: 'pass' },
    { from: 'a2', to: 'a3', label: 'pass' },
    { from: 'a3', to: 'a4', dashed: true },
    { from: 'b1', to: 'b2', label: 'pass' },
    { from: 'b2', to: 'b3', label: 'fail', dashed: true },
    { from: 'b3', to: 'b4', dashed: true },
  ],
}

const PAVED_ROAD: DiagramSpec = {
  slug: 'pattern-paved-road',
  kind: 'architecture',
  title: 'The paved road to production',
  desc: 'A signed build crosses the trust boundary on the approved path; unsigned deploys are stopped at the gate and every deploy lands in the audit log.',
  eyebrow: 'SEMANTIC PATTERN · SECURE PAVED ROAD',
  size: { w: 960, h: 520 },
  zones: [
    { id: 'untrusted', label: 'Untrusted', kind: 'trust-boundary' },
    { id: 'build', label: 'Build plane', kind: 'zone' },
    { id: 'runtime', label: 'Runtime · isolated', kind: 'trust-boundary' },
  ],
  nodes: [
    { id: 'dev', name: 'Developer', sublabel: 'workstation identity', kind: 'input', zone: 'untrusted' },
    { id: 'intake', name: 'Change intake', sublabel: 'PR + review', kind: 'backend', zone: 'build' },
    { id: 'sign', name: 'Signing gate', sublabel: 'privileged moment', kind: 'focal', zone: 'build' },
    { id: 'deploy', name: 'Approved deploy', sublabel: 'signed artifact', kind: 'backend', zone: 'runtime' },
    { id: 'blocked', name: 'Unsigned bypass', sublabel: 'stopped at gate', kind: 'optional', zone: 'build' },
    { id: 'audit', name: 'Audit log', sublabel: 'append-only', kind: 'store', zone: 'runtime' },
  ],
  links: [
    { from: 'dev', to: 'intake', label: 'permitted' },
    { from: 'intake', to: 'sign', label: 'build' },
    { from: 'sign', to: 'deploy', label: 'signed', role: 'accent' },
    { from: 'sign', to: 'blocked', label: 'forbidden', role: 'security', dashed: true },
    { from: 'deploy', to: 'audit', label: 'records' },
    { from: 'dev', to: 'blocked', label: 'blocked', role: 'security', dashed: true },
  ],
}

const CONTROL_CATALOG: DiagramSpec = {
  slug: 'pattern-control-catalog',
  kind: 'layers',
  title: 'Controls by enforcement surface',
  desc: 'The same control inventory grouped by where it is enforced — authoring, merge, and runtime — with actor, timing and exception route named per surface.',
  eyebrow: 'SEMANTIC PATTERN · GOVERNANCE / CONTROL CATALOG',
  size: { w: 880, h: 520 },
  stacks: [
    { id: 'auth', name: 'Authoring surface', sublabel: 'lint · secret scan · CODEOWNERS (code, write, exception: waiver)', kind: 'store', weight: 1 },
    { id: 'merge', name: 'Merge / CI surface', sublabel: 'required checks · signed commits (platform, merge, bypass: break-glass)', kind: 'focal', weight: 1 },
    { id: 'deploy', name: 'Deploy surface', sublabel: 'image scan · admission policy (platform, deploy, exception: none)', kind: 'store', weight: 1 },
    { id: 'run', name: 'Runtime surface', sublabel: 'mTLS · audit sink (code + human, run, gap: legacy hosts)', kind: 'store', weight: 1 },
  ],
}

const COMPENSATING_LAYERS: DiagramSpec = {
  slug: 'pattern-compensating-layers',
  kind: 'layers',
  title: 'Each layer covers the last one’s escape',
  desc: 'Four defensive layers each mitigate what the previous layer lets through; the residual risk that survives the stack is named, not rounded to zero.',
  eyebrow: 'SEMANTIC PATTERN · COMPENSATING SECURITY LAYERS',
  size: { w: 880, h: 520 },
  callouts: [{ text: 'residual risk survives the stack — it narrows, it does not vanish', at: 'bottom-left' }],
  stacks: [
    { id: 'perimeter', name: 'Perimeter', sublabel: 'mitigates: scanning noise · escapes: stolen credentials', kind: 'store', weight: 1 },
    { id: 'authn', name: 'Authentication', sublabel: 'mitigates: stolen passwords · escapes: session theft', kind: 'store', weight: 1 },
    { id: 'runtime', name: 'Runtime isolation', sublabel: 'mitigates: lateral movement · escapes: supply chain', kind: 'store', weight: 1 },
    { id: 'detect', name: 'Detection & response', sublabel: 'mitigates: dwell time · residual: insider misuse', kind: 'focal', weight: 1 },
  ],
}

const BLOCK_DECOMPOSITION: DiagramSpec = {
  slug: 'pattern-block-decomposition',
  kind: 'tree',
  title: 'One system, citable blocks',
  desc: 'The payout platform decomposes into addressable blocks, each with a stable identifier carried in its type tag and an implementation path in the registry.',
  eyebrow: 'SEMANTIC PATTERN · TRACEABLE BLOCK DECOMPOSITION',
  size: { w: 880, h: 480 },
  nodes: [
    { id: 'root', name: 'Payout Platform', sublabel: 'in: instructions · out: settlement', tag: 'PAY-001', kind: 'focal' },
    { id: 'screen', name: 'Fraud Screening', sublabel: 'in: payout · out: verdict', tag: 'PAY-001-01', kind: 'backend' },
    { id: 'ledger', name: 'Ledger Writer', sublabel: 'in: verdict · out: entries', tag: 'PAY-001-02', kind: 'store' },
    { id: 'notify', name: 'Notifier', tag: 'PAY-001-03', kind: 'backend' },
    { id: 'rules', name: 'Rules Table', tag: 'PAY-001-01-01', kind: 'store' },
    { id: 'archive', name: 'Archive Tier', tag: 'PAY-001-02-01', kind: 'store' },
  ],
  links: [
    { from: 'root', to: 'screen' },
    { from: 'root', to: 'ledger' },
    { from: 'root', to: 'notify' },
    { from: 'screen', to: 'rules' },
    { from: 'ledger', to: 'archive' },
  ],
}

const LIFECYCLE_PHASES: DiagramSpec = {
  slug: 'pattern-lifecycle-phases',
  kind: 'state',
  title: 'One subject, its waits and its endings',
  desc: 'A job advances along the primary phase rail while a retry wait sits off the rail, and cancellation and failure stay separate terminal outcomes.',
  eyebrow: 'SEMANTIC PATTERN · LIFECYCLE PHASE MAP',
  size: { w: 920, h: 480 },
  zones: [
    { id: 'progress', label: 'Primary phase rail', kind: 'zone' },
    { id: 'interruption', label: 'Interruption / recovery', kind: 'zone' },
    { id: 'terminal', label: 'Terminal outcomes', kind: 'zone' },
  ],
  nodes: [
    { id: 'queued', name: 'Queued', kind: 'backend', zone: 'progress' },
    { id: 'running', name: 'Running', kind: 'focal', zone: 'progress' },
    { id: 'succeeded', name: 'Succeeded', kind: 'store', zone: 'terminal' },
    { id: 'waiting', name: 'Backoff wait', sublabel: '2 retries', kind: 'optional', zone: 'interruption' },
    { id: 'cancelled', name: 'Cancelled', sublabel: 'TERMINAL', kind: 'optional', zone: 'terminal' },
    { id: 'failed', name: 'Failed', sublabel: 'TERMINAL', kind: 'optional', zone: 'terminal' },
  ],
  links: [
    { from: 'queued', to: 'running', label: 'start' },
    { from: 'running', to: 'succeeded', label: 'complete' },
    { from: 'running', to: 'waiting', label: 'retryable' },
    { from: 'waiting', to: 'running', label: 're-enter', dashed: true },
    { from: 'running', to: 'failed', label: 'exhausted', dashed: true },
    { from: 'queued', to: 'cancelled', label: 'cancel' },
    { from: 'running', to: 'cancelled', label: 'cancel' },
  ],
}

// ─── The nine named patterns ─────────────────────────────────────────────────

export const SEMANTIC_PATTERNS: SemanticPattern[] = [
  {
    id: 'fan-in-queue',
    name: 'Fan-in queue / bottleneck',
    routing: 'Many arrivals competing for finite service capacity',
    triggers:
      'Several producers converge on one reviewer, service, gate, or constrained resource; the story depends on arrival rate, queue depth, wait, capacity, or backpressure.',
    requiredPrimitives: [
      'Distinct sources',
      'Fanned ingress',
      'An ordered queue with visible slots and count',
      'A capacity/service-rate label',
      'One constrained service point',
      'Admitted and deferred/rejected outcomes',
    ],
    budget: '≤5 sources, ≤5 queue slots, one bottleneck, two outcomes, ≤9 primary nodes. Aggregate excess sources as a named cohort.',
    antiPatterns: [
      'Equal-width pipeline that hides contention',
      'Arrows merged before they can be traced',
      'Capacity implied only by box size',
      'Decorative pile-up',
      'Red alone meaning overloaded',
    ],
    staticFallback: 'Show the representative final queue, numeric count/capacity, bottleneck label, and both outcome paths.',
    nearestKind: 'data-flow',
    alternatives: 'Use Process when service stages, rather than sources, dominate.',
    template: FAN_IN_QUEUE,
  },
  {
    id: 'stage-framework',
    name: 'Stage framework with semantic slots',
    routing: 'Repeated questions, inputs, controls, and outputs across stages',
    triggers:
      'A lifecycle or operating model repeats the same semantic questions across stages. Cross-stage comparability matters more than message timing.',
    requiredPrimitives: [
      'Ordered stage headers',
      'A consistent slot grid',
      'Explicit empty/not-applicable slots',
      'Stage-to-stage handoff',
      'Stable slot labels',
      'One primary output per stage',
    ],
    budget: '3–6 stages, 3–4 slot kinds, ≤20 populated cells, ≤2 lines per cell.',
    antiPatterns: [
      'Each stage invents a different internal layout',
      'Slot meaning encoded by position with no labels',
      'Fake precision from dozens of cells',
      'Shrinking text to keep one canvas',
    ],
    staticFallback: 'Render the full stage × slot matrix with handoffs and explicit empty entries.',
    nearestKind: 'process',
    alternatives: 'Use Swimlane only when the repeated rows represent owners rather than semantic slots.',
    template: STAGE_FRAMEWORK,
  },
  {
    id: 'structured-artifact',
    name: 'Unstructured input → structured artifact',
    routing: 'A loose conversation becoming a durable structured record',
    triggers:
      'Dialogue, notes, prompts, or a rambling request are elicited, normalized, and written into a durable brief, ticket, record, or schema.',
    requiredPrimitives: [
      'Source utterance(s)',
      'Clarifying questions',
      'Extracted field/value pairs',
      'A named transformation',
      'The durable artifact boundary',
      'Provenance links from representative statements to fields',
      'Missing/unknown state',
    ],
    budget: '≤4 exchanges, ≤6 artifact fields, one transformation, ≤3 provenance links.',
    antiPatterns: [
      '“AI magic” sparkle between two boxes',
      'Artifact shown as another chat bubble',
      'Fields appearing without sources',
      'Inventing certainty for missing facts',
    ],
    staticFallback: 'Show a short source excerpt beside the completed labeled artifact, with at least one provenance mapping and any unknown fields visible.',
    nearestKind: 'data-flow',
    alternatives: 'Use Process when elicitation has several ordered gates.',
    template: STRUCTURED_ARTIFACT,
  },
  {
    id: 'paired-traces',
    name: 'Paired policy-evaluation traces',
    routing: 'Why two policy decisions differ and where they first diverge',
    triggers:
      'Two otherwise similar requests reach different outcomes; the reader needs rule-by-rule PASS, FAIL, SKIPPED, or NOT REACHED state and the first divergence.',
    requiredPrimitives: [
      'The same ordered rules on both traces',
      'Explicit status text plus symbol/shape',
      'Inputs that differ',
      'Final outcomes',
      'A labeled first-divergence marker',
      'SKIPPED distinguished from NOT REACHED',
    ],
    budget: 'Exactly 2 traces, 3–6 rules, one first divergence, ≤12 status cells, one outcome per trace.',
    antiPatterns: [
      'Comparing two independently ordered flows',
      'Green/red dots without words',
      'Treating skipped and not-reached as synonyms',
      'Continuing a denied trace as if downstream rules ran',
    ],
    staticFallback: 'Show all rule states and both outcomes at once; label the first divergence persistently.',
    nearestKind: 'flowchart',
    alternatives: 'Use Sequence only when messages between actors and time are also load-bearing.',
    template: PAIRED_TRACES,
  },
  {
    id: 'secure-paved-road',
    name: 'Secure paved road',
    routing: 'Which routes cross a trust boundary and which routes are blocked',
    triggers:
      'A supported architecture creates a bounded route from intake/build to deployment; trust boundaries, privileged moments, permitted and forbidden ingress are the point.',
    requiredPrimitives: [
      'Labeled trust boundaries',
      'Actors and identities',
      'Permitted ingress with a positive text label',
      'Forbidden ingress terminating at the boundary',
      'Approved deployment path',
      'Blocked bypass path',
      'Privileged gate',
      'Isolated runtime',
      'Audit destination',
    ],
    budget: '≤3 trust zones, ≤8 components, ≤10 paths, ≤2 forbidden paths, one privileged gate.',
    antiPatterns: [
      'Dashed box called “security” with no route semantics',
      'Forbidden arrow crossing into the protected zone',
      'Secrets or identity implied but unlabeled',
      'A bypass path that visually rejoins the approved route',
    ],
    staticFallback: 'Render every boundary and both permitted/forbidden routes. Blocked paths visibly stop before entry or deployment.',
    nearestKind: 'architecture',
    template: PAVED_ROAD,
  },
  {
    id: 'control-catalog',
    name: 'Governance / control catalog',
    routing: 'Which controls apply at each enforcement surface',
    triggers:
      'A control inventory must be understood by where it is enforced: authoring, workspace, merge/CI, deploy/runtime. A single checklist would hide those enforcement points.',
    requiredPrimitives: [
      'Enforcement-surface groups',
      'Named controls',
      'Enforcement actor (code, platform, human)',
      'Timing (write, merge, deploy, run)',
      'Bypassability or exception route',
      'Coverage/gap notation',
    ],
    budget: '3–5 surfaces, 3–7 controls per surface, ≤24 controls total, ≤3 attributes per control.',
    antiPatterns: [
      '35 tiny pills',
      'Grouping by vague themes instead of enforcement point',
      'Mixing aspirations with enforced controls',
      'Claiming defense-in-depth without showing surface coverage',
    ],
    staticFallback: 'Show the complete grouped catalog with surface headers and text labels for actor and enforcement timing; preserve gaps and exceptions.',
    nearestKind: 'layers',
    alternatives: 'Use DP security matrix when role permissions, not enforcement surfaces, are the dominant comparison.',
    template: CONTROL_CATALOG,
  },
  {
    id: 'compensating-layers',
    name: 'Compensating security layers',
    routing: 'How defenses reduce risk and what risk remains',
    triggers:
      'No layer is perfect; each defense covers a failure left by the previous layer, and residual risk must visibly narrow, transfer, or remain through the stack.',
    requiredPrimitives: [
      'Ordered threat/risk input',
      'Named defensive layers',
      "Each layer's mitigation",
      'Explicit limitation or escape',
      'Residual-risk carrier between layers',
      'Final residual risk and consequence/response',
    ],
    budget: '3–5 layers, one primary risk thread, ≤2 mitigations per layer, one final residual-risk statement.',
    antiPatterns: [
      'Implying the final layer makes risk zero',
      'Equal opaque slabs with no propagation',
      'Treating audit as prevention',
      'Reversing prevention/detection/recovery order without explanation',
    ],
    staticFallback: 'Show the complete propagation chain: initial risk → mitigation → escaped risk at every layer → final residual risk and response.',
    nearestKind: 'layers',
    alternatives: 'Use Nested when containment boundaries, rather than ordered compensation, carry the meaning.',
    template: COMPENSATING_LAYERS,
  },
  {
    id: 'block-decomposition',
    name: 'Traceable block decomposition',
    routing: 'Which sub-elements a system decomposes into, each independently citable and traced to its implementation',
    triggers:
      'A system must decompose into addressable sub-elements — each with a stable identifier a reader (or a compliance, audit, or IP record) can point at directly.',
    requiredPrimitives: [
      'A stable dotted ID per block (e.g. PAY-001-02), as the node-box type-tag chip',
      'A noun-phrase block name in the node name slot',
      'Parent-child structure on Tree’s own elbow connectors',
      'At most one short inbound and outbound flow-port label per block, in the sublabel slot',
      'Full block record in data-block-* attributes and the sidecar registry — never as visible diagram text',
    ],
    budget:
      "Tree's own root+3-tier / 5-per-level caps and the global 9-node ceiling apply as-is. At most one in/out port-label pair per block.",
    antiPatterns: [
      "Four-sided IDEF0 ICOM boxes — that is IDEF0's grammar, not this pattern's",
      'Drawing input/output arrows between siblings — that is a dependency graph’s job',
      'Verb-phrase block names — name the structural element, not an action',
      'An ID badge with no matching data-block-id',
      'Labeling the tree connector itself with an ID or name',
    ],
    staticFallback: 'This pattern has no animated form — it is always static. Every ID badge and block name must be legible in the single frame.',
    nearestKind: 'tree',
    template: BLOCK_DECOMPOSITION,
  },
  {
    id: 'lifecycle-phases',
    name: 'Lifecycle phase map',
    routing: 'How one subject progresses through phases, waits, retries, cancellation, and terminal outcomes',
    triggers:
      'One subject advances through a small set of named phases, while waits, retries, cancellation, recovery, and terminal outcomes are as important as the happy path.',
    requiredPrimitives: [
      'A left-to-right primary phase rail',
      '4–5 ordered phase states',
      'A separate interruption/recovery band for waits or retries',
      'A separate terminal-outcome band',
      'Labeled transitions',
      'Distinct terminal boxes for cancellation and failure',
    ],
    budget: '4–5 primary phases, ≤2 supporting wait/recovery states, ≤2 terminal states, ≤9 states, ≤10 transitions.',
    antiPatterns: [
      'Actor lifelines or message arrows disguised as phases',
      'Interruption states placed on the primary rail',
      'Cancellation and failure collapsed into one color-only state',
      'A retry loop with no labeled re-entry point',
    ],
    staticFallback: 'Show the complete primary rail, every supporting state, both terminal outcomes, and all labeled transitions in one frame.',
    nearestKind: 'state',
    alternatives: 'Use Sequence when actor messages or request timing carry the story.',
    template: LIFECYCLE_PHASES,
  },
]

export function patternById(id: string): SemanticPattern | undefined {
  return SEMANTIC_PATTERNS.find((p) => p.id === id)
}

/** Every worked template, for regression corpora and the studio browser. */
export function patternTemplates(): DiagramSpec[] {
  return SEMANTIC_PATTERNS.map((p) => p.template)
}
