import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { enforceGovernance } from '@/lib/governance/runtime';
import { writeAuditEvent } from '@/lib/audit-events';
import { analyzePublicPage, validateResearchUrl } from '@/lib/research/public-page';
import { listResearchReports, saveResearchReport } from '@/lib/research/research-store';

export const dynamic = 'force-dynamic';

const AnalyzeSchema = z.object({
  url: z.string().trim().min(1).max(2_048),
  save: z.boolean().default(false),
  note: z.string().trim().max(500).optional(),
}).strict();

/**
 * GET /api/research/analyze — recent research reports for the caller's company.
 */
export async function GET() {
  try {
    const actor = await requireCompanyAuth();
    const reports = await listResearchReports(actor.companyId, 10);
    return NextResponse.json({ success: true, reports });
  } catch (error) {
    return authFailure(error) ?? NextResponse.json({ error: 'Could not list research reports' }, { status: 500 });
  }
}

/**
 * POST /api/research/analyze — analyse one public page (and optionally save it).
 *
 * Governance runs before any network activity, so an emergency stop or a policy
 * denial prevents the fetch rather than being logged after it.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireCompanyAuth();

    const rateLimit = await checkEndpointLimit('/api/research/analyze', actor.userId);
    if (!rateLimit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

    const parsed = AnalyzeSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const validated = validateResearchUrl(parsed.data.url);
    if (!validated.ok || !validated.url) {
      return NextResponse.json({ error: `Invalid URL: ${validated.reason}` }, { status: 400 });
    }

    const governance = await enforceGovernance({
      action: 'Analyse public web page',
      actionClass: 'read.public',
      resource: `research:${new URL(validated.url).host}`,
      companyId: actor.companyId,
      callerCompanyId: actor.companyId,
      actor: {
        userId: actor.userId,
        role: 'standard_user',
        companyId: actor.companyId,
        agentId: 'research-agent',
      },
      surface: 'customer_workspace',
      evidence: { consentRecorded: true },
    });
    if (governance.outcome === 'deny') {
      return NextResponse.json(
        { error: 'Blocked by governance policy', reasons: governance.explanation ? [governance.explanation] : [] },
        { status: 403 },
      );
    }
    if (governance.outcome === 'require_approval') {
      return NextResponse.json(
        {
          error: 'This analysis requires approval before it can run',
          approvers: governance.requiredApprovers,
          reason: governance.explanation,
        },
        { status: 409 },
      );
    }

    // Every research request is attributable to an actor and a tenant before the
    // first outbound byte leaves the server.
    try {
      await writeAuditEvent({
        actorUserId: actor.userId,
        companyId: actor.companyId,
        action: 'research.analyze.request',
        resource: 'research',
        details: { url: validated.url, save: parsed.data.save, actorRole: actor.role },
      });
    } catch (error) {
      console.error('[Research] request audit failed:', error);
      return NextResponse.json({ error: 'Could not record the research request in the audit trail' }, { status: 500 });
    }

    let analysis;
    try {
      analysis = await analyzePublicPage(validated.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research failed';
      const status = /Blocked by network safety policy/i.test(message) ? 403 : /redirect/i.test(message) ? 400 : 502;
      return NextResponse.json({ error: message }, { status });
    }

    let saved: { id: string; checksum: string } | null = null;
    if (parsed.data.save) {
      saved = await saveResearchReport({
        companyId: actor.companyId,
        createdBy: actor.userId,
        analysis,
        note: parsed.data.note ?? null,
      });
      try {
        await writeAuditEvent({
          actorUserId: actor.userId,
          companyId: actor.companyId,
          action: 'research.report.save',
          resource: 'research',
          details: {
            artifactId: saved.id,
            finalUrl: analysis.finalUrl,
            status: analysis.status,
            sha256: analysis.sha256,
          },
        });
      } catch (error) {
        // The report exists; reporting the audit failure is better than claiming
        // the request was fully recorded.
        console.error('[Research] save audit failed:', error);
        return NextResponse.json(
          { error: 'Report saved but the audit event could not be recorded', saved },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      saved,
      // Research is HTTP-level verification only; never claim rendered-DOM checks.
      verification: {
        level: 'http_fetch',
        javascriptRendered: false,
        evidence: {
          finalUrl: analysis.finalUrl,
          status: analysis.status,
          fetchedAt: analysis.fetchedAt,
          bytes: analysis.bytes,
          sha256: analysis.sha256,
          robots: analysis.access.robots,
        },
      },
    });
  } catch (error) {
    return authFailure(error) ?? NextResponse.json({ error: 'Research failed' }, { status: 500 });
  }
}
