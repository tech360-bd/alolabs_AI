import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { writeAuditEvent } from '@/lib/audit-events';
import { assessRepository } from '@/lib/github/assess';
import { parseRepositoryReference } from '@/lib/github/parse';
import { LINK_COVERAGE } from '@/lib/link-coverage/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * /api/super-admin/repository/assess — GitHub repository intelligence.
 *
 * Reads the repository through the public GitHub API and returns a structured
 * assessment: metadata, licence, activity, manifest, install scripts, structure,
 * advisories (only when a token is configured) and the verdict rule that follows
 * from the findings. Nothing is integrated here — this is the inspection that must
 * happen before a human decides to.
 *
 * `POST` is `super_admin`-only and rate limited; the token, when present, never
 * appears in a response, log or audit row.
 */

const BodySchema = z
  .object({ repository: z.string().trim().min(1).max(2_048) })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('super_admin');

    const limit = await checkEndpointLimit('super-admin-repository-assess', user.userId);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many repository assessments. Wait before trying again.' }, { status: 429 });
    }

    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.issues.map((issue) => issue.message) },
        { status: 400 },
      );
    }

    const reference = parseRepositoryReference(parsed.data.repository);
    if (!reference.ok) {
      return NextResponse.json({ error: reference.reason }, { status: 400 });
    }

    // Capabilities we already have, so the assessment can say "you already do this".
    const knownCapabilities = LINK_COVERAGE.flatMap((entry) => {
      try {
        const url = new URL(entry.url);
        const segments = url.pathname.split('/').filter(Boolean);
        const name = segments[segments.length - 1] ?? '';
        return [name.replace(/\.git$/, ''), ...(entry.id ? [entry.id] : [])];
      } catch {
        return [];
      }
    }).filter((name) => name.length >= 3);

    const assessment = await assessRepository(parsed.data.repository, {
      ...(process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {}),
      knownCapabilities,
    });

    await writeAuditEvent({
      action: 'repository.assessed',
      resource: 'github-repository',
      resourceId: reference.ref.fullName,
      ...(user.companyId ? { companyId: user.companyId } : {}),
      actorUserId: user.userId,
      details: {
        verdict: assessment.verdict,
        findings: assessment.findings.length,
        critical: assessment.findings.filter((finding) => finding.severity === 'critical').length,
        licence: assessment.licence?.spdx ?? null,
      },
    });

    return NextResponse.json({ success: true, assessment });
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;
    console.error('[super-admin/repository/assess] failed:', error);
    return NextResponse.json({ error: 'The repository could not be assessed.' }, { status: 500 });
  }
}
