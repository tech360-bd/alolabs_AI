import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const {
      name, slug, domain, status, allowedWorkflows, allowedDepartments,
      monthlyUsageLimit, paidApiAllowed, smsAllowed, whatsappBulkAllowed,
      publicPublishAllowed, webCrmConnected,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (domain !== undefined) updateData.domain = domain;
    if (status !== undefined) updateData.status = status;
    if (allowedWorkflows !== undefined) updateData.allowedWorkflows = typeof allowedWorkflows === 'string' ? allowedWorkflows : JSON.stringify(allowedWorkflows);
    if (allowedDepartments !== undefined) updateData.allowedDepartments = typeof allowedDepartments === 'string' ? allowedDepartments : JSON.stringify(allowedDepartments);
    if (monthlyUsageLimit !== undefined) updateData.monthlyUsageLimit = monthlyUsageLimit;
    if (paidApiAllowed !== undefined) updateData.paidApiAllowed = paidApiAllowed;
    if (smsAllowed !== undefined) updateData.smsAllowed = smsAllowed;
    if (whatsappBulkAllowed !== undefined) updateData.whatsappBulkAllowed = whatsappBulkAllowed;
    if (publicPublishAllowed !== undefined) updateData.publicPublishAllowed = publicPublishAllowed;
    if (webCrmConnected !== undefined) updateData.webCrmConnected = webCrmConnected;

    const updated = await db.company.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, id: updated.id });
  } catch (error) {
    console.error('Company PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;

    const existing = await db.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    await db.company.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Company DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
