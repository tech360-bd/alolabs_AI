import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { generate, validateGenerationInput } from '@/lib/media-generation';

/**
 * POST /api/music-studio/generate
 *
 * Submits a real music job to the provider configured through
 * MEDIA_MUSIC_ENDPOINT. Synchronous providers return the URL immediately;
 * asynchronous ones return a job id that /api/music-studio/tracks exposes
 * until the provider finishes (polling is done by /api/media/generate/jobs/[id]
 * or on the next generation call).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json().catch(() => ({}));

    const input = validateGenerationInput({
      kind: 'music',
      prompt: body.prompt,
      ...(body.genre ? { genre: body.genre } : {}),
      ...(body.mood ? { mood: body.mood } : {}),
      ...(body.tempo ? { tempo: Number(body.tempo) } : {}),
      ...(body.instrumental !== undefined ? { instrumental: Boolean(body.instrumental) } : {}),
      ...(body.lyrics ? { lyrics: String(body.lyrics) } : {}),
    });

    const job = await generate(input, { companyId: user.companyId, userId: user.userId });
    const url = job.assets[0]?.url ?? null;

    if (job.status === 'failed') {
      return NextResponse.json({ error: job.error ?? 'Music generation failed', job }, { status: 502 });
    }
    return NextResponse.json(
      { url, audio: url, status: job.status, jobId: job.id, job },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && /prompt must|kind must/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Music studio error:', error);
    return NextResponse.json({ error: 'Music generation failed' }, { status: 500 });
  }
}

export async function GET() {
  // The studio page lists via /api/music-studio/tracks; this endpoint only
  // documents the capability so operators can probe it.
  return NextResponse.json({
    kind: 'music',
    configured: Boolean(process.env.MEDIA_MUSIC_ENDPOINT),
    requiredEnv: ['MEDIA_API_KEY', 'MEDIA_MUSIC_ENDPOINT'],
    optionalEnv: ['MEDIA_MUSIC_STATUS_ENDPOINT', 'MEDIA_MUSIC_MODEL'],
  });
}
