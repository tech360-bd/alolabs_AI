import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyAuth } from '@/lib/api-auth';

interface MediaFile {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  mimeType: string;
  folder: string;
  tags: string[];
  thumbnailUrl: string | null;
  uploadedBy: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

function readFile(value: string): MediaFile | null {
  try {
    const parsed = JSON.parse(value) as Partial<MediaFile>;
    if (typeof parsed.id !== 'string' || typeof parsed.companyId !== 'string') return null;
    return parsed as MediaFile;
  } catch {
    return null;
  }
}

async function getCompanyMediaFiles(companyId: string): Promise<MediaFile[]> {
  const records = await db.settings.findMany({ where: { key: { startsWith: 'media:file:' } } });
  return records.flatMap((record) => {
    const file = readFile(record.value);
    return file?.companyId === companyId ? [file] : [];
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status });
}

// GET: List only media owned by the authenticated company.
export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '24', 10) || 24));
    const search = (request.nextUrl.searchParams.get('search') || '').toLowerCase();
    const folder = request.nextUrl.searchParams.get('folder') || '';
    const type = request.nextUrl.searchParams.get('type') || '';
    let files = await getCompanyMediaFiles(user.companyId);

    if (folder && folder !== 'all') {
      files = ['image', 'video', 'document'].includes(folder)
        ? files.filter((file) => file.type === folder)
        : files.filter((file) => file.folder === folder);
    }
    if (type && type !== 'all') files = files.filter((file) => file.type === type);
    if (search) files = files.filter((file) => file.name.toLowerCase().includes(search) || file.tags.some((tag) => tag.toLowerCase().includes(search)));

    const total = files.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return NextResponse.json({ data: files.slice((page - 1) * limit, page * limit), total, page, limit, totalPages });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE: Delete only records owned by this company.
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json();
    const ids = body && typeof body === 'object' ? (body as { ids?: unknown }).ids : undefined;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: 'ids must be a non-empty string array with at most 100 entries' }, { status: 400 });
    }
    let deleted = 0;
    for (const id of ids as string[]) {
      const setting = await db.settings.findUnique({ where: { key: `media:file:${id}` } });
      const file = setting ? readFile(setting.value) : null;
      if (!setting || file?.companyId !== user.companyId) continue;
      await db.settings.delete({ where: { key: setting.key } });
      deleted++;
    }
    return NextResponse.json({ data: { deleted, ids }, message: `Deleted ${deleted} file(s)` });
  } catch (error) {
    return errorResponse(error);
  }
}

// PUT: Update tags or folder only for records owned by this company.
export async function PUT(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json();
    const data = body && typeof body === 'object' ? body as { ids?: unknown; folder?: unknown; tags?: unknown } : {};
    if (!Array.isArray(data.ids) || data.ids.length === 0 || data.ids.length > 100 || !data.ids.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: 'ids must be a non-empty string array with at most 100 entries' }, { status: 400 });
    }
    if (data.folder !== undefined && (typeof data.folder !== 'string' || data.folder.length > 64)) return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
    if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.length > 50 || !data.tags.every((tag) => typeof tag === 'string' && tag.length <= 40))) {
      return NextResponse.json({ error: 'Invalid tags' }, { status: 400 });
    }

    let updated = 0;
    for (const id of data.ids as string[]) {
      const setting = await db.settings.findUnique({ where: { key: `media:file:${id}` } });
      const file = setting ? readFile(setting.value) : null;
      if (!setting || !file || file.companyId !== user.companyId) continue;
      const nextFile = { ...file };
      if (typeof data.folder === 'string') nextFile.folder = data.folder;
      if (Array.isArray(data.tags)) nextFile.tags = [...new Set([...file.tags, ...(data.tags as string[])])];
      nextFile.updatedAt = new Date().toISOString();
      await db.settings.update({ where: { key: setting.key }, data: { value: JSON.stringify(nextFile) } });
      updated++;
    }
    return NextResponse.json({ data: { updated, ids: data.ids }, message: `Updated ${updated} file(s)` });
  } catch (error) {
    return errorResponse(error);
  }
}
