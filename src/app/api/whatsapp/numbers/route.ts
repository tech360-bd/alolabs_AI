// ALO Labs AIOS — WhatsApp Numbers Management API
// CRUD for registered WhatsApp Business phone numbers (tenant-scoped + encrypted tokens)

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import { encryptField, isFieldEncryptionConfigured } from '@/lib/security/field-encryption';

const ALLOWED_ROLES = new Set(['super_admin', 'platform_super_admin', 'admin', 'manager', 'operator']);

interface StoredWhatsAppNumber {
  id: string;
  phoneNumberId: string;
  displayName: string;
  businessName: string;
  accessToken: string;
  isDefault: boolean;
  aiEnabled: boolean;
  aiEndpoint: string;
  handoverThreshold: number;
  isActive: boolean;
  companyId?: string;
  registeredAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

function protectWhatsAppToken(token: string): string {
  if (isFieldEncryptionConfigured()) {
    return encryptField(token);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be configured in production to store WhatsApp tokens');
  }
  return token;
}

async function getHeaderStore(request: NextRequest) {
  try {
    return await (await import('next/headers')).headers();
  } catch {
    return request.headers;
  }
}

async function authenticateCaller(request: NextRequest) {
  const headerStore = await getHeaderStore(request);
  const header = headerStore.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  if (!ALLOWED_ROLES.has(session.role)) return { session, forbidden: true as const, companyId: null };

  const requestedCompanyId = request.headers.get('x-company-id')?.trim() || null;
  if (session.role === 'super_admin' && requestedCompanyId) {
    return { session, forbidden: false as const, companyId: requestedCompanyId };
  }

  const membership = requestedCompanyId
    ? await db.companyUser.findFirst({
        where: { userId: session.userId, companyId: requestedCompanyId },
        select: { companyId: true },
      })
    : await db.companyUser.findFirst({
        where: { userId: session.userId },
        select: { companyId: true },
      });

  return {
    session,
    forbidden: false as const,
    companyId: membership?.companyId ?? null,
  };
}

async function getStoredNumbers(): Promise<StoredWhatsAppNumber[]> {
  try {
    const setting = await db.settings.findUnique({ where: { key: 'whatsapp:numbers' } });
    if (!setting) return [];
    return JSON.parse(setting.value) as StoredWhatsAppNumber[];
  } catch {
    return [];
  }
}

async function saveStoredNumbers(numbers: StoredWhatsAppNumber[]): Promise<void> {
  await db.settings.upsert({
    where: { key: 'whatsapp:numbers' },
    update: { value: JSON.stringify(numbers), type: 'json', updatedAt: new Date() },
    create: { key: 'whatsapp:numbers', value: JSON.stringify(numbers), type: 'json' },
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateCaller(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!auth.companyId && auth.session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Company membership required' }, { status: 403 });
    }

    const numbers = await getStoredNumbers();
    const scoped =
      auth.session.role === 'super_admin' && !auth.companyId
        ? numbers
        : numbers.filter((n) => n.companyId === auth.companyId);

    const safeNumbers = scoped.map((n) => ({
      ...n,
      accessToken: n.accessToken ? '***REDACTED***' : '',
    }));

    return NextResponse.json({
      data: safeNumbers,
      total: safeNumbers.length,
    });
  } catch (error: unknown) {
    console.error('WhatsApp numbers GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateCaller(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!auth.companyId) {
      return NextResponse.json(
        { error: 'Your account must belong to a company before registering a WhatsApp number.' },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      phoneNumberId?: string;
      displayName?: string;
      businessName?: string;
      accessToken?: string;
      isDefault?: boolean;
      aiEnabled?: boolean;
      aiEndpoint?: string;
      handoverThreshold?: number;
      metadata?: Record<string, unknown>;
    } | null;

    if (!body?.phoneNumberId) {
      return NextResponse.json({ error: 'phoneNumberId is required' }, { status: 400 });
    }
    if (!body.accessToken) {
      return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
    }

    const numbers = await getStoredNumbers();
    if (numbers.some((n) => n.phoneNumberId === body.phoneNumberId)) {
      return NextResponse.json(
        { error: 'A number with this phoneNumberId is already registered' },
        { status: 409 },
      );
    }

    if (body.isDefault) {
      for (const n of numbers) {
        if (n.companyId === auth.companyId) n.isDefault = false;
      }
    }

    const companyHasDefault = numbers.some((n) => n.companyId === auth.companyId && n.isDefault);

    const newNumber: StoredWhatsAppNumber = {
      id: crypto.randomUUID(),
      phoneNumberId: body.phoneNumberId,
      displayName: body.displayName || 'WhatsApp Number',
      businessName: body.businessName || '',
      accessToken: protectWhatsAppToken(body.accessToken),
      isDefault: body.isDefault ?? !companyHasDefault,
      aiEnabled: body.aiEnabled ?? true,
      aiEndpoint: body.aiEndpoint || '',
      handoverThreshold: body.handoverThreshold || 8,
      isActive: true,
      companyId: auth.companyId,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: body.metadata,
    };

    numbers.push(newNumber);
    await saveStoredNumbers(numbers);

    await db.auditLog.create({
      data: {
        userId: auth.session.userId,
        action: 'whatsapp_number_register',
        resource: `whatsapp:number:${newNumber.id}`,
        details: JSON.stringify({
          companyId: auth.companyId,
          phoneNumberId: body.phoneNumberId,
          displayName: body.displayName,
          isDefault: newNumber.isDefault,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      number: {
        ...newNumber,
        accessToken: '***REDACTED***',
      },
    });
  } catch (error: unknown) {
    console.error('WhatsApp numbers POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateCaller(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!auth.companyId && auth.session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Company membership required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      id?: string;
      displayName?: string;
      businessName?: string;
      accessToken?: string;
      isDefault?: boolean;
      aiEnabled?: boolean;
      aiEndpoint?: string;
      handoverThreshold?: number;
      isActive?: boolean;
      metadata?: Record<string, unknown>;
    } | null;

    if (!body?.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const numbers = await getStoredNumbers();
    const index = numbers.findIndex((n) => n.id === body.id);
    if (index === -1) {
      return NextResponse.json({ error: 'Number not found' }, { status: 404 });
    }

    const number = numbers[index];
    if (auth.session.role !== 'super_admin' && number.companyId !== auth.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (body.isDefault) {
      for (const n of numbers) {
        if (n.companyId === number.companyId) n.isDefault = false;
      }
    }

    if (body.displayName !== undefined) number.displayName = body.displayName;
    if (body.businessName !== undefined) number.businessName = body.businessName;
    if (body.accessToken !== undefined) number.accessToken = protectWhatsAppToken(body.accessToken);
    if (body.isDefault !== undefined) number.isDefault = body.isDefault;
    if (body.aiEnabled !== undefined) number.aiEnabled = body.aiEnabled;
    if (body.aiEndpoint !== undefined) number.aiEndpoint = body.aiEndpoint;
    if (body.handoverThreshold !== undefined) number.handoverThreshold = body.handoverThreshold;
    if (body.isActive !== undefined) number.isActive = body.isActive;
    if (body.metadata !== undefined) number.metadata = body.metadata;
    number.updatedAt = new Date().toISOString();

    numbers[index] = number;
    await saveStoredNumbers(numbers);

    await db.auditLog.create({
      data: {
        userId: auth.session.userId,
        action: 'whatsapp_number_update',
        resource: `whatsapp:number:${body.id}`,
        details: JSON.stringify({
          companyId: number.companyId,
          updatedFields: Object.keys(body).filter((k) => k !== 'id' && k !== 'accessToken'),
          isDefault: number.isDefault,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      number: {
        ...number,
        accessToken: '***REDACTED***',
      },
    });
  } catch (error: unknown) {
    console.error('WhatsApp numbers PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateCaller(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!auth.companyId && auth.session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Company membership required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const numberId = searchParams.get('id');
    if (!numberId) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
    }

    const numbers = await getStoredNumbers();
    const index = numbers.findIndex((n) => n.id === numberId);
    if (index === -1) {
      return NextResponse.json({ error: 'Number not found' }, { status: 404 });
    }

    if (auth.session.role !== 'super_admin' && numbers[index].companyId !== auth.companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const removed = numbers.splice(index, 1)[0];
    if (removed.isDefault) {
      const nextInTenant = numbers.find((n) => n.companyId === removed.companyId);
      if (nextInTenant) nextInTenant.isDefault = true;
    }

    await saveStoredNumbers(numbers);

    await db.auditLog.create({
      data: {
        userId: auth.session.userId,
        action: 'whatsapp_number_remove',
        resource: `whatsapp:number:${numberId}`,
        details: JSON.stringify({
          companyId: removed.companyId,
          phoneNumberId: removed.phoneNumberId,
          displayName: removed.displayName,
          wasDefault: removed.isDefault,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      removedId: numberId,
    });
  } catch (error: unknown) {
    console.error('WhatsApp numbers DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
