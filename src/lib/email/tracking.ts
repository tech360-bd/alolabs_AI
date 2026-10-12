// ALO Labs AIOS — Email Tracking System

import * as crypto from 'crypto';
import type { EmailTrackingEvent, EmailTrackingEventType } from './types';

// ─── 1x1 Transparent GIF (43 bytes) ──────────────────────────────────────────

const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// ─── Tracking Stats ───────────────────────────────────────────────────────────

interface MessageStats {
  opens: EmailTrackingEvent[];
  clicks: EmailTrackingEvent[];
  bounces: EmailTrackingEvent[];
  complaints: EmailTrackingEvent[];
  delivered: EmailTrackingEvent[];
}

interface TrackingRecord {
  messageId: string;
  events: EmailTrackingEvent[];
}

// ─── Tracking Service ─────────────────────────────────────────────────────────

export class EmailTrackingService {
  private readonly store: Map<string, TrackingRecord> = new Map();
  private readonly secretKey: string;

  constructor(secretKey?: string) {
    this.secretKey = secretKey || crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a tracking pixel data URL for embedding in HTML emails.
   * Returns the full <img> tag.
   */
  generateTrackingPixel(messageId: string): string {
    const token = this.generateToken(messageId, 'open');
    // Data URL for a 1x1 transparent GIF
    const gifBase64 = TRACKING_PIXEL_GIF.toString('base64');
    return `<img src="data:image/gif;base64,${gifBase64}" data-track-token="${token}" data-track-message="${messageId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />`;
  }

  /**
   * Generate a tracked link that records clicks before redirecting.
   * Returns the tracking URL (in production this would be your server endpoint).
   */
  generateTrackLink(messageId: string, url: string): string {
    const token = this.generateToken(messageId, url);
    // In production, this would be: https://yourdomain.com/t/c/{token}
    // For now, we return the original URL with tracking parameters embedded
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_et=${encodeURIComponent(token)}&_em=${encodeURIComponent(messageId)}`;
  }

  /**
   * Record an email open event from a tracking pixel load.
   */
  recordOpen(messageId: string, ip: string, userAgent: string): EmailTrackingEvent {
    return this.recordEvent(messageId, 'open', ip, userAgent);
  }

  /**
   * Record a link click event.
   */
  recordClick(messageId: string, link: string, ip: string): EmailTrackingEvent {
    return this.recordEvent(messageId, 'click', ip, undefined, link);
  }

  /**
   * Record a bounce event.
   */
  recordBounce(messageId: string, diagnostic: string): EmailTrackingEvent {
    const event = this.recordEvent(messageId, 'bounce');
    event.metadata = { diagnostic };
    return event;
  }

  /**
   * Record a complaint (spam report) event.
   */
  recordComplaint(messageId: string, feedbackType: string): EmailTrackingEvent {
    const event = this.recordEvent(messageId, 'complaint');
    event.metadata = { feedbackType };
    return event;
  }

  /**
   * Record a delivery confirmation.
   */
  recordDelivered(messageId: string, recipient: string): EmailTrackingEvent {
    const event = this.recordEvent(messageId, 'delivered');
    event.metadata = { recipient };
    return event;
  }

  /**
   * Get aggregated stats for a specific message.
   */
  async getStats(
    messageId: string
  ): Promise<{
    opens: number;
    clicks: number;
    bounces: number;
    complaints: number;
    delivered: number;
    uniqueOpens: number;
    uniqueClicks: number;
    firstOpenAt: Date | null;
    lastOpenAt: Date | null;
    firstClickAt: Date | null;
  }> {
    const record = this.store.get(messageId);
    if (!record) {
      return {
        opens: 0,
        clicks: 0,
        bounces: 0,
        complaints: 0,
        delivered: 0,
        uniqueOpens: 0,
        uniqueClicks: 0,
        firstOpenAt: null,
        lastOpenAt: null,
        firstClickAt: null,
      };
    }

    const stats = this.getMessageStats(record);

    return {
      opens: stats.opens.length,
      clicks: stats.clicks.length,
      bounces: stats.bounces.length,
      complaints: stats.complaints.length,
      delivered: stats.delivered.length,
      uniqueOpens: new Set(stats.opens.map((e) => e.ip).filter(Boolean)).size,
      uniqueClicks: new Set(stats.clicks.map((e) => e.link).filter(Boolean)).size,
      firstOpenAt: stats.opens.length > 0 ? stats.opens[0].timestamp : null,
      lastOpenAt: stats.opens.length > 0 ? stats.opens[stats.opens.length - 1].timestamp : null,
      firstClickAt: stats.clicks.length > 0 ? stats.clicks[0].timestamp : null,
    };
  }

  /**
   * Get all events for a specific message.
   */
  getEvents(messageId: string): EmailTrackingEvent[] {
    const record = this.store.get(messageId);
    return record ? [...record.events] : [];
  }

  /**
   * Verify a tracking token to prevent spoofing.
   */
  verifyToken(messageId: string, token: string): boolean {
    const expected = this.generateToken(messageId, 'open');
    return crypto.timingSafeEqual(
      Buffer.from(token, 'utf-8'),
      Buffer.from(expected, 'utf-8')
    );
  }

  /**
   * Get the raw tracking pixel GIF buffer (for serving as a response).
   */
  getTrackingPixelBuffer(): Buffer {
    return Buffer.from(TRACKING_PIXEL_GIF);
  }

  /**
   * Purge tracking data for a message (GDPR compliance).
   */
  purgeMessage(messageId: string): void {
    this.store.delete(messageId);
  }

  /**
   * Purge all tracking data.
   */
  purgeAll(): void {
    this.store.clear();
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  private recordEvent(
    messageId: string,
    type: EmailTrackingEventType,
    ip?: string,
    userAgent?: string,
    link?: string
  ): EmailTrackingEvent {
    let record = this.store.get(messageId);
    if (!record) {
      record = { messageId, events: [] };
      this.store.set(messageId, record);
    }

    const event: EmailTrackingEvent = {
      id: crypto.randomUUID(),
      messageId,
      type,
      timestamp: new Date(),
      ip,
      userAgent,
      link,
    };

    record.events.push(event);
    return event;
  }

  private getMessageStats(record: TrackingRecord): MessageStats {
    const stats: MessageStats = {
      opens: [],
      clicks: [],
      bounces: [],
      complaints: [],
      delivered: [],
    };

    for (const event of record.events) {
      switch (event.type) {
        case 'open':
          stats.opens.push(event);
          break;
        case 'click':
          stats.clicks.push(event);
          break;
        case 'bounce':
          stats.bounces.push(event);
          break;
        case 'complaint':
          stats.complaints.push(event);
          break;
        case 'delivered':
          stats.delivered.push(event);
          break;
      }
    }

    return stats;
  }

  private generateToken(messageId: string, payload: string): string {
    const data = `${messageId}:${payload}:${this.secretKey}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 24);
  }
}