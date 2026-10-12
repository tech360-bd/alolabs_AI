import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { getStorage } from '@/lib/storage';

/**
 * /api/storage/files — secure file storage (section 50)
 *
 * GET    — list stored files (authenticated)
 * POST   — upload a file (multipart/form-data, authenticated)
 * DELETE — delete a file by key (authenticated)
 *
 * Files are private by default; downloads go through /api/storage/files/[id]
 * which enforces auth + optional signed-URL verification.
 */


export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const storage = getStorage();
    const folder = new URL(request.url).searchParams.get('folder') ?? 'uploads';
    const files = (await storage.list(folder)).filter((file) => file.companyId === user.companyId);

    return NextResponse.json({
      files,
      pagination: {
        page: 1,
        limit: files.length,
        total: files.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[GET /api/storage/files]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
    }
    const folder = typeof formData.get('folder') === 'string' ? (formData.get('folder') as string) : undefined;

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorage();
    const uploaded = await storage.upload(buffer, file.name, {
      ...(folder ? { folder } : {}),
      companyId: user.companyId,
      uploadedBy: user.userId,
    });

    return NextResponse.json({ success: true, file: uploaded }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && (error.message.includes('empty') || error.message.includes('maximum size'))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[POST /api/storage/files]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const body = await request.json().catch(() => ({}));
    const key = typeof body?.key === 'string' ? body.key : null;
    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    const storage = getStorage();
    const metadata = await storage.getMetadata(key);
    if (!metadata || metadata.companyId !== user.companyId) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    await storage.delete(key);

    return NextResponse.json({ success: true, deleted: key });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    if (error instanceof Error && error.message.startsWith('Configuration required')) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[DELETE /api/storage/files]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
