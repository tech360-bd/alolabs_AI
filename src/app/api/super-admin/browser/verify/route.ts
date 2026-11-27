import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/api-auth';
import { authFailure } from '@/lib/api/route-errors';
import { checkEndpointLimit } from '@/lib/security/rate-limiter';
import { writeAuditEvent } from '@/lib/audit-events';
import { browserCapability, verifyPage, withoutScreenshot } from '@/lib/browser/verify';
import { assertNavigableUrl } from '@/lib/browser/navigation-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * /api/super-admin/browser/verify — independent browser verification.
 *
 * `GET` reports whether a headless browser exists in this deployment. `POST`
 * opens one URL in an isolated context and returns evidence (status, title,
 * console errors, failed requests, link audit, screenshot presence).
 *
 * Security: `super_admin` only, rate limited, and every URL — including each
 * redirect hop — is checked by the SSRF policy before navigation. The screenshot
 * is deliberately *not* returned inline: base64 page captures are large and can
 * contain customer data, so the response reports `hasScreenshot` and the bytes
 * stay server-side for the run's evidence record.
 */

const VerifySchema = z
  .object({
    url: z.string().trim().min(1).max(2_048),
    captureScreenshot: z.boolean().optional(),
    timeoutMs: z.number().int().min(2_000).max(60_000).optional(),
    viewport: z
      .object({ width: z.number().int().min(320).max(3_840), height: z.number().int().min(240).max(2_160) })
      .optional(),
  })
  .strict();

export async function GET() {
  try {
    await requireRole('super_admin');
    const capability = await browserCapability();
    return NextResponse.json({ success: true, capability });
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;
    return NextResponse.json({ error: 'Capability check failed.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('super_admin');

    const limit = await checkEndpointLimit('super-admin-browser-verify', user.userId);
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many browser verifications. Wait before trying again.' }, { status: 429 });
    }

    const parsed = VerifySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid verification request', issues: parsed.error.issues.map((issue) => issue.message) },
        { status: 400 },
      );
    }

    // Checked before the browser is launched so a blocked target costs nothing and
    // leaves a clean audit trail.
    const decision = assertNavigableUrl(parsed.data.url);
    if (!decision.ok) {
      await writeAuditEvent({
        action: 'browser.verify.blocked',
        resource: 'browser-navigation',
        resourceId: decision.hostname ?? undefined,
        companyId: user.companyId ?? undefined,
        actorUserId: user.userId,
        details: { code: decision.code, href: parsed.data.url.slice(0, 300) },
      });
      return NextResponse.json(
        { error: decision.reason, code: decision.code },
        { status: 400 },
      );
    }

    const evidence = await verifyPage({
      url: decision.url,
      ...(parsed.data.captureScreenshot === undefined ? {} : { captureScreenshot: parsed.data.captureScreenshot }),
      ...(parsed.data.timeoutMs ? { timeoutMs: parsed.data.timeoutMs } : {}),
      ...(parsed.data.viewport ? { viewport: parsed.data.viewport } : {}),
    });

    await writeAuditEvent({
      action: 'browser.verify.completed',
      resource: 'browser-navigation',
      resourceId: decision.hostname,
      companyId: user.companyId ?? undefined,
      actorUserId: user.userId,
      details: {
        verdict: evidence.verdict,
        status: evidence.status ?? null,
        consoleErrors: evidence.consoleErrors?.length ?? 0,
        failedRequests: evidence.failedRequests?.length ?? 0,
        durationMs: evidence.durationMs,
      },
    });

    return NextResponse.json({
      success: true,
      capability: await browserCapability(),
      evidence: withoutScreenshot(evidence),
    });
  } catch (error) {
    const failure = authFailure(error);
    if (failure) return failure;
    console.error('[super-admin/browser/verify] failed:', error);
    return NextResponse.json({ error: 'Browser verification failed.' }, { status: 500 });
  }
}
