/**
 * Idempotent seed for the initial Bangla voice-agent roster.
 *
 * Creates three REAL `VoiceAgent` profiles for one tenant, each with real
 * Bangla system instructions, a language configuration, model configuration
 * (tier + explicit model id, so routing never depends on a lucky default),
 * conversation settings, permission boundaries recorded in `metadata`, and an
 * immutable `VoiceAgentVersion` snapshot.
 *
 * Invariants this script deliberately upholds:
 *  - **Idempotent.** Agents are keyed on `metadata.seedKey`, not on `name`, so
 *    re-running updates the existing profile (and records a new version only
 *    when the config actually changed) instead of creating duplicates.
 *  - **No inflation.** It never inserts `CallSession`, `CallTranscript`,
 *    `CallSummary` or `VoiceUsageEntry` rows. Dashboards must reflect real
 *    calls only; this script creates configuration, not activity.
 *  - **Refuses to guess the tenant.** `companyId` is required. A silently wrong
 *    tenant would put agents in a stranger's workspace.
 *
 * Usage:
 *   COMPANY_ID=cmp_xxx npx tsx scripts/seed-bangla-voice-agents.ts
 *   COMPANY_ID=cmp_xxx DRY_RUN=1 npx tsx scripts/seed-bangla-voice-agents.ts
 *   COMPANY_ID=cmp_xxx AGENT_STATUS=active npx tsx scripts/seed-bangla-voice-agents.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const SEED_VERSION = 1

/** Permission boundaries recorded on every profile (enforced by the voice layer). */
const PERMISSION_BOUNDARIES = {
  /** Actions this profile may never take, regardless of instructions. */
  denied: [
    'quote_price_without_knowledge_source',
    'promise_refund_or_compensation',
    'collect_payment_card_details',
    'give_legal_or_medical_advice',
    'claim_to_be_human',
    'transfer_call_without_telephony',
  ],
  /** Requires an explicit knowledge snippet in scope before answering. */
  requiresKnowledgeFor: ['fees', 'admission_deadline', 'program_eligibility', 'order_status'],
  /** Structural handoff triggers (evaluated before the model is called). */
  handoffTriggers: ['human_request', 'payment_dispute', 'legal_threat', 'repeated_misunderstanding'],
  /** This deployment has no telephony adapter; handoff is recorded, not dialled. */
  telephonyConnected: false,
} as const

interface AgentBlueprint {
  seedKey: string
  name: string
  description: string
  purpose: string
  greeting: string
  fallbackMessage: string
  systemInstructions: string
  knowledgeScope: string[]
  maxCallSeconds: number
  allowBargeIn: boolean
  speakingStyle: string
  personality: string
  escalationRules: Array<{ trigger: string; action: string }>
}

/**
 * Real Bangla profiles. Instructions are written for telephone speech: short
 * sentences, no markdown, Bangladesh Bangla register, and an explicit ban on
 * inventing facts that it cannot verify from its knowledge scope.
 */
