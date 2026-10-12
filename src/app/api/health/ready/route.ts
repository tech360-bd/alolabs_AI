/**
 * GET /api/health/ready
 * Kubernetes readiness probe — no auth required.
 * Checks database connectivity only.
 * Returns 200 {"ready": true} or 503 {"ready": false}.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1 as ok`;
    return NextResponse.json({ ready: true });
  } catch {
    return NextResponse.json({ ready: false }, { status: 503 });
  }
}
