import { NextResponse } from 'next/server';
import {
  ROADMAP_PHASES,
  STREAM_DEFINITIONS,
  getRoadmapSummary,
  getPhaseById,
  getTasksByStream,
} from '@/lib/enterprise-roadmap';
import { requireAuth } from '@/lib/api-auth';

/**
 * /api/enterprise/roadmap — internal roadmap catalogue.
 *
 * Replaces a handler that trusted a `Bearer` header's mere presence (the
 * edge only checks presence, not validity). The catalogue is internal ALO
 * Labs content, so it is gated to any authenticated user; the verifySession
 * round-trip below enforces a real session. GET-only, read-only.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const phaseId = searchParams.get('phase');
    const streamId = searchParams.get('stream');
    const view = searchParams.get('view'); // 'summary' | 'full' | 'timeline'

    if (view === 'summary') {
      return NextResponse.json({
        success: true,
        data: getRoadmapSummary(),
        streams: STREAM_DEFINITIONS,
      });
    }

    if (phaseId) {
      const phase = getPhaseById(phaseId);
      if (!phase) {
        return NextResponse.json({ success: false, error: `Phase ${phaseId} not found` }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: phase });
    }

    if (streamId) {
      const tasks = getTasksByStream(streamId);
      const streamDef = STREAM_DEFINITIONS.find((s) => s.id === streamId);
      return NextResponse.json({ success: true, data: { stream: streamDef, tasks } });
    }

    return NextResponse.json({
      success: true,
      data: { phases: ROADMAP_PHASES, streams: STREAM_DEFINITIONS, summary: getRoadmapSummary() },
      requestedBy: user.userId,
    });
  } catch (error) {
    console.error('[Roadmap API]', error);
    return NextResponse.json({ success: false, error: 'Failed to load roadmap data' }, { status: 500 });
  }
}
