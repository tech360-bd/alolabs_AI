import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { getStorage } from '@/lib/storage';

/**
 * /api/storage/files/:id — download a private file (authenticated).
 *
 * The id is the storage key (URL-encoded, may contain slashes). Access is
 * authenticated; when `expires` + `sig` query params are present they must
 * verify against the provider's HMAC signature (time-limited links).
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCompanyAuth();
    const { id } = await params;
    const key = decodeURIComponent(id);
    const q = new URL(request.url).searchParams;
    const expires = q.get('expires');
    const sig = q.get('sig');

    const storage = getStorage();
    const metadata = await storage.getMetadata(key);
    if (!metadata || metadata.companyId !== user.companyId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Signed links: verify expiry + signature when present.
    if (expires && sig) {
      const valid = storage.verifySignedUrl(key, parseInt(expires, 10), sig);
      if (!valid) {
        return NextResponse.json({ error: 'Link expired or invalid' }, { status: 403 });
      }
    }

    const buffer = await storage.download(key);

    // Uploaded files are untrusted, so the default stays "download as opaque
    // bytes" (with nosniff) — that is what stops a stored-XSS attack via an
    // uploaded .html/.svg. Audio and video are the one exception: those types
    // cannot execute script, and the voice product needs them to stream into a
    // <audio> element rather than download. The allowlist is by prefix on the
    // RECORDED mime type, never on the file extension, so a caller cannot opt
    // in by naming a file .mp3.
    const recorded = typeof metadata.mimeType === 'string' ? metadata.mimeType.toLowerCase() : '';
    const inlineMedia = /^(audio|video)\/(wav|wave|x-wav|mpeg|mp3|mp4|ogg|opus|webm|aac|flac)$/.test(recorded);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': inlineMedia ? recorded : 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${inlineMedia ? 'inline' : 'attachment'}; filename="${key.split('/').pop() ?? 'file'}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && error.message === 'File not found') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'Invalid file key') {
      return NextResponse.json({ error: 'Invalid file key' }, { status: 400 });
    }
    console.error('[GET /api/storage/files/:id]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
