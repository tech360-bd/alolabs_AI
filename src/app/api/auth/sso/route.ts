import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

// GET: Retrieve current SSO configuration — admin only
export async function GET() {
  try {
    await requireRole('super_admin', 'admin');
    const configs = await db.ssoConfig.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ configs });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('SSO get config error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create or update an SSO configuration — admin only
export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin');
    const body = await request.json();
    const { provider, metadataUrl, entityId, callbackUrl, isActive, config } = body;

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider type is required (saml, ldap, oidc)' },
        { status: 400 }
      );
    }

    const validProviders = ['saml', 'ldap', 'oidc'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` },
        { status: 400 }
      );
    }

    // Upsert by provider name
    const upserted = await db.ssoConfig.upsert({
      where: { provider },
      update: {
        metadataUrl: metadataUrl ?? undefined,
        entityId: entityId ?? undefined,
        callbackUrl: callbackUrl ?? undefined,
        isActive: isActive !== undefined ? isActive : false,
        config: config ? JSON.stringify(config) : undefined,
        updatedAt: new Date(),
      },
      create: {
        provider,
        metadataUrl: metadataUrl ?? null,
        entityId: entityId ?? null,
        callbackUrl: callbackUrl ?? null,
        isActive: isActive !== undefined ? isActive : false,
        config: config ? JSON.stringify(config) : '{}',
      },
    });

    return NextResponse.json({
      id: upserted.id,
      provider: upserted.provider,
      metadataUrl: upserted.metadataUrl,
      entityId: upserted.entityId,
      callbackUrl: upserted.callbackUrl,
      isActive: upserted.isActive,
      config: upserted.config,
      createdAt: upserted.createdAt,
      updatedAt: upserted.updatedAt,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('SSO upsert error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}