/**
 * POST /api/ai/batch
 * ALO Labs AIOS — Execute multiple AI requests sequentially.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AIGateway } from '@/lib/ai-gateway/gateway';
import type { AIGatewayBatchRequest } from '@/lib/ai-gateway/types';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body: AIGatewayBatchRequest = await request.json();
    const result = await AIGateway.batch(body);
    return NextResponse.json(result, { status: result.success ? 200 : (result.error?.code === 'VALIDATION_ERROR' ? 400 : 502) });
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
