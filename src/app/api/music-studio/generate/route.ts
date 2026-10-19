import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';
import { generate, validateGenerationInput } from '@/lib/media-generation';

/**
 * POST /api/music-studio/generate
 *
 * Validates a music request and defers it through the central company policy
 * until a verified, authorized music-generation capability is available.
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

    const job = await generate(input, { companyId: user.companyId, userId: user.userId, role: user.companyRole ?? user.role });
    const url = job.assets[0]?.url ?? null;

    if (job.status === 'failed') {
      return NextResponse.json({ error: job.error ?? 'Music generation failed', job }, { status: 502 });
    }
    return NextResponse.json(
      { url, audio: url, status: job.status, jobId: job.id, job },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CompanyAIError) {
      return NextResponse.json({ error: error.message, code: error.code, requestId: error.requestId }, { status: error.status });
    }
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
  return NextResponse.json({
    kind: 'music',
    available: false,
    status: 'unavailable',
    reason: 'No centrally verified, company-authorized music-generation capability is configured.',
  });
}
