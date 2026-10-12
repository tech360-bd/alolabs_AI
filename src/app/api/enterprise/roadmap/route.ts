import { NextResponse } from 'next/server'
import {
  ROADMAP_PHASES,
  STREAM_DEFINITIONS,
  getRoadmapSummary,
  getPhaseById,
  getTasksByStream,
} from '@/lib/enterprise-roadmap'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const phaseId = searchParams.get('phase')
    const streamId = searchParams.get('stream')
    const view = searchParams.get('view') // 'summary' | 'full' | 'timeline'

    if (view === 'summary') {
      return NextResponse.json({
        success: true,
        data: getRoadmapSummary(),
        streams: STREAM_DEFINITIONS,
      })
    }

    if (phaseId) {
      const phase = getPhaseById(phaseId)
      if (!phase) {
        return NextResponse.json(
          { success: false, error: `Phase ${phaseId} not found` },
          { status: 404 }
        )
      }
      return NextResponse.json({ success: true, data: phase })
    }

    if (streamId) {
      const tasks = getTasksByStream(streamId)
      const streamDef = STREAM_DEFINITIONS.find((s) => s.id === streamId)
      return NextResponse.json({
        success: true,
        data: { stream: streamDef, tasks },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        phases: ROADMAP_PHASES,
        streams: STREAM_DEFINITIONS,
        summary: getRoadmapSummary(),
      },
    })
  } catch (error) {
    console.error('[Roadmap API]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load roadmap data' },
      { status: 500 }
    )
  }
}
