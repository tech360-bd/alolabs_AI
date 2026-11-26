import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session';

// PATCH /api/webhooks/[id] — update webhook
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Session → live Company membership. Authentication alone never authorises.
  const tenant = await legacyTenant(request);
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, url, events, isActive } = body;

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
  // Session → live Company membership. Authentication alone never authorises.
  const tenant = await legacyTenant(request);
  try {
    const { id } = await params;
    await db.webhookConfig.delete({ where: tenantWhere(tenant, { id }) });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}