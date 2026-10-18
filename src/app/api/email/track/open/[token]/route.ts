import { NextRequest } from 'next/server';
import { EmailTrackingService, TRACKING_GIF } from '@/lib/email/tracking';
import { recordTrackingEvent } from '@/lib/email/tracking-store';

/**
 * GET /api/email/track/open/:token.gif?m=<messageId>
 *
 * Public endpoint (email clients cannot send an Authorization header).
 * Always answers with the 1×1 GIF so a broken token never shows a broken
 * image; the event is only recorded when the HMAC verifies.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await context.params;
  const messageId = new URL(request.url).searchParams.get('m') ?? '';
  const token = rawToken.replace(/\.gif$/i, '');

  const gif = new Response(new Uint8Array(TRACKING_GIF), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRACKING_GIF.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
    },
  });

  if (!messageId || messageId.length > 200) return gif;

  const service = new EmailTrackingService();
  if (!service.isConfigured() || !service.verifyToken(messageId, token, 'open')) return gif;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    await recordTrackingEvent({ messageId, type: 'open', ...(ip ? { ip } : {}), ...(userAgent ? { userAgent } : {}) });
  } catch (error) {
    // Never fail the image because analytics could not be written.
    console.error('Email open tracking error:', error);
  }

  return gif;
}