const BLUEPRINTS: AgentBlueprint[] = [
  {
    seedKey: 'bangla-customer-support',
    name: 'Bangla Customer Support Agent',
    description: 'গ্রাহক সেবা — অর্ডার, ডেলিভারি ও সেবা সংক্রান্ত সহায়তা।',
    purpose: 'Handle inbound customer-support conversations in Bangla.',
    greeting: 'আসসালামু আলাইকুম! আলো ল্যাবস গ্রাহক সেবায় আপনাকে স্বাগতম। আমি একটি এআই সহকারী। কীভাবে সাহায্য করতে পারি?',
    fallbackMessage: 'দুঃখিত, আমি এই বিষয়ে নিশ্চিত তথ্য জানি না। আমি আপনার জন্য একজন প্রতিনিধির সাথে যোগাযোগের অনুরোধ নথিভুক্ত করছি।',
    systemInstructions: [
      'তুমি আলো ল্যাবসের গ্রাহক সেবা সহকারী। তুমি একজন এআই, মানুষ নও — জিজ্ঞাসা করলে স্পষ্টভাবে বলো।',
      'সবসময় বাংলায় উত্তর দাও, যেভাবে বাংলাদেশে স্বাভাবিকভাবে কথা বলা হয়। প্রতিটি উত্তর এক থেকে তিন বাক্য।',
      'ফোনে বলা হবে — কোনো তালিকা, মার্কডাউন, ইমোজি বা বুলেট পয়েন্ট ব্যবহার করো না।',
      'দাম, ডেলিভারি সময়, রিফান্ড বা অর্ডার স্ট্যাটাস নিজে থেকে অনুমান করে বলো না। জ্ঞানভাণ্ডারে তথ্য থাকলে তার ভিত্তিতেই বলো, না থাকলে বলো তুমি যাচাই করে জানাবে।',
      'গ্রাহকhuman চাইলে, রিফান্ড বা টাকা সংক্রান্ত অভিযোগ করলে, বা আইনি কথা বললে বিনয়ের সাথে জানাও যে তুমি প্রতিনিধির কাছে হস্তান্তর করছ।',
    ].join('\n'),
    knowledgeScope: [],
    maxCallSeconds: 600,
    allowBargeIn: true,
    speakingStyle: 'শান্ত, সম্মানজনক, সংক্ষিপ্ত',
    personality: 'ধৈর্যশীল ও সহায়ক; কখনো তাড়াহুড়া করে না।',
    escalationRules: [
      { trigger: 'human_request', action: 'handoff' },
      { trigger: 'payment_dispute', action: 'handoff' },
    ],
  },
  {
    seedKey: 'bangla-admissions-info',
    name: 'Bangla Admissions Information Agent',
    description: 'ভর্তি তথ্য — কোর্স, যোগ্যতা ও ভর্তি প্রক্রিয়া সম্পর্কিত তথ্য।',
    purpose: 'Answer admissions questions in Bangla for prospective students.',
    greeting: 'আসসালামু আলাইকুম! ভর্তি তথ্য বিভাগে আপনাকে স্বাগতম। আমি একটি এআই সহকারী। কোন কোর্স বা প্রোগ্রাম সম্পর্কে জানতে চান?',
    fallbackMessage: 'দুঃখিত, এই নির্দিষ্ট তথ্যটি আমার কাছে নিশ্চিতভাবে নেই। সঠিক তথ্যের জন্য আমি ভর্তি অফিসে আপনার জন্য অনুরোধ পাঠাচ্ছি।',
    systemInstructions: [
      'তুমি আলো ল্যাবসের ভর্তি তথ্য সহকারী। তুমি একজন এআই, মানুষ নও।',
      'বাংলায় উত্তর দাও, প্রার্থী শিক্ষার্থী বা অভিভাবককে সম্বোধন করে। এক থেকে তিন বাক্য।',
      'ফোনে বলা হবে — তালিকা বা মার্কডাউন নয়।',
      'কোর্সের ফি, ভর্তির শেষ তারিখ, বা যোগ্যতার শর্ত কখনো অনুমান করে বলো না। শুধুমাত্র জ্ঞানভাণ্ডারের তথ্য ব্যবহার করো। তথ্য না থাকলে ভর্তি অফিসে পাঠানোর কথা বলো।',
      'কোনো ভর্তি নিশ্চয়তা, ছাড়, বা আসন সংরক্ষণের প্রতিশ্রুতি দিও না।',
    ].join('\n'),
    knowledgeScope: [],
    maxCallSeconds: 600,
    allowBargeIn: true,
    speakingStyle: 'স্পষ্ট, উৎসাহব্যঞ্জক, পেশাদার',
    personality: 'বন্ধুত্বপূর্ণ ও তথ্যনির্ভর; অতিরঞ্জন করে না।',
    escalationRules: [
      { trigger: 'human_request', action: 'handoff' },
      { trigger: 'fee_negotiation', action: 'handoff' },
    ],
  },
  {
    seedKey: 'bangla-general-inquiry',
    name: 'Bangla General Inquiry Agent',
    description: 'সাধারণ জিজ্ঞাসা — প্রতিষ্ঠান সম্পর্কে প্রাথমিক তথ্য ও নির্দেশনা।',
    purpose: 'Front-door general inquiry handling in Bangla.',
    greeting: 'আসসালামু আলাইকুম! আমি আলো ল্যাবসের এআই সহকারী। আপনার প্রশ্নটি বলুন, আমি যথাসাধ্য সাহায্য করব।',
    fallbackMessage: 'দুঃখিত, এই বিষয়ে আমার কাছে নির্ভরযোগ্য তথ্য নেই। আমি আপনার প্রশ্নটি সংশ্লিষ্ট দলের কাছে পৌঁছে দেওয়ার অনুরোধ রাখছি।',
    systemInstructions: [
      'তুমি আলো ল্যাবসের সাধারণ তথ্য সহকারী। তুমি একজন এআই।',
      'বাংলায় উত্তর দাও। প্রয়োজনে বাংলা-ইংরেজি মিশ্র ভাষা ব্যবহার করতে পারো, তবে ভাষা গ্রাহকের ভাষার সাথে মিলিয়ে নাও।',
      'ফোনে বলা হবে — সংক্ষিপ্ত, এক থেকে তিন বাক্য, কোনো তালিকা নয়।',
      'প্রতিষ্ঠান সম্পর্কে নিশ্চিত নয় এমন কোনো দাবি (যেমন পুরস্কার, সংখ্যা, গ্যারান্টি) করো না।',
      'সঠিক বিভাগে সংযোগ দেওয়ার কথা বলো, নিজে সমাধান করার ভান করো না।',
    ].join('\n'),
    knowledgeScope: [],
    maxCallSeconds: 480,
    allowBargeIn: true,
    speakingStyle: 'বন্ধুত্বপূর্ণ, সহজ, সংক্ষিপ্ত',
    personality: 'স্বাগতকারী ও নির্দেশক।',
    escalationRules: [{ trigger: 'human_request', action: 'handoff' }],
  },
]

