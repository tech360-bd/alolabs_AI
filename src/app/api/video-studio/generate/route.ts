import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { generate, validateGenerationInput } from '@/lib/media-generation';

/**
 * POST /api/video-studio/generate
 *
 * Real video job submission. The provider is selected through
 * MEDIA_VIDEO_ENDPOINT; asynchronous providers must return `{ id }` and the
 * job stays `processing` until MEDIA_VIDEO_STATUS_ENDPOINT reports a result.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json().catch(() => ({}));

    const durationSeconds = Number(body.duration);
    const input = validateGenerationInput({
      kind: 'video',
      prompt: body.prompt,
      ...(Number.isFinite(durationSeconds) && durationSeconds > 0
        ? { durationSeconds: Math.min(60, Math.round(durationSeconds)) }
        : {}),
      ...(body.style ? { style: body.style } : {}),
    });

    const job = await generate(input, { companyId: user.companyId, userId: user.userId });
    const url = job.assets[0]?.url ?? null;

    if (job.status === 'failed') {
      return NextResponse.json({ error: job.error ?? 'Video generation failed', job }, { status: 502 });
    }
    return NextResponse.json(
      { url, video: url, status: job.status, jobId: job.id, job },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && /prompt must|kind must|durationSeconds/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Video studio error:', error);
    return NextResponse.json({ error: 'Video generation failed' }, { status: 500 });
  }
}
