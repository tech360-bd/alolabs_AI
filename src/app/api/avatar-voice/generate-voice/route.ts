import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';
import { generate, validateGenerationInput } from '@/lib/media-generation';

const STYLE_INSTRUCTIONS: Record<string, string> = {
  natural: 'Speak naturally and conversationally, with relaxed pacing.',
  warm: 'Speak warmly and empathetically, as if reassuring a colleague.',
  professional: 'Speak clearly and professionally, as in a corporate presentation.',
  casual: 'Speak casually and informally, with an upbeat tone.',
};

/**
 * POST /api/avatar-voice/generate-voice
 *
 * Voice-over request validation (speech kind). Consent is required and the
 * request remains deferred until a governed speech-generation capability is
 * available; no provider is called based on environment configuration alone.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json().catch(() => ({}));

    if (body.consent !== true) {
      return NextResponse.json(
        { error: 'Consent is required: confirm you have permission to synthesize this voice' },
        { status: 400 },
      );
    }

    const style = typeof body.voiceStyle === 'string' ? body.voiceStyle : 'natural';
    const input = validateGenerationInput({
      kind: 'audio',
      prompt: body.text ?? body.prompt,
      ...(body.voiceStyle ? { voiceStyle: body.voiceStyle } : {}),
      consent: true,
    });

    const job = await generate(
      {
        ...input,
        ...(STYLE_INSTRUCTIONS[style] ? { instructions: STYLE_INSTRUCTIONS[style] } : {}),
      },
      { companyId: user.companyId, userId: user.userId, role: user.companyRole ?? user.role },
    );
    const url = job.assets[0]?.url ?? null;

    if (job.status === 'failed') {
      return NextResponse.json({ error: job.error ?? 'Voice generation failed', job }, { status: 502 });
    }
    return NextResponse.json({ url, audio: url, jobId: job.id, job }, { status: 201 });
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
    console.error('Voice generation error:', error);
    return NextResponse.json({ error: 'Voice generation failed' }, { status: 500 });
  }
}