function metadataFor(bp: AgentBlueprint, existingMeta?: string): string {
  let parsed: Record<string, unknown> = {}
  if (existingMeta) {
    try {
      const v = JSON.parse(existingMeta) as unknown
      if (v && typeof v === 'object' && !Array.isArray(v)) parsed = v as Record<string, unknown>
    } catch {
      // Corrupt metadata is replaced rather than silently merged.
    }
  }
  return JSON.stringify({
    ...parsed,
    seedKey: bp.seedKey,
    seedVersion: SEED_VERSION,
    // Explicit model configuration: the voice turn loop asks for the
    // `local_fast` profile, which maps to the local gateway. Recording the
    // intended model id here makes the expectation auditable per agent.
    modelConfig: {
      profile: 'local_fast',
      tier: 'fast',
      modelEnvKey: 'LOCAL_MODEL_FAST',
      requireLocal: true,
      allowHostedFallback: false,
    },
    permissions: PERMISSION_BOUNDARIES,
  })
}

/** The fields that constitute the routable behaviour of the agent. */
function configSnapshot(a: {
  name: string
  language: string
  greeting: string | null
  systemInstructions: string | null
  fallbackMessage: string | null
  knowledgeScope: string
  maxCallSeconds: number
  allowBargeIn: boolean
  status: string
  metadata: string
  escalationRules: string
}): string {
  return JSON.stringify({
    name: a.name,
    language: a.language,
    greeting: a.greeting,
    systemInstructions: a.systemInstructions,
    fallbackMessage: a.fallbackMessage,
    knowledgeScope: a.knowledgeScope,
    maxCallSeconds: a.maxCallSeconds,
    allowBargeIn: a.allowBargeIn,
    status: a.status,
    metadata: a.metadata,
    escalationRules: a.escalationRules,
  })
}

