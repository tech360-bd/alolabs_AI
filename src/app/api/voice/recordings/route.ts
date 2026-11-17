import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany, RawResponse } from '@/lib/voice/api-helpers'
import { getStorage } from '@/lib/storage'
import { toSrt, toVtt, type TimedSegment } from '@/lib/voice/subtitles'
import { parseJsonColumn } from '@/lib/voice/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * Call recordings, transcripts and subtitle exports (Modules C/D/G).
 *
 * GET  — list recordings + transcripts for the tenant
 *   ?callSessionId=  one call's recording + transcript + summary
 *   ?transcript=callSessionId&format=srt|vtt|json  → subtitle file
 *   ?audio=callSessionId                            → audio stream (tenant
 *                                                     scoped, never public)
 *   ?retention=      recordings due for deletion
 *
 * ACCESS CONTROL: audio is streamed through this authenticated route only —
 * storage keys are never exposed as public URLs, so a leaked key cannot be used
 * to fetch a recording from a static path.
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)

    const audioFor = searchParams.get('audio')
    if (audioFor) {
      const recording = await db.callRecording.findFirst({
        where: { callSessionId: audioFor, companyId: auth.companyId },
        select: { storageKey: true, mimeType: true },
      })
      if (!recording) throw new Error(`recording for call ${audioFor} not found for this tenant`)
      const storage = getStorage()
      const bytes = await storage.download(recording.storageKey)
      return new RawResponse(new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': recording.mimeType,
          'Content-Length': String(bytes.byteLength),
          'Cache-Control': 'private, no-store',
          'Content-Disposition': `inline; filename="call-${audioFor}.wav"`,
        },
      }))
    }

    const transcriptFor = searchParams.get('transcript')
    if (transcriptFor) {
      const transcript = await db.callTranscript.findFirst({
        where: { callSessionId: transcriptFor, companyId: auth.companyId },
      })
      if (!transcript) throw new Error(`transcript for call ${transcriptFor} not found for this tenant`)
      const segments = parseJsonColumn<TimedSegment[]>(transcript.segments, [])
      const format = optionalString({ format: searchParams.get('format') ?? '' }, 'format') ?? 'json'

      if (format === 'srt') {
        const { srt, cues, skipped } = toSrt(segments)
        return new RawResponse(new Response(srt, {
          headers: {
            'Content-Type': 'application/x-subrip; charset=utf-8',
            'Content-Disposition': `attachment; filename="call-${transcriptFor}.srt"`,
            'X-Cue-Count': String(cues),
            'X-Skipped-Segments': String(skipped),
          },
        }))
      }
      if (format === 'vtt') {
        const { vtt, cues, skipped } = toVtt(segments)
        return new RawResponse(new Response(vtt, {
          headers: {
            'Content-Type': 'text/vtt; charset=utf-8',
            'Content-Disposition': `attachment; filename="call-${transcriptFor}.vtt"`,
            'X-Cue-Count': String(cues),
            'X-Skipped-Segments': String(skipped),
          },
        }))
      }
      return {
        data: { segments, language: transcript.language, confidence: transcript.confidence, provider: transcript.provider },
        note: skippedNote(segments),
      }
    }

    const callSessionId = searchParams.get('callSessionId')
    if (callSessionId) {
      const call = await db.callSession.findFirst({
        where: { id: callSessionId, companyId: auth.companyId },
        select: { id: true, direction: true, status: true, durationSeconds: true, recordingConsent: true, simulated: true, startedAt: true },
      })
      if (!call) throw new Error(`call ${callSessionId} not found for this tenant`)
      const [recording, transcript, summary] = await Promise.all([
        db.callRecording.findFirst({ where: { callSessionId, companyId: auth.companyId } }),
        db.callTranscript.findFirst({ where: { callSessionId, companyId: auth.companyId } }),
        db.callSummary.findFirst({ where: { callSessionId, companyId: auth.companyId } }),
      ])
      return {
        data: {
          call,
          recording: recording
            ? { ...recording, downloadable: true, url: `/api/voice/recordings?audio=${callSessionId}` }
            : null,
          transcript: transcript
            ? {
                ...transcript,
                segments: parseJsonColumn<TimedSegment[]>(transcript.segments, []),
                srtUrl: `/api/voice/recordings?transcript=${callSessionId}&format=srt`,
                vttUrl: `/api/voice/recordings?transcript=${callSessionId}&format=vtt`,
              }
            : null,
          summary: summary
            ? {
                ...summary,
                intents: parseJsonColumn<string[]>(summary.intents, []),
                actionItems: parseJsonColumn<string[]>(summary.actionItems, []),
                keyTopics: parseJsonColumn<string[]>(summary.keyTopics, []),
              }
            : null,
        },
      }
    }

    const retention = searchParams.get('retention')
    if (retention === 'due') {
      const due = await db.callRecording.findMany({
        where: { companyId: auth.companyId, retentionUntil: { not: null, lte: new Date() } },
        orderBy: { retentionUntil: 'asc' },
        take: 500,
        select: { id: true, callSessionId: true, retentionUntil: true, storageKey: true },
      })
      return { data: due, total: due.length, note: 'Deletion is an explicit operator action; this is the due list.' }
    }

    const [recordings, transcripts] = await Promise.all([
      db.callRecording.findMany({
        where: { companyId: auth.companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, callSessionId: true, mimeType: true, durationSeconds: true, sizeBytes: true, retentionUntil: true, createdAt: true },
      }),
      db.callTranscript.findMany({
        where: { companyId: auth.companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, callSessionId: true, language: true, status: true, confidence: true, provider: true, createdAt: true },
      }),
    ])
    return {
      data: { recordings, transcripts },
      note: 'Recording rows exist only when a real telephony adapter reported media metadata. Sandbox calls never create fake recordings.',
    }
  })
}

export async function DELETE(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const recordingId = requireString(body, 'recordingId')
    const recording = await db.callRecording.findFirst({
      where: { id: recordingId, companyId: auth.companyId },
      select: { id: true, storageKey: true },
    })
    if (!recording) throw new Error(`recording ${recordingId} not found for this tenant`)

    // Delete the object first; if that fails, the row stays so the operator can
    // retry instead of leaving an orphaned file with no record of its existence.
    try {
      await getStorage().delete(recording.storageKey)
    } catch (err) {
      throw new Error(`storage delete failed, recording row retained: ${err instanceof Error ? err.message : 'unknown'}`)
    }
    await db.callRecording.delete({ where: { id: recording.id } })
    return { data: { ok: true }, notice: 'Recording and its stored audio were deleted.' }
  })
}

function skippedNote(segments: TimedSegment[]): string {
  const untimed = segments.filter((s) => !(s.endMs > s.startMs)).length
  return untimed > 0
    ? `${untimed} segment(s) have no timing data and will be skipped by SRT/VTT export.`
    : 'All segments carry timing.'
}
