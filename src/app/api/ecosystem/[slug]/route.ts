import { NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildStack, findStackEntry } from '@/lib/ecosystem/stack';
import { stackAdapters } from '@/lib/ecosystem/adapters';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ecosystem/[slug] — one stack-register row, with its evidence checked.
 *
 * Every evidence path is re-checked against the working tree, because the whole
 * point of the registry is that a claim can be disproved by opening a file. When
 * a path no longer exists the response says so per path (`verified: false`)
 * instead of quietly returning a stale claim.
 *
 * `slug` is the registry id, e.g. `signudoc`, `litellm-org`, `vllm`.
 */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const report = buildStack({ adapters: stackAdapters() });
  const entry = findStackEntry(slug, report.entries);

  if (!entry) {
    return NextResponse.json(
      {
        success: false,
        error: 'not_found',
        message: `No stack-register row with id "${slug}".`,
        available: report.entries.map((item) => item.id),
      },
      { status: 404 },
    );
  }

  // Standalone builds have no working tree; report `null` rather than "missing".
  const treeReadable = existsSync(join(process.cwd(), 'src'));
  const evidence = entry.evidence.map((item) => ({
    ...item,
    verified: treeReadable ? existsSync(join(process.cwd(), item.path)) : null,
  }));

  return NextResponse.json(
    {
      success: true,
      updatedAt: report.updatedAt,
      entry: { ...entry, evidence },
      pillar: report.pillars.find((pillar) => pillar.id === entry.pillar.id) ?? null,
      related: report.entries
        .filter((item) => item.pillar.id === entry.pillar.id && item.id !== entry.id)
        .map((item) => ({ id: item.id, name: item.name, verdict: item.verdict })),
      notice: report.notice,
    },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } },
  );
}
