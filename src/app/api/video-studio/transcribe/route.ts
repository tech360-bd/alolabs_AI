import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { CompanyAIError, deferCompanyAIMedia } from '@/lib/multi-tenant-ai/service';

/**
 * POST /api/video-studio/transcribe
 *
 * The request is validated and recorded as deferred until transcription is a
 * centrally routed, provider-verified capability. Uploaded media is not sent to
 * a provider based only on a legacy environment API key.
 */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A "file" field is required' }, { status: 400 });
    }
    if (file.size === 0) return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds the 25 MiB transcription limit' }, { status: 413 });
    }

    await deferCompanyAIMedia({
      actor: { companyId: user.companyId, userId: user.userId, role: user.companyRole ?? user.role },
      kind: 'transcription',
      model: process.env.MEDIA_TRANSCRIBE_MODEL,
    });
  } catch (error) {
    if (error instanceof CompanyAIError) {
      return NextResponse.json(
        { error: error.message, code: error.code, requestId: error.requestId },
        { status: error.status },
      );
    }
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('Transcription request error:', error);
    return NextResponse.json({ error: 'Transcription request could not be recorded' }, { status: 500 });
  }
}
