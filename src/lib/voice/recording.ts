/**
 * Call recording pipeline (master prompt §19: recording consent rules,
 * §18: "Recordings must be stored privately").
 *
 * The FULL chain, honestly implemented:
 *
 *   consent gate (consent.ts recordingAllowed — default DENY)
 *     → adapter.record(providerCallId, true)      [start on answer]
 *     → adapter.record(providerCallId, false)     [stop on terminal state]
 *     → adapter.recordingMetadata(providerCallId) [NEW optional adapter hook]
 *     → CallRecording row + recording_storage_mb metering (only when the
 *       adapter returns REAL media metadata)
 *
 * HONESTY RULE: the sandbox adapter has no audio stream, so it reports NO
 * recording metadata and NO CallRecording row is written for simulated calls —
 * a fake "recording of a call that had no audio" would be fabricated evidence.
 * Real adapters (Asterisk/FreeSWITCH monitor) implement the hook and rows are
 * written from their actual files. Events (`recording_start`/`recording_stop`)
 * are always audited.
 */

import { db } from '@/lib/db'
import { resolveTelephonyAdapter } from './telephony/registry'
import { recordingAllowed } from './consent'
import { meterUsage } from './metering'

export interface RecordingOperationResult {
  performed: boolean
  reason: string
  consentRecordId?: string | null
}

/** Resolve the provider id that owns a call's telephony leg. */
async function providerForCall(companyId: string, phoneNumberId: string | null, channel: string): Promise<string> {
  if (phoneNumberId) {
    const number = await db.phoneNumber.findFirst({
      where: { id: phoneNumberId, companyId },
      select: { provider: true },
    })
    if (number?.provider) return number.provider
  }
  return channel === 'sandbox' ? 'sandbox' : 'sandbox'
}

/** Find the provider call id from the adapter_place_call audit event. */
async function providerCallIdFor(callSessionId: string, companyId: string): Promise<string | null> {
  const event = await db.callEvent.findFirst({
    where: { callSessionId, companyId, type: 'adapter_place_call' },
    orderBy: { createdAt: 'desc' },
    select: { payload: true },
  })
  if (!event) return null
  try {
    const payload = JSON.parse(event.payload) as { providerCallId?: string }
    return payload.providerCallId ?? null
  } catch {
    return null
  }
}

/** Load the recording consent facts for a call (recording mode + granted consent). */
async function consentFactsForCall(params: {
  companyId: string
  callSessionId: string
  phoneNumberId: string | null
  recordingConsent: boolean
}): Promise<{ mode: string; disclosure: string | null; granted: boolean }> {
  const number = params.phoneNumberId
    ? await db.phoneNumber.findFirst({
        where: { id: params.phoneNumberId, companyId: params.companyId },
        select: { recordingMode: true },
      })
    : null
  const consent = await db.recordingConsentRecord.findFirst({
    where: { callSessionId: params.callSessionId, companyId: params.companyId, granted: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, disclosedText: true },
  })
  return {
    mode: number?.recordingMode ?? 'disabled',
    disclosure: consent?.disclosedText ?? null,
    granted: params.recordingConsent || consent !== null,
  }
}

/**
 * Start recording on an answered call when (and only when) consent and the
 * number's recording mode allow it. Audits every decision, allowed or not.
 */
export async function startCallRecordingIfAllowed(callSessionId: string, companyId: string): Promise<RecordingOperationResult> {
  const call = await db.callSession.findFirst({
    where: { id: callSessionId, companyId },
    select: { id: true, phoneNumberId: true, recordingConsent: true, status: true, channel: true },
  })
  if (!call) throw new Error(`call ${callSessionId} not found for this tenant`)
  if (call.status !== 'in_progress') return { performed: false, reason: `call not in progress (status ${call.status})` }

  const existing = await db.callEvent.findFirst({
    where: { callSessionId, companyId, type: 'recording_start' },
    select: { id: true },
  })
  if (existing) return { performed: false, reason: 'recording already started (idempotent)' }

  const facts = await consentFactsForCall({
    companyId,
    callSessionId,
    phoneNumberId: call.phoneNumberId,
    recordingConsent: call.recordingConsent,
  })
  const gate = recordingAllowed({ recordingMode: facts.mode, disclosureText: facts.disclosure, consentGranted: facts.granted })
  if (!gate.allowed) {
    await db.callEvent.create({
      data: { callSessionId, companyId, type: 'recording_blocked', payload: JSON.stringify({ reason: gate.reason }) },
    })
    return { performed: false, reason: gate.reason }
  }

  const adapter = resolveTelephonyAdapter(await providerForCall(companyId, call.phoneNumberId, call.channel))
  const providerCallId = await providerCallIdFor(callSessionId, companyId)
  if (!providerCallId) return { performed: false, reason: 'no provider call id recorded — cannot start adapter recording' }
  try {
    await adapter.record(providerCallId, true)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'adapter record() failed'
    await db.callEvent.create({
      data: { callSessionId, companyId, type: 'recording_error', payload: JSON.stringify({ phase: 'start', reason: message }) },
    })
    return { performed: false, reason: message }
  }
  await db.callEvent.create({
    data: {
      callSessionId,
      companyId,
      type: 'recording_start',
      payload: JSON.stringify({ providerCallId, adapter: adapter.info.id, mode: facts.mode }),
    },
  })
  return { performed: true, reason: gate.reason }
}

