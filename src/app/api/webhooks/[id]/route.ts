import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session';
import { validateExternalUrlSyntax } from '@/lib/security/ssrf';

// PATCH /api/webhooks/[id] — update webhook
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { name, url, events, isActive } = body;

    if (url !== undefined) {
      try {
        validateExternalUrlSyntax(String(url), { allowHttp: process.env.NODE_ENV !== 'production' });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid webhook URL' },
          { status: 400 },
        );
      }
    }

    const webhook = await db.webhookConfig.findFirst({ where: tenantWhere(tenant, { id }) });
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (events !== undefined) updateData.events = JSON.stringify(events);
    if (isActive !== undefined) updateData.isActive = isActive;

    await db.webhookConfig.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/webhooks/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Session → live Company membership. Authentication alone never authorises.
    const tenant = await legacyTenant(request);
    const { id } = await params;
    // Ownership proven first; `delete` takes a unique where only.
    const owned = await db.webhookConfig.findFirst({ where: tenantWhere(tenant, { id }), select: { id: true } });
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await db.webhookConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}