async function main() {
  const companyId = process.env.COMPANY_ID?.trim()
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
  const status = process.env.AGENT_STATUS?.trim() || 'draft'
  const allowed = new Set(['draft', 'testing', 'active', 'paused', 'retired'])

  if (!companyId) {
    console.error('COMPANY_ID is required. This script will not guess a tenant.')
    process.exitCode = 2
    return
  }
  if (!allowed.has(status)) {
    console.error(`AGENT_STATUS must be one of ${[...allowed].join(', ')} (got "${status}").`)
    process.exitCode = 2
    return
  }

  const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } })
  if (!company) {
    console.error(`No company with id "${companyId}". Nothing was written.`)
    process.exitCode = 2
    return
  }

  console.log(`Tenant: ${company.name} (${company.id})`)
  console.log(`Status: ${status}${dryRun ? '  [DRY RUN — no writes]' : ''}`)

  const results: Array<{ name: string; action: 'created' | 'updated' | 'unchanged'; version?: number }> = []

  for (const bp of BLUEPRINTS) {
    // Idempotency key: seedKey inside metadata, scoped to the tenant.
    const existingRows = await db.voiceAgent.findMany({
      where: { companyId, metadata: { contains: `"seedKey":"${bp.seedKey}"` } },
      orderBy: { createdAt: 'asc' },
    })
    const existing = existingRows[0]

    const data = {
      companyId,
      name: bp.name,
      description: bp.description,
      purpose: bp.purpose,
      language: 'bn-BD',
      greeting: bp.greeting,
      systemInstructions: bp.systemInstructions,
      fallbackMessage: bp.fallbackMessage,
      knowledgeScope: JSON.stringify(bp.knowledgeScope),
      maxCallSeconds: bp.maxCallSeconds,
      allowBargeIn: bp.allowBargeIn,
      escalationRules: JSON.stringify(bp.escalationRules),
      speakingStyle: bp.speakingStyle,
      personality: bp.personality,
      status,
      metadata: metadataFor(bp, existing?.metadata),
    }

    if (!existing) {
      if (dryRun) {
        results.push({ name: bp.name, action: 'created' })
        continue
      }
      const created = await db.voiceAgent.create({ data })
      const version = await recordVersion(companyId, created.id, null, 'seed: created')
      results.push({ name: bp.name, action: 'created', version })
      continue
    }

    // Only bump the version when the routable config actually changed.
    const next = configSnapshot({ ...data, name: data.name })
    const current = configSnapshot(existing)
    if (next === current) {
      results.push({ name: bp.name, action: 'unchanged' })
      continue
    }
    if (dryRun) {
      results.push({ name: bp.name, action: 'updated' })
      continue
    }
    await db.voiceAgent.update({ where: { id: existing.id }, data })
    const version = await recordVersion(companyId, existing.id, current, 'seed: updated')
    results.push({ name: bp.name, action: 'updated', version })
  }

  for (const r of results) {
    const v = r.version ? ` v${r.version}` : ''
    console.log(`  ${r.action.padEnd(10)} ${r.name}${v}`)
  }
  if (dryRun) console.log('Dry run complete — nothing was written.')
}

/** Append the next immutable version row for an agent. */
async function recordVersion(
  companyId: string,
  agentId: string,
  previousConfig: string | null,
  note: string,
): Promise<number> {
  const last = await db.voiceAgentVersion.findFirst({
    where: { agentId },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const version = (last?.version ?? 0) + 1
  const agent = await db.voiceAgent.findUniqueOrThrow({ where: { id: agentId } })
  await db.voiceAgentVersion.create({
    data: {
      companyId,
      agentId,
      version,
      config: configSnapshot(agent),
      changedById: null,
      note: previousConfig === null ? note : `${note} (previous snapshot retained in v${version - 1})`,
    },
  })
  return version
}

main()
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
