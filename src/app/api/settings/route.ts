import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/api-auth';

// Settings is also a private key-value store for sessions, credentials and
// customer data. A general-purpose settings editor must never expose that store.
const keys = ['app_name', 'app_url', 'maintenance_mode', 'feature_ai', 'feature_social', 'feature_email'] as const;
const edit = z.object({ key: z.enum(keys), value: z.union([z.string().max(1024), z.boolean()]) });
function errorResponse(error: unknown) {
  const msg = error instanceof Error ? error.message : '';
  return NextResponse.json({ error: msg === 'Unauthorized' || msg === 'Forbidden' ? msg : 'Settings unavailable' }, { status: msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500 });
}
export async function GET() {
  try {
    await requireAuth();
    const data = await db.settings.findMany({ where: { key: { in: [...keys] } }, orderBy: { key: 'asc' } });
    return NextResponse.json({ data, map: Object.fromEntries(data.map(s => [s.key, s.value])) });
  } catch (err) { return errorResponse(err); }
}
export async function PUT(request: NextRequest) {
  try {
    const user = await requireRole('super_admin', 'platform_super_admin', 'admin');
    const body = await request.json().catch(() => null);
    const parsed = z.array(edit).min(1).max(keys.length).safeParse(Array.isArray(body) ? body : [body]);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid application preference' }, { status: 400 });
    const updates = parsed.data.map(({key, value}) => ({ key, value: String(value), type: key.startsWith('app_') ? 'string' : 'boolean' }));
    if (updates.some(s => s.type === 'boolean' && !['true','false'].includes(s.value))) return NextResponse.json({ error: 'Expected boolean preference' }, { status: 400 });
    const results = await db.$transaction([
      ...updates.map(s => db.settings.upsert({ where: { key: s.key }, create: s, update: { value: s.value, type: s.type } })),
      db.auditLog.create({ data: { userId: user.userId, action: 'update', resource: 'settings', details: JSON.stringify({ keys: updates.map(s => s.key) }) } }),
    ]);
    return NextResponse.json(Array.isArray(body) ? { data: results.slice(0,-1) } : results[0]);
  } catch (err) { return errorResponse(err); }
}
