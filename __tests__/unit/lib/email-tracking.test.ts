import { describe, expect, it } from 'vitest';
import { EmailTrackingService } from '@/lib/email/tracking';
import {
  formatSrt,
  formatVtt,
  normaliseSegments,
  srtTimestamp,
} from '@/lib/media-generation/transcribe';

describe('EmailTrackingService', () => {
  const service = new EmailTrackingService('test-secret-at-least-16-chars');

  it('is unconfigured without a secret', () => {
    const bare = new EmailTrackingService('');
    expect(bare.isConfigured()).toBe(false);
  });

  it('signs deterministically and verifies the signature', () => {
    const token = service.generateToken('msg-1', 'open');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(service.generateToken('msg-1', 'open')).toBe(token);
    expect(service.verifyToken('msg-1', token, 'open')).toBe(true);
  });

  it('rejects a token for another message, scope or a malformed value', () => {
    const token = service.generateToken('msg-1', 'open');
    expect(service.verifyToken('msg-2', token, 'open')).toBe(false);
    expect(service.verifyToken('msg-1', token, 'click')).toBe(false);
    expect(service.verifyToken('msg-1', 'not-a-token', 'open')).toBe(false);
    expect(service.verifyToken('msg-1', token.slice(0, 63), 'open')).toBe(false);
  });

  it('builds a hosted pixel URL, not a data URL', () => {
    const html = service.generateTrackingPixel('msg-1', 'https://app.example.com/');
    expect(html).toContain('src="https://app.example.com/api/email/track/open/');
    expect(html).toContain('.gif?m=msg-1');
    expect(html).not.toContain('data:image/gif');
  });

  it('refuses to build a token without configuration', () => {
    expect(() => new EmailTrackingService('').generateToken('msg-1')).toThrow(/EMAIL_TRACKING_SECRET/);
  });
});

describe('transcript helpers', () => {
  it('formats SRT timestamps with milliseconds', () => {
    expect(srtTimestamp(0)).toBe('00:00:00,000');
    expect(srtTimestamp(61.5)).toBe('00:01:01,500');
    expect(srtTimestamp(3661.042)).toBe('01:01:01,042');
    expect(srtTimestamp(Number.NaN)).toBe('00:00:00,000');
  });

  it('numbers SRT cues and drops empty segments', () => {
    const srt = formatSrt([
      { start: 0, end: 1.2, text: 'Hello' },
      { start: 1.2, end: 2, text: '   ' },
      { start: 2, end: 3.4, text: 'World' },
    ]);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:01,200\nHello\n\n2\n00:00:02,000 --> 00:00:03,400\nWorld\n');
  });

  it('starts WebVTT output with the header', () => {
    const vtt = formatVtt([{ start: 0, end: 1, text: 'Hi' }]);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.000');
  });

  it('normalises provider segments, sorts them and ignores junk', () => {
    const segments = normaliseSegments([
      { start: 2, end: 3, text: 'second' },
      { start: 'x', end: 3, text: 'bad' },
      null,
      { start: 0, end: 1, text: 'first' },
    ]);
    expect(segments).toEqual([
      { start: 0, end: 1, text: 'first' },
      { start: 2, end: 3, text: 'second' },
    ]);
  });
});
