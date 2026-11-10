/**
 * Voice agent versioning (master prompt §10: every agent profile carries
 * "Version" + "Audit history").
 *
 * Every create/update of a VoiceAgent writes an immutable VoiceAgentVersion
 * snapshot — the FULL profile config as JSON. Configuration changes made
 * while calls are in flight are therefore auditable: you can always answer
 * "which instructions did this agent run under?" for any past call.
 *
 * Pure helpers make the snapshot/diff logic unit-testable; persistence is a
 * single monotonic counter per agent (last version + 1).
 */

export const VOICE_AGENT_CONFIG_FIELDS = [
  'name', 'description', 'purpose', 'language', 'voiceLibraryItemId', 'speakingStyle',
  'personality', 'greeting', 'systemInstructions', 'fallbackMessage', 'escalationRules',
  'workingHours', 'maxCallSeconds', 'allowBargeIn', 'humanFallbackUserId', 'knowledgeScope',
  'status', 'phoneNumberId', 'metadata',
] as const

export type AgentConfigSnapshot = Record<string, unknown>

/** Pure: project a VoiceAgent row (or partial) to its auditable config snapshot. */
export function agentConfigSnapshot(agent: Record<string, unknown>): AgentConfigSnapshot {
  const snap: AgentConfigSnapshot = {}
  for (const field of VOICE_AGENT_CONFIG_FIELDS) {
    if (agent[field] !== undefined) snap[field] = agent[field]
  }
  return snap
}

/** Pure: true when two snapshots differ in any auditable field. */
export function versionConfigsDiffer(a: AgentConfigSnapshot, b: AgentConfigSnapshot): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    const va = a[key]
    const vb = b[key]
    if (JSON.stringify(va ?? null) !== JSON.stringify(vb ?? null)) return true
  }
  return false
}

/**
 * Write the next version snapshot for an agent. Returns the version number.
 * `expectedConfig` lets callers skip no-op writes (pass the config BEFORE the
 * update; the stored row after the update is compared against it).
 */
export async function recordAgentVersion(params: {
  companyId: string
  agentId: string
  changedById?: string | null
  note?: string | null
  /** Config before the change — when provided and identical, no version is written. */
  previousConfig?: AgentConfigSnapshot | null
}): Promise<{ version: number | null; skipped: boolean }> {
  const { db } = await import('@/lib/db')
  const agent = await db.voiceAgent.findFirst({
    where: { id: params.agentId, companyId: params.companyId }, // tenant isolation
  })
  if (!agent) throw new Error(`voice agent ${params.agentId} not found for this tenant`)

  const config = agentConfigSnapshot(agent as unknown as Record<string, unknown>)
  if (params.previousConfig && !versionConfigsDiffer(params.previousConfig, config)) {
    return { version: null, skipped: true }
  }

  const last = await db.voiceAgentVersion.findFirst({
    where: { agentId: params.agentId, companyId: params.companyId },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const version = (last?.version ?? 0) + 1
  await db.voiceAgentVersion.create({
    data: {
      companyId: params.companyId,
      agentId: params.agentId,
      version,
      config: JSON.stringify(config),
      changedById: params.changedById ?? null,
      note: params.note ?? null,
    },
  })
  return { version, skipped: false }
}
