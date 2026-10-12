import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    await requireAuth();
    const data = await db.constitutionalRule.findMany({ where: { isActive: true, category: 'security' }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ data, success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error', success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json();
    if (!body.name || !body.type) return NextResponse.json({ error: 'name and type required', success: false }, { status: 400 });
    const data = await db.constitutionalRule.create({ data: {
      ruleId: `SEC-${randomUUID()}`, title: body.name, category: 'security', severity: body.severity || 'high',
      description: body.description || body.name, conditions: JSON.stringify([{ type: body.type, pattern: body.pattern, config: body.config || {} }]),
      actions: JSON.stringify([body.action || 'block']),
    } });
    return NextResponse.json({ data, success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unauthorized')) return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error', success: false }, { status: 500 });
  }
}
