import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/alerts — list alerts
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const alerts = await db.alert.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    const data = alerts.map((a) => {
      const now = new Date();
      const isSilenced = a.silencedUntil ? now < new Date(a.silencedUntil) : false;

      return {
        id: a.id,
        name: a.name,
        severity: a.severity,
        condition: a.condition,
        isFiring: a.isFiring,
        isSilenced,
        lastFiredAt: a.lastFiredAt?.toISOString() ?? null,
        silencedUntil: a.silencedUntil?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      };
    });

    // Unsilence alerts that have passed their silencedUntil
    const toUnsilence = data.filter(
      (a) => a.silencedUntil && !a.isSilenced && a.silencedUntil !== null
    );

    if (toUnsilence.length > 0) {
      for (const alert of toUnsilence) {
        await db.alert.update({
          where: { id: alert.id },
          data: { silencedUntil: null },
        });
        alert.silencedUntil = null;
        alert.isSilenced = false;
      }
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('GET /api/alerts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/alerts — create an alert
export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json();
    const { name, severity, condition } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!condition || typeof condition !== 'string') {
      return NextResponse.json({ error: 'condition is required' }, { status: 400 });
    }

    const validSeverities = ['info', 'warning', 'critical'];
    const sev = severity || 'warning';
    if (!validSeverities.includes(sev)) {
      return NextResponse.json(
        { error: `severity must be one of: ${validSeverities.join(', ')}` },
        { status: 400 }
      );
    }

    const alert = await db.alert.create({
      data: {
        name,
        severity: sev,
        condition,
        isFiring: false,
      },
    });

    return NextResponse.json({ data: alert }, { status: 201 });
  } catch (error) {
    console.error('POST /api/alerts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/alerts — update an alert (silence, acknowledge)
export async function PATCH(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json();
    const { id, isFiring, silencedUntil, acknowledge } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await db.alert.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (typeof isFiring === 'boolean') {
      updateData.isFiring = isFiring;
      if (isFiring) {
        updateData.lastFiredAt = new Date();
      }
    }

    if (silencedUntil !== undefined) {
      updateData.silencedUntil = silencedUntil ? new Date(silencedUntil) : null;
    }

    // Acknowledge: if the alert is firing, acknowledge it (silence for 24h)
    if (acknowledge === true && existing.isFiring) {
      const silenceEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
      updateData.silencedUntil = silenceEnd;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid update fields provided' }, { status: 400 });
    }

    const updated = await db.alert.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        name: updated.name,
        severity: updated.severity,
        condition: updated.condition,
        isFiring: updated.isFiring,
        lastFiredAt: updated.lastFiredAt?.toISOString() ?? null,
        silencedUntil: updated.silencedUntil?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('PATCH /api/alerts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}