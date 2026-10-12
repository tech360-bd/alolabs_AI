/**
 * GET /api/health/live
 * Kubernetes liveness probe — no auth required.
 * Always returns 200 if the Node.js process is running.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ alive: true });
}
