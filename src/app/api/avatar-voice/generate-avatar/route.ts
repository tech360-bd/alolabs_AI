import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';
import { generate, validateGenerationInput } from '@/lib/media-generation';

/**
 * POST /api/avatar-voice/generate-avatar
 *
 * Avatar image request validation (image kind). `consent` is required for
 * likeness-related requests. The request is deferred because no governed media
 * generation capability is currently configured.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json().catch(() => ({}));

    if (body.consent !== true) {
      return NextResponse.json(
        { error: 'Consent is required: confirm you have permission to generate this likeness' },
        { status: 400 },
      );
    }

    const input = validateGenerationInput({
      kind: 'image',
      prompt: body.prompt,
      ...(body.voiceStyle ? { voiceStyle: body.voiceStyle } : {}),
      consent: true,
    });

    const prompt = body.voiceStyle
      ? `${input.prompt}. Presenter style: ${String(body.voiceStyle).slice(0, 40)}. Portrait avatar.`
      : `${input.prompt}. Portrait avatar.`;

    const job = await generate({ ...input, prompt }, { companyId: user.companyId, userId: user.userId, role: user.companyRole ?? user.role });
    const url = job.assets[0]?.url ?? null;

    if (job.status === 'failed') {
      return NextResponse.json({ error: job.error ?? 'Avatar generation failed', job }, { status: 502 });
    }
    return NextResponse.json({ url, image: url, jobId: job.id, job }, { status: 201 });
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
    console.error('Avatar generation error:', error);
    return NextResponse.json({ error: 'Avatar generation failed' }, { status: 500 });
  }
}
