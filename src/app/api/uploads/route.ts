import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { getStorage } from '@/lib/storage';

/**
 * /api/uploads — project file uploads (the Project Uploads page).
 *
 * GET  lists the caller's company uploads with pagination/search.
 * POST accepts multipart/form-data (`file`, optional `name`, `description`).
 *
 * Bytes go through the configured storage provider; metadata is stored in
 * Settings under `upload:file:<id>`. Nothing is accepted without real bytes.
 */

const PREFIX = 'upload:file:';
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export interface UploadRecord {
  /** URL-safe record id (the storage key contains slashes and cannot be a path segment). */
  id: string;
  /** Storage provider key. */
  key: string;
  name: string;
  description: string;
  size: number;
  mimetype: string;
  type: string;
  url: string;
  folder: string;
  companyId: string;
  uploadedBy: string;
  createdAt: string;
}

async function listUploads(companyId: string): Promise<UploadRecord[]> {
  const rows = await db.settings.findMany({
    where: { key: { startsWith: PREFIX } },
    orderBy: { createdAt: 'desc' },
  });
  const out: UploadRecord[] = [];
  for (const row of rows) {
    try {
      const record = JSON.parse(row.value) as UploadRecord;
      if (record.companyId === companyId) out.push(record);
    } catch {
      // ignore malformed records
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const search = (searchParams.get('search') || '').toLowerCase();

    const all = await listUploads(user.companyId);
    const filtered = search
      ? all.filter(
          (u) =>
            u.name.toLowerCase().includes(search) ||
            (u.description || '').toLowerCase().includes(search),
        )
      : all;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return NextResponse.json({ data, total: filtered.length, page, limit });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('Uploads list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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
        { error: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB upload limit` },
        { status: 413 },
      );
    }

    const overrideName = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim().slice(0, 1000);

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorage();
    const uploaded = await storage.upload(buffer, file.name || 'upload.bin', {
      folder: 'project-uploads',
      companyId: user.companyId,
      uploadedBy: user.userId,
      ...(file.type ? { mimeType: file.type } : {}),
    });

    const record: UploadRecord = {
      id: randomUUID(),
      key: uploaded.id,
      name: overrideName || uploaded.originalName,
      description,
      size: uploaded.size,
      mimetype: uploaded.mimeType,
      type: uploaded.mimeType,
      url: uploaded.url,
      folder: uploaded.folder,
      companyId: user.companyId,
      uploadedBy: user.userId,
      createdAt: new Date().toISOString(),
    };

    await db.settings.create({
      data: { id: randomUUID(), key: `${PREFIX}${record.id}`, value: JSON.stringify(record), type: 'json' },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && /empty|maximum size|Invalid file key/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to store the uploaded file' }, { status: 500 });
  }
}
