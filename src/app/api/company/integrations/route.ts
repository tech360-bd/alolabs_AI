import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { encryptField, fingerprint, isFieldEncryptionConfigured } from '@/lib/security/field-encryption';

export const dynamic = 'force-dynamic';

const SaveSchema = z.object({
  integrationType: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  name: z.string().trim().min(2).max(120),
  baseUrl: z.string().url().max(1000).nullable().optional(),
  secret: z.string().min(1).max(8000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
}).strict();

function canManage(user: { role: string; companyRole?: string }) {
  return user.role === 'super_admin' || ['owner', 'admin'].includes(user.companyRole ?? '');
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status });
}

export async function GET() {
  try {
    const user = await requireCompanyAuth();
    const credentials = await db.integrationCredential.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ integrationType: 'asc' }, { name: 'asc' }],
      select: { id: true, integrationType: true, name: true, baseUrl: true, secretFingerprint: true, settings: true, status: true, createdBy: true, lastVerifiedAt: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ data: credentials.map((credential) => ({ ...credential, hasSecret: Boolean(credential.secretFingerprint) })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    if (!canManage(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const parsed = SaveSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.secret && !isFieldEncryptionConfigured()) {
      return NextResponse.json({ error: 'ENCRYPTION_KEY is not configured; integration secret cannot be stored securely' }, { status: 503 });
    }
    const existing = await db.integrationCredential.findFirst({
      where: { companyId: user.companyId, integrationType: parsed.data.integrationType, name: parsed.data.name },
      select: { id: true, encryptedSecret: true, secretFingerprint: true },
    });
    const encrypted = parsed.data.secret ? encryptField(parsed.data.secret) : undefined;
    const secretFingerprint = parsed.data.secret ? fingerprint(parsed.data.secret) : undefined;
    const settings = parsed.data.settings ? JSON.stringify(parsed.data.settings) : undefined;
    const credential = await db.$transaction(async (transaction) => {
      const saved = existing
        ? await transaction.integrationCredential.update({
            where: { id: existing.id },
            data: {
              ...(parsed.data.baseUrl !== undefined ? { baseUrl: parsed.data.baseUrl } : {}),
              ...(encrypted ? { encryptedSecret: encrypted, secretFingerprint } : {}),
              ...(settings !== undefined ? { settings } : {}),
              status: 'configured',
            },
            select: { id: true, companyId: true, integrationType: true, name: true, baseUrl: true, secretFingerprint: true, status: true, createdAt: true, updatedAt: true },
          })
        : await transaction.integrationCredential.create({
            data: {
              companyId: user.companyId,
              integrationType: parsed.data.integrationType,
              name: parsed.data.name,
              baseUrl: parsed.data.baseUrl ?? null,
              encryptedSecret: encrypted ?? null,
              secretFingerprint: secretFingerprint ?? null,
              settings: settings ?? '{}',
              createdBy: user.userId,
            },
            select: { id: true, companyId: true, integrationType: true, name: true, baseUrl: true, secretFingerprint: true, status: true, createdAt: true, updatedAt: true },
          });
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          companyId: user.companyId,
          action: existing ? 'company.integration.update' : 'company.integration.create',
          resource: 'integration-credential',
          resourceId: saved.id,
          details: JSON.stringify({ integrationType: saved.integrationType, name: saved.name, hasSecret: Boolean(saved.secretFingerprint) }),
        },
      });
      return saved;
    });
    return NextResponse.json({ data: { ...credential, hasSecret: Boolean(credential.secretFingerprint) } }, { status: existing ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    if (!canManage(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const parsed = z.object({ id: z.string().min(1) }).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const credential = await db.integrationCredential.findFirst({ where: { id: parsed.data.id, companyId: user.companyId }, select: { id: true, integrationType: true, name: true } });
    if (!credential) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    await db.$transaction(async (transaction) => {
      await transaction.integrationCredential.delete({ where: { id: credential.id } });
      await transaction.auditEvent.create({
        data: { actorUserId: user.userId, companyId: user.companyId, action: 'company.integration.delete', resource: 'integration-credential', resourceId: credential.id, details: JSON.stringify({ integrationType: credential.integrationType, name: credential.name }) },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
