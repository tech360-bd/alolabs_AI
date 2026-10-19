import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().min(1).max(2_000_000),
  mimeType: z.string().trim().max(120).default('text/plain'),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted', 'highly_restricted']).default('confidential'),
}).strict();

function isManager(user: { role: string; companyRole?: string }) {
  return user.role === 'super_admin' || ['owner', 'admin', 'manager'].includes(user.companyRole ?? '');
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '50', 10) || 50));
    const data = await db.companyKnowledgeDocument.findMany({
      where: { companyId: user.companyId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { id: true, title: true, content: true, mimeType: true, classification: true, uploadedBy: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    if (!isManager(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const created = await db.$transaction(async (transaction) => {
      const document = await transaction.companyKnowledgeDocument.create({ data: { ...parsed.data, companyId: user.companyId, uploadedBy: user.userId } });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          companyId: user.companyId,
          action: 'company.knowledge.create',
          resource: 'company-knowledge-document',
          resourceId: document.id,
          details: JSON.stringify({ title: document.title, mimeType: document.mimeType, classification: document.classification, contentLength: document.content.length }),
        },
      });
      return document;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    if (!isManager(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const parsed = z.object({ id: z.string().min(1) }).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const document = await db.companyKnowledgeDocument.findFirst({ where: { id: parsed.data.id, companyId: user.companyId }, select: { id: true, title: true } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    await db.$transaction(async (transaction) => {
      await transaction.companyKnowledgeDocument.delete({ where: { id: document.id } });
      await transaction.auditEvent.create({
        data: { actorUserId: user.userId, companyId: user.companyId, action: 'company.knowledge.delete', resource: 'company-knowledge-document', resourceId: document.id, details: JSON.stringify({ title: document.title }) },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
