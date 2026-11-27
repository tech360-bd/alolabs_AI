import { NextResponse } from 'next/server';
import { buildStack, filterStack, VERDICT_ORDER } from '@/lib/ecosystem/stack';
import { stackAdapters } from '@/lib/ecosystem/adapters';
import type { CoverageVerdict } from '@/lib/link-coverage/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ecosystem — the stack register (public, read-only).
 *
 * What it returns: every upstream link this project was asked about, with an
 * honest verdict (implemented / in_kind / reference / gap / not_applicable), the
 * repository files that back the claim, and the next step for each gap. Joined
 * with the 26 integration adapters so a client can see which catalogue rows are
 * actually wired to an adapter, under which licence strategy.
 *
 * Why public: this is a statement about *this* repository — no tenant row, no
 * credential, no usage data is read. It is the machine-readable twin of
 * `/site/stack`, and it is what an agent should read before proposing an
 * integration so it does not re-implement something that already exists.
 *
 * Query
 *   ?verdict=implemented|in_kind|reference|gap|not_applicable
 *   ?pillar=models|agents|automation|voice|media|ops|research|applied
 *   ?q=<free text>          name, upstream, claim, gap, category, url
 *   ?format=summary         drop `claim`/`evidence`/`brief` (small payload)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const verdictParam = searchParams.get('verdict');
  const verdict = VERDICT_ORDER.includes(verdictParam as CoverageVerdict)
    ? (verdictParam as CoverageVerdict)
    : 'all';
  const pillar = searchParams.get('pillar') ?? 'all';
  const q = searchParams.get('q') ?? '';
  const summary = searchParams.get('format') === 'summary';

  const report = buildStack({ adapters: stackAdapters() });
  const filtered = filterStack(report.entries, { verdict, q, pillar });

  const entries = summary
    ? filtered.map(({ id, name, url, category, pillar: entryPillar, verdict: entryVerdict, adapter }) => ({
        id,
        name,
        url,
        category,
        pillar: entryPillar,
        verdict: entryVerdict,
        ...(adapter ? { adapter } : {}),
      }))
    : filtered;

  return NextResponse.json(
    {
      success: true,
      updatedAt: report.updatedAt,
      stats: report.stats,
      verdicts: report.verdicts,
      pillars: report.pillars,
      total: filtered.length,
      filters: { verdict, pillar, q },
      entries,
      notice: report.notice,
    },
    {
      headers: {
        // Static catalogue: cheap to cache at the edge, and identical for every caller.
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    },
  );
}
