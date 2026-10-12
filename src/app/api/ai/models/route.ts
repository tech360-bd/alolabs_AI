/**
 * GET /api/ai/models
 * ALO Labs AIOS — List all available models across all providers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AIGateway } from '@/lib/ai-gateway/gateway';
import { requireAuth } from '@/lib/api-auth';

export async function GET(_request: NextRequest) {
  try {
    const user = await requireAuth();
    const result = await AIGateway.listModels();
    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      timestamp: new Date().toISOString(),
      requestId: 'err-unknown',
    }, { status: 500 });
  }
}
