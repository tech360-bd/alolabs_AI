import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { getStorage } from '@/lib/storage';

/**
 * POST /api/media/upload — multipart upload into the Media Library.
 *
 * Accepts `file` (required) and `folder` (optional). The bytes are written
 * through the configured storage provider and a registry record is stored in
 * Settings under `media:file:<id>`, matching the shape returned by
 * GET /api/media. Ownership (companyId) is recorded so the file can be served
 * back through /api/storage/files/:id.
 */

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MiB per media-library upload

type MediaKind = 'image' | 'video' | 'audio' | 'document';

function mediaKind(mimeType: string, filename: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf' || /\.(docx?|xlsx?|pptx?|txt|md|csv|json)$/i.test(filename)) return 'document';
  return 'document';
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A "file" field is required' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB media-library limit` },
        { status: 413 },
      );
    }

    const rawFolder = String(form.get('folder') ?? 'uploads').trim();
    const folder = /^[A-Za-z0-9._-]{1,64}$/.test(rawFolder) ? rawFolder : 'uploads';

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorage();
    const uploaded = await storage.upload(buffer, file.name || 'upload.bin', {
      folder,
      companyId: user.companyId,
      uploadedBy: user.userId,
      ...(file.type ? { mimeType: file.type } : {}),
    });

    const now = new Date().toISOString();
    const record = {
      id: uploaded.id,
      name: uploaded.originalName,
      url: uploaded.url,
      size: uploaded.size,
      type: mediaKind(uploaded.mimeType, uploaded.originalName),
      mimeType: uploaded.mimeType,
      folder,
      tags: [] as string[],
      thumbnailUrl: null as string | null,
      uploadedBy: user.userId,
      companyId: user.companyId,
      checksum: uploaded.checksum,
      createdAt: now,
      updatedAt: now,
    };

    await db.settings.create({
      data: {
        id: randomUUID(),
        key: `media:file:${uploaded.id}`,
        value: JSON.stringify(record),
        type: 'json',
      },
    });

    await db.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'media_upload',
          resource: 'media',
          details: JSON.stringify({ id: uploaded.id, size: uploaded.size, mimeType: uploaded.mimeType, folder }),
        },
      })
      .catch(() => undefined);

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 },
      );
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && /exceeds the maximum size|Cannot upload an empty file|Invalid file key/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Media upload error:', error);
    return NextResponse.json({ error: 'Failed to store the uploaded file' }, { status: 500 });
  }
}
