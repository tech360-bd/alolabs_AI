import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { getStorage } from '@/lib/storage';

const PREFIX = 'upload:file:';

/**
 * /api/uploads/:id — read or delete one project upload.
 *
 * The Settings row is the authorisation record: only the owning company may
 * read or delete, and deletion removes both the metadata row and the stored
 * bytes. A missing row yields 404 rather than pretending the delete worked.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAuth();
    const { id } = await context.params;

    const key = `${PREFIX}${decodeURIComponent(id)}`;
    const row = await db.settings.findUnique({ where: { key } });
    if (!row) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });

    let record: { companyId?: string; key?: string } = {};
    try {
      record = JSON.parse(row.value) as { companyId?: string; key?: string };
    } catch {
      return NextResponse.json({ error: 'Upload record is corrupt' }, { status: 500 });
    }
    if (record.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    // Storage first: if bytes cannot be removed we keep the row so the delete
    // can be retried, instead of leaving an orphaned object behind. Older rows
    // stored the storage key as their id, so fall back to it.
    const storageKey = record.key ?? decodeURIComponent(id);
    if (await getStorage().getMetadata(storageKey)) {
      await getStorage().delete(storageKey);
    }
    await db.settings.delete({ where: { key } });

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Upload delete error:', error);
    return NextResponse.json({ error: 'Failed to delete the upload' }, { status: 500 });
  }
}
