// ALO Labs AIOS — WhatsApp Numbers Management API
// CRUD for registered WhatsApp Business phone numbers

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  registeredAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

// ─── Helper: Read/write numbers from Settings ─────────────────────────────────

async function getStoredNumbers(): Promise<StoredWhatsAppNumber[]> {
  try {
    const setting = await db.settings.findUnique({
      where: { key: 'whatsapp:numbers' },
    });
    if (!setting) return [];
    return JSON.parse(setting.value) as StoredWhatsAppNumber[];
  } catch {
    return [];
  }
}

async function saveStoredNumbers(numbers: StoredWhatsAppNumber[]): Promise<void> {
  await db.settings.upsert({
    where: { key: 'whatsapp:numbers' },
    update: {
      value: JSON.stringify(numbers),
      type: 'json',
      updatedAt: new Date(),
    },
    create: {
      key: 'whatsapp:numbers',
      value: JSON.stringify(numbers),
      type: 'json',
    },
  });
}

// ─── GET: List all registered WhatsApp numbers ─────────────────────────────────

export async function GET() {
  try {
    const authHeader = await (await import('next/headers')).headers();
    const authorization = authHeader.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authorization.substring(7);
    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const numbers = await getStoredNumbers();

    // Redact access tokens in response
    const safeNumbers = numbers.map((n) => ({
      ...n,
      accessToken: n.accessToken ? '***REDACTED***' : '',
    }));

    return NextResponse.json({
      data: safeNumbers,
      total: numbers.length,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('WhatsApp numbers GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: Register a new WhatsApp number ───────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authHeader = await (await import('next/headers')).headers();
    const authorization = authHeader.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authorization.substring(7);
    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      phoneNumberId: string;
      displayName: string;
      businessName?: string;
      accessToken: string;
      isDefault?: boolean;
      aiEnabled?: boolean;
      aiEndpoint?: string;
      handoverThreshold?: number;
      metadata?: Record<string, unknown>;
    };

    if (!body.phoneNumberId) {
      return NextResponse.json({ error: 'phoneNumberId is required' }, { status: 400 });
    }

    if (!body.accessToken) {
      return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
    }

    const numbers = await getStoredNumbers();

    // Check for duplicate
    if (numbers.some((n) => n.phoneNumberId === body.phoneNumberId)) {
      return NextResponse.json(
        { error: 'A number with this phoneNumberId is already registered' },
        { status: 409 },
      );
    }

    // If setting as default, unset other defaults
    if (body.isDefault) {
      for (const n of numbers) {
        n.isDefault = false;
      }
    }

    const newNumber: StoredWhatsAppNumber = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2)}`,
      phoneNumberId: body.phoneNumberId,
      displayName: body.displayName || 'WhatsApp Number',
      businessName: body.businessName || '',
      accessToken: body.accessToken,
      isDefault: body.isDefault || numbers.length === 0, // First number is default
      aiEnabled: body.aiEnabled ?? true,
      aiEndpoint: body.aiEndpoint || '',
      handoverThreshold: body.handoverThreshold || 8,
      isActive: true,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: body.metadata,
    };

    numbers.push(newNumber);
    await saveStoredNumbers(numbers);

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'whatsapp_number_register',
        resource: `whatsapp:number:${newNumber.id}`,
        details: JSON.stringify({
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
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('WhatsApp numbers POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT: Update number settings ───────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const authHeader = await (await import('next/headers')).headers();
    const authorization = authHeader.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authorization.substring(7);
    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      id: string;
      displayName?: string;
      businessName?: string;
      accessToken?: string;
      isDefault?: boolean;
      aiEnabled?: boolean;
      aiEndpoint?: string;
      handoverThreshold?: number;
      isActive?: boolean;
      metadata?: Record<string, unknown>;
    };

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const numbers = await getStoredNumbers();
    const index = numbers.findIndex((n) => n.id === body.id);

    if (index === -1) {
      return NextResponse.json({ error: 'Number not found' }, { status: 404 });
    }

    // If setting as default, unset other defaults
    if (body.isDefault) {
      for (const n of numbers) {
        n.isDefault = false;
      }
    }

    // Update fields
    const number = numbers[index];
    if (body.displayName !== undefined) number.displayName = body.displayName;
    if (body.businessName !== undefined) number.businessName = body.businessName;
    if (body.accessToken !== undefined) number.accessToken = body.accessToken;
    if (body.isDefault !== undefined) number.isDefault = body.isDefault;
    if (body.aiEnabled !== undefined) number.aiEnabled = body.aiEnabled;
    if (body.aiEndpoint !== undefined) number.aiEndpoint = body.aiEndpoint;
    if (body.handoverThreshold !== undefined) number.handoverThreshold = body.handoverThreshold;
    if (body.isActive !== undefined) number.isActive = body.isActive;
    if (body.metadata !== undefined) number.metadata = body.metadata;
    number.updatedAt = new Date().toISOString();

    numbers[index] = number;
    await saveStoredNumbers(numbers);

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'whatsapp_number_update',
        resource: `whatsapp:number:${body.id}`,
        details: JSON.stringify({
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
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('WhatsApp numbers PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE: Remove a number ───────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = await (await import('next/headers')).headers();
    const authorization = authHeader.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authorization.substring(7);
    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const removed = numbers.splice(index, 1)[0];

    // If we removed the default, set first remaining as default
    if (removed.isDefault && numbers.length > 0) {
      numbers[0].isDefault = true;
    }

    await saveStoredNumbers(numbers);

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'whatsapp_number_remove',
        resource: `whatsapp:number:${numberId}`,
        details: JSON.stringify({
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
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('WhatsApp numbers DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}