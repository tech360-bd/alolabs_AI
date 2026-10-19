import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';
import { generate, validateGenerationInput } from '@/lib/media-generation';

/**
 * POST /api/image-studio/generate
 *
 * Validates an image request and records it as deferred through central
 * company policy. No provider is called until image-generation capability,
 * authorization, pricing, and budget checks are centrally verified.
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

    const job = await generate({ ...input, prompt }, { companyId: user.companyId, userId: user.userId, role: user.companyRole ?? user.role });
    const url = job.assets[0]?.url ?? null;

    if (job.status === 'failed') {
      return NextResponse.json({ error: job.error ?? 'Image generation failed', job }, { status: 502 });
    }
    return NextResponse.json({ url, image: url, job }, { status: 201 });
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
    if (error instanceof Error && /prompt must|kind must|count must|size/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Image studio error:', error);
    return NextResponse.json({ error: 'Image generation failed' }, { status: 500 });
  }
}
