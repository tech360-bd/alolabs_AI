// ALO Labs AIOS — Email open tracking
//
// The previous implementation embedded a *data URL* pixel, which never
// contacts a server and therefore can never record an open, and kept events in
// a per-instance Map that vanished with the process. This version signs a
// message id with HMAC and points the pixel at a real route:
//
//   GET /api/email/track/open/<token>.gif?m=<messageId>
//
// The route verifies the signature and writes an `email_open` audit row.
// Without EMAIL_TRACKING_SECRET the service reports `isConfigured() === false`
// and the send route refuses to claim tracking is enabled.

import * as crypto from 'crypto';

/** 1×1 transparent GIF (43 bytes). */
const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export class EmailTrackingService {
  private readonly secretKey: string | null;

  constructor(secretKey?: string) {
    this.secretKey = secretKey ?? process.env.EMAIL_TRACKING_SECRET ?? null;
  }

  isConfigured(): boolean {
    return Boolean(this.secretKey && this.secretKey.length >= 16);
  }

  /**
   * HMAC over the message id and purpose. The scope stops an open token from
   * being replayed as a click token.
   */
  generateToken(messageId: string, scope: 'open' | 'click' = 'open'): string {
    if (!this.secretKey) throw new Error('Configuration required: EMAIL_TRACKING_SECRET');
    return crypto.createHmac('sha256', this.secretKey).update(`${scope}:${messageId}`).digest('hex');
  }

  verifyToken(messageId: string, token: string, scope: 'open' | 'click' = 'open'): boolean {
    if (!this.isConfigured() || typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return false;
    const expected = this.generateToken(messageId, scope);
    const a = Buffer.from(token.toLowerCase(), 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Hosted pixel. `baseUrl` must be absolute (the route is called from an
   * email client, never from this app's own origin).
   */
  generateTrackingPixel(messageId: string, baseUrl: string): string {
    const token = this.generateToken(messageId, 'open');
    const origin = baseUrl.replace(/\/+$/, '');
    return (
      `<img src="${origin}/api/email/track/open/${token}.gif?m=${encodeURIComponent(messageId)}" ` +
      'width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />'
    );
  }

  getTrackingPixelBuffer(): Buffer {
    return Buffer.from(TRACKING_PIXEL_GIF);
  }
}

export const TRACKING_GIF = TRACKING_PIXEL_GIF;