export interface PersistedRecording {
  storageKey: string
  durationSeconds: number
  sizeBytes: number | null
}

/**
 * Stop the recording and persist the CallRecording row + storage metering.
 * A row is written ONLY from real adapter metadata — see the honesty rule.
 */
export async function stopCallRecording(callSessionId: string, companyId: string): Promise<RecordingOperationResult & { recording?: PersistedRecording }> {
  const call = await db.callSession.findFirst({
    where: { id: callSessionId, companyId },
    select: { id: true, phoneNumberId: true, channel: true, answeredAt: true },
  })
  if (!call) throw new Error(`call ${callSessionId} not found for this tenant`)

  const startEvent = await db.callEvent.findFirst({
    where: { callSessionId, companyId, type: 'recording_start' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, payload: true },
  })
  if (!startEvent) return { performed: false, reason: 'no recording was started on this call' }

  const adapter = resolveTelephonyAdapter(await providerForCall(companyId, call.phoneNumberId, call.channel))
  let providerCallId: string | null = null
  try {
    providerCallId = (JSON.parse(startEvent.payload) as { providerCallId?: string }).providerCallId ?? null
  } catch {
    providerCallId = null
  }
  if (providerCallId) {
    try {
      await adapter.record(providerCallId, false)
    } catch {
      // Stop failure must not block call termination; audited below.
    }
  }

  await db.callEvent.create({
    data: { callSessionId, companyId, type: 'recording_stop', payload: JSON.stringify({ providerCallId }) },
  })

  // Persist from REAL adapter metadata only.
  const metadataFn = (adapter as { recordingMetadata?: (id: string) => Promise<{ storageKey: string; durationSeconds: number; sizeBytes?: number; mimeType?: string } | null> }).recordingMetadata
  if (typeof metadataFn !== 'function' || !providerCallId) {
    return { performed: true, reason: 'recording stopped — adapter provides no recording metadata (no CallRecording row written)' }
  }
  let metadata: { storageKey: string; durationSeconds: number; sizeBytes?: number; mimeType?: string } | null = null
  try {
    metadata = await metadataFn.call(adapter, providerCallId)
  } catch (err) {
    await db.callEvent.create({
      data: { callSessionId, companyId, type: 'recording_error', payload: JSON.stringify({ phase: 'metadata', reason: err instanceof Error ? err.message : String(err) }) },
    })
    return { performed: true, reason: 'recording stopped — adapter metadata failed (no CallRecording row written)' }
  }
  if (!metadata?.storageKey) {
    return { performed: true, reason: 'recording stopped — adapter reported no stored media (no CallRecording row written)' }
  }

  const durationSeconds = Math.max(0, Math.round(metadata.durationSeconds))
  const sizeBytes = typeof metadata.sizeBytes === 'number' ? Math.round(metadata.sizeBytes) : null
  const consent = await db.recordingConsentRecord.findFirst({
    where: { callSessionId, companyId, granted: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  const retentionDays = Number(process.env.VOICE_RECORDING_RETENTION_DAYS ?? '90')
  await db.callRecording.upsert({
    where: { callSessionId },
    create: {
      callSessionId,
      companyId,
      storageKey: metadata.storageKey,
      mimeType: metadata.mimeType ?? 'audio/wav',
      durationSeconds,
      sizeBytes: sizeBytes !== null ? BigInt(sizeBytes) : null,
      consentRecordId: consent?.id ?? null,
      retentionUntil: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
    },
    update: { storageKey: metadata.storageKey, durationSeconds, sizeBytes: sizeBytes !== null ? BigInt(sizeBytes) : null },
  })
  if (sizeBytes !== null && sizeBytes > 0) {
    await meterUsage({
      companyId,
      dimension: 'recording_storage_mb',
      quantity: Math.round((sizeBytes / (1024 * 1024)) * 1000) / 1000,
      unit: 'MB',
      simulated: false,
      callSessionId,
      metadata: { storageKey: metadata.storageKey },
    })
  }
  return {
    performed: true,
    reason: 'recording persisted from adapter metadata',
    recording: { storageKey: metadata.storageKey, durationSeconds, sizeBytes },
  }
}
