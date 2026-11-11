import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/v1/ai/health — public AI service-plane liveness.
 *
 * Public (no auth). Returns a safe, minimal status — never internal
 * infrastructure details (no DB connection strings, no model inventory,
 * no agent counts).
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: 'ok',
      service: 'alolabs-ai-gateway',
      version: 'v1',
      timestamp: new Date().toISOString(),
    },
  });
}
