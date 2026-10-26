import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { LINK_COVERAGE } from '@/lib/link-coverage/registry';
import { filterEntries, verifyCoverage } from '@/lib/link-coverage/verify';
import { createNodeProbe, isWorkingTreeReadable } from '@/lib/link-coverage/probe.node';
import type { CoverageReport } from '@/lib/link-coverage/types';

/**
 * GET /api/super-admin/link-coverage
 *
 * Re-checks every reference link in `src/lib/link-coverage/registry.ts` against
 * the working tree: does each claimed evidence file still exist, how big is it,
 * and does its hash still match the one shown when the page loaded?
 *
 * Super admin only. Results are cached for 30s; `?refresh=1` forces a re-check
 * (that is what the "Re-check" button in the dashboard calls).
 *
 * When the source tree is not readable (standalone production build) the route
 * returns `mode: "baseline"` with every path marked `unverifiable` rather than
 * inventing results.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 30_000;

const QuerySchema = z.object({
  refresh: z.enum(['0', '1']).optional(),
  verdict: z.enum(['all', 'implemented', 'in_kind', 'reference', 'gap', 'not_applicable']).optional(),
  category: z.string().min(1).max(80).optional(),
  q: z.string().max(200).optional(),
  onlyGaps: z.enum(['0', '1']).optional(),
  onlyMissing: z.enum(['0', '1']).optional(),
});

let cache: { report: CoverageReport; at: number } | null = null;

function authError(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (error instanceof Error && error.message === 'Forbidden') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

function buildReport(): CoverageReport {
  const root = process.cwd();
  const readable = isWorkingTreeReadable(root);
  const probe = readable ? createNodeProbe(root) : null;

  const inventory = probe
    ? {
        srcFiles: probe.countFiles('src') ?? 0,
        docsFiles: probe.countFiles('docs') ?? 0,
      }
    : null;

  return verifyCoverage({
    entries: LINK_COVERAGE,
    probe,
    root: readable ? root : null,
    inventory,
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin');

    const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const query = parsed.data;
    const force = query.refresh === '1';

    let report: CoverageReport;
    const fresh = cache && Date.now() - cache.at < CACHE_TTL_MS && !force;
    if (fresh && cache) {
      report = cache.report;
    } else {
      report = buildReport();
      cache = { report, at: Date.now() };
    }

    const filtered = filterEntries(report.entries, {
      query: query.q,
      verdict: query.verdict,
      category: query.category,
      onlyGaps: query.onlyGaps === '1',
      onlyMissing: query.onlyMissing === '1',
    });

    return NextResponse.json({
      generatedAt: report.generatedAt,
      mode: report.mode,
      root: report.root,
      cached: Boolean(fresh),
      summary: report.summary,
      categories: report.categories,
      inventory: report.inventory,
      warnings: report.warnings,
      registrySize: LINK_COVERAGE.length,
      filtered: filtered.length,
      entries: filtered,
    });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    console.error('[super-admin/link-coverage] unexpected failure', error);
    return NextResponse.json({ error: 'Failed to verify link coverage' }, { status: 500 });
  }
}
