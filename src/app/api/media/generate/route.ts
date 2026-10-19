import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { CompanyAIError } from '@/lib/multi-tenant-ai/service';
import {
  generate,
  listJobs,
  MediaConfigurationError,
  validateGenerationInput,
  type GenerationInput,
} from '@/lib/media-generation';

/**
 * /api/media/generate
 *
 * POST → validate and defer until the central router has a company-authorized,
 * verified media-generation capability. A legacy environment API key is not
 * sufficient authorization to send company data or incur spend.
 * GET  → the caller's company's most recent jobs.
 */

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();

    const body = (await request.json().catch(() => ({}))) as Partial<GenerationInput>;
    let input: GenerationInput;
    try {
      input = validateGenerationInput(body);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid request' },
        { status: 400 },
      );
    }

    const job = await generate(input, { companyId: user.companyId, userId: user.userId, role: user.companyRole ?? user.role });
    return NextResponse.json({ job }, { status: job.status === 'failed' ? 502 : 201 });
  } catch (error) {
    if (error instanceof CompanyAIError) {
      return NextResponse.json({ error: error.message, code: error.code, requestId: error.requestId }, { status: error.status });
    }
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof MediaConfigurationError || (error instanceof Error && error.message.startsWith('Configuration required'))) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Media generation error:', error);
    return NextResponse.json({ error: 'Media generation failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await requireCompanyAuth();
    const jobs = await listJobs(user.companyId);
    return NextResponse.json({ data: jobs, total: jobs.length });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('Media jobs list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
