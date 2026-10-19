import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyAuth } from '@/lib/api-auth';

interface FolderRecord {
  id: string;
  name: string;
  type: string;
  companyId: string;
  createdAt: string;
}

function folderKey(companyId: string, name: string) {
  return `media:folder:${companyId}:${name}`;
}

function safeFolderName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._ -]{0,63}$/.test(name) ? name : null;
}

function parseFolder(value: string, companyId: string): FolderRecord | null {
  try {
    const folder = JSON.parse(value) as Partial<FolderRecord>;
    if (folder.companyId !== companyId || typeof folder.name !== 'string' || typeof folder.createdAt !== 'string') return null;
    return { id: folder.name, name: folder.name, type: 'custom', companyId, createdAt: folder.createdAt };
  } catch {
    return null;
  }
}

async function getCompanyFolders(companyId: string): Promise<FolderRecord[]> {
  const records = await db.settings.findMany({ where: { key: { startsWith: `media:folder:${companyId}:` } } });
  return records.flatMap((record) => {
    const parsed = parseFolder(record.value, companyId);
    return parsed ? [parsed] : [];
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function getCompanyFileCounts(companyId: string): Promise<Record<string, number>> {
  const records = await db.settings.findMany({ where: { key: { startsWith: 'media:file:' } } });
  const counts: Record<string, number> = { all: 0, image: 0, video: 0, document: 0, other: 0 };
  for (const record of records) {
    try {
      const file = JSON.parse(record.value) as { companyId?: string; type?: string; folder?: string };
      if (file.companyId !== companyId) continue;
      counts.all++;
      if (file.type) counts[file.type] = (counts[file.type] || 0) + 1;
      if (file.folder && !['all', 'image', 'video', 'document'].includes(file.folder)) counts[file.folder] = (counts[file.folder] || 0) + 1;
    } catch {
      // Ignore malformed registry rows.
    }
  }
  return counts;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status });
}

export async function GET() {
  try {
    const user = await requireCompanyAuth();
    const [folders, counts] = await Promise.all([getCompanyFolders(user.companyId), getCompanyFileCounts(user.companyId)]);
    return NextResponse.json({ data: folders.map((folder) => ({
      id: folder.name,
      name: folder.name,
      type: 'custom' as const,
      count: counts[folder.name] || 0,
      createdAt: folder.createdAt,
    })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json();
    const name = safeFolderName(body?.name);
    if (!name) return NextResponse.json({ error: 'name must contain 1-64 letters, digits, spaces, dots, underscores or hyphens' }, { status: 400 });
    const key = folderKey(user.companyId, name);
    const existing = await db.settings.findUnique({ where: { key } });
    if (existing) return NextResponse.json({ error: 'Folder already exists' }, { status: 409 });
    const folder = { id: name, name, type: 'custom', companyId: user.companyId, createdBy: user.userId, createdAt: new Date().toISOString() };
    await db.settings.create({ data: { key, value: JSON.stringify(folder), type: 'json' } });
    return NextResponse.json({ data: folder }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json();
    const oldName = safeFolderName(body?.oldName);
    const newName = safeFolderName(body?.newName);
    if (!oldName || !newName) return NextResponse.json({ error: 'oldName and newName must be valid folder names' }, { status: 400 });
    const oldKey = folderKey(user.companyId, oldName);
    const newKey = folderKey(user.companyId, newName);
    const [oldSetting, newSetting] = await Promise.all([
      db.settings.findUnique({ where: { key: oldKey } }),
      db.settings.findUnique({ where: { key: newKey } }),
    ]);
    if (!oldSetting || !parseFolder(oldSetting.value, user.companyId)) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    if (newSetting) return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 });

    const records = await db.settings.findMany({ where: { key: { startsWith: 'media:file:' } } });
    const now = new Date().toISOString();
    await db.$transaction(async (transaction) => {
      for (const record of records) {
        try {
          const file = JSON.parse(record.value) as { companyId?: string; folder?: string; updatedAt?: string };
          if (file.companyId !== user.companyId || file.folder !== oldName) continue;
          await transaction.settings.update({ where: { key: record.key }, data: { value: JSON.stringify({ ...file, folder: newName, updatedAt: now }) } });
        } catch {
          // Skip malformed rows; they are not tenant-visible.
        }
      }
      const folder = { id: newName, name: newName, type: 'custom', companyId: user.companyId, createdBy: user.userId, createdAt: now };
      await transaction.settings.create({ data: { key: newKey, value: JSON.stringify(folder), type: 'json' } });
      await transaction.settings.delete({ where: { key: oldKey } });
    });
    return NextResponse.json({ data: { id: newName, name: newName, type: 'custom', createdAt: now } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json();
    const name = safeFolderName(body?.name);
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const key = folderKey(user.companyId, name);
    const folder = await db.settings.findUnique({ where: { key } });
    if (!folder || !parseFolder(folder.value, user.companyId)) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    const records = await db.settings.findMany({ where: { key: { startsWith: 'media:file:' } } });
    const now = new Date().toISOString();
    await db.$transaction(async (transaction) => {
      for (const record of records) {
        try {
          const file = JSON.parse(record.value) as { companyId?: string; folder?: string; updatedAt?: string };
          if (file.companyId !== user.companyId || file.folder !== name) continue;
          await transaction.settings.update({ where: { key: record.key }, data: { value: JSON.stringify({ ...file, folder: 'all', updatedAt: now }) } });
        } catch {
          // Skip malformed rows.
        }
      }
      await transaction.settings.delete({ where: { key } });
    });
    return NextResponse.json({ data: { deleted: true, name }, message: `Folder "${name}" deleted. Files moved to root.` });
  } catch (error) {
    return errorResponse(error);
  }
}
