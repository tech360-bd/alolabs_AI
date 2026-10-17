import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { generate, validateGenerationInput } from '@/lib/media-generation';

/**
 * POST /api/image-studio/generate
 *
 * Thin, real wrapper around the media-generation subsystem (image kind).
 * Returns `{ url, job }` so the existing Image Studio page can render the
 * produced asset without a second round-trip.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json().catch(() => ({}));

    const input = validateGenerationInput({
      kind: 'image',
      prompt: body.prompt,
      ...(body.size ? { size: body.size } : {}),
      ...(body.count ? { count: Number(body.count) } : {}),
    });

    // Style is a prompt modifier rather than a provider parameter: providers
    // accept free-form text, and inventing a "style" query parameter that no
    // provider honours would silently do nothing.
    const prompt = body.style ? `${input.prompt}. Style: ${String(body.style).slice(0, 40)}` : input.prompt;

    const job = await generate({ ...input, prompt }, { companyId: user.companyId, userId: user.userId });
    const url = job.assets[0]?.url ?? null;

    if (job.status === 'failed') {
      return NextResponse.json({ error: job.error ?? 'Image generation failed', job }, { status: 502 });
    }
    return NextResponse.json({ url, image: url, job }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && /prompt must|kind must|count must|size/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Image studio error:', error);
    return NextResponse.json({ error: 'Image generation failed' }, { status: 500 });
  }
}
