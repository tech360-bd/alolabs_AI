/**
 * GET /api/health/ready
 * Readiness probe — no auth required.
 *
 * Answers 200 {"ready": true} only when BOTH hold:
 *   1. the configured datasource satisfies the production policy (in
 *      production that means MySQL/MariaDB — never SQLite), and
 *   2. a real round-trip to the database succeeds.
 *
 * Otherwise 503 {"ready": false, ...}. The reason is returned without
 * credentials so an operator can act on it, but the probe never reports ready
 * on an unverified connection.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productionDatasourceStatus } from '@/lib/production-database';

export async function GET() {
  const datasource = productionDatasourceStatus();

  if (!datasource.ok) {
    return NextResponse.json(
      {
        ready: false,
        reason: 'datasource_policy',
        provider: datasource.provider,
        url: datasource.redactedUrl,
        detail: datasource.reason,
      },
      { status: 503 },
    );
  }

  if (typeof db.$queryRaw !== 'function') {
    return NextResponse.json(
      {
        ready: false,
        reason: 'database_unverified',
        detail: 'Database client exposes no query interface; connection not verified',
      },
      { status: 503 },
    );
  }

  try {
    await db.$queryRaw`SELECT 1 as ok`;
    return NextResponse.json({
      ready: true,
      provider: datasource.provider,
      production_policy_enforced: datasource.enforced,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ready: false,
        reason: 'database_unreachable',
        provider: datasource.provider,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
