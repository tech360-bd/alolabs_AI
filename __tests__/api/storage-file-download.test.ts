/**
 * GET /api/storage/files/:id — download semantics.
 *
 * The route serves *untrusted user uploads*, so its default must stay
 * "opaque bytes, forced download". These tests pin both halves of that rule:
 * the XSS defence is intact for active content, and the narrow audio/video
 * exception that lets voice TTS playback stream works.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireCompanyAuth = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  requireCompanyAuth: (...args: unknown[]) => mockRequireCompanyAuth(...args),
}));

const mockStorageDownload = vi.fn();
const mockStorageGetMetadata = vi.fn();

vi.mock('@/lib/storage', () => ({
  getStorage: () => ({
    download: (...args: unknown[]) => mockStorageDownload(...args),
    getMetadata: (...args: unknown[]) => mockStorageGetMetadata(...args),
    verifySignedUrl: vi.fn().mockReturnValue(true),
  }),
  StorageFactory: { createStorage: vi.fn() },
  LocalStorageProvider: vi.fn(),
}));

// NOTE: next/server is deliberately NOT mocked. The route constructs a real
// NextResponse and we assert on real headers; stubbing it would test the mock
// instead of the response the browser receives.

import { GET } from '@/app/api/storage/files/[id]/route';

async function call(key: string, search = '') {
  const request = new Request(`http://localhost/api/storage/files/${encodeURIComponent(key)}${search}`) as never;
  return GET(request, { params: Promise.resolve({ id: encodeURIComponent(key) }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCompanyAuth.mockResolvedValue({ userId: 'user-1', companyId: 'tenant-1' });
  mockStorageDownload.mockResolvedValue(Buffer.from('bytes'));
  mockStorageGetMetadata.mockResolvedValue({ id: 'k', companyId: 'tenant-1', mimeType: 'audio/wav' });
});

describe('GET /api/storage/files/[id] — content disposition', () => {
  it('serves audio inline with its recorded type so <audio> can play it', async () => {
    mockStorageGetMetadata.mockResolvedValue({ id: 'k', companyId: 'tenant-1', mimeType: 'audio/wav' });
    const response = await call('voice/tts/x.wav');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(response.headers.get('content-disposition')).toMatch(/^inline/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('serves video inline too', async () => {
    mockStorageGetMetadata.mockResolvedValue({ id: 'k', companyId: 'tenant-1', mimeType: 'video/mp4' });
    const response = await call('voice/clip.mp4');
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-disposition')).toMatch(/^inline/);
  });

  it('does NOT serve html inline — a stored .html upload must download, not render', async () => {
    mockStorageGetMetadata.mockResolvedValue({ id: 'k', companyId: 'tenant-1', mimeType: 'text/html' });
    const response = await call('uploads/evil.html');
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('does NOT serve svg inline — svg can carry script', async () => {
    mockStorageGetMetadata.mockResolvedValue({ id: 'k', companyId: 'tenant-1', mimeType: 'image/svg+xml' });
    const response = await call('uploads/evil.svg');
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('ignores a disguised extension when the recorded type is not media', async () => {
    // Named .mp3 but stored as text/html: the recorded type decides.
    mockStorageGetMetadata.mockResolvedValue({ id: 'k', companyId: 'tenant-1', mimeType: 'text/html' });
    const response = await call('uploads/payload.mp3');
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('falls back to download when no mime type was recorded', async () => {
    mockStorageGetMetadata.mockResolvedValue({ id: 'k', companyId: 'tenant-1' });
    const response = await call('uploads/unknown.bin');
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('still refuses another tenant\'s file', async () => {
    mockStorageGetMetadata.mockResolvedValue({ id: 'k', companyId: 'tenant-2', mimeType: 'audio/wav' });
    const response = await call('voice/tts/other.wav');
    expect(response.status).toBe(404);
  });
});
