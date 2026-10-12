/**
 * POST /api/ai/chat
 * ALO Labs AIOS — Non-streaming AI chat completion via the gateway.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AIGateway } from '@/lib/ai-gateway/gateway';
import type { AIGatewayRequest } from '@/lib/ai-gateway/types';
import { requireAuth } from '@/lib/api-auth';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Rate limit per user
    const rl = await checkEndpointLimit('/api/ai/chat', user.userId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }

    const body: AIGatewayRequest = await request.json();
    const result = await AIGateway.chat(body);
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
