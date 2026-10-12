import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

// GET: List all configured OAuth providers (without clientSecret) — admin only
export async function GET() {
  try {
    await requireRole('super_admin', 'admin');
    const providers = await db.oAuthProvider.findMany({
      orderBy: { createdAt: 'asc' },
    });

    // Strip clientSecret from response
    const safeProviders = providers.map((p) => ({
      id: p.id,
      provider: p.provider,
      clientId: p.clientId,
      authorizationUrl: p.authorizationUrl,
      tokenUrl: p.tokenUrl,
      userInfoUrl: p.userInfoUrl,
      scopes: p.scopes,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return NextResponse.json({ providers: safeProviders });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('OAuth providers list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create or update an OAuth provider configuration — admin only
export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin');
    const body = await request.json();
    const {
      provider,
      clientId,
      clientSecret,
      authorizationUrl,
      tokenUrl,
      userInfoUrl,
      scopes,
      isActive,
    } = body;

    if (!provider || !clientId || !clientSecret || !authorizationUrl || !tokenUrl || !userInfoUrl) {
      return NextResponse.json(
        {
          error:
            'provider, clientId, clientSecret, authorizationUrl, tokenUrl, and userInfoUrl are required',
        },
        { status: 400 }
      );
    }

    // Upsert by provider name
    const upserted = await db.oAuthProvider.upsert({
      where: { provider },
      update: {
        clientId,
        clientSecret,
        authorizationUrl,
        tokenUrl,
        userInfoUrl,
        scopes: scopes || '[]',
        isActive: isActive !== undefined ? isActive : true,
        updatedAt: new Date(),
      },
      create: {
        provider,
        clientId,
        clientSecret,
        authorizationUrl,
        tokenUrl,
        userInfoUrl,
        scopes: scopes || '[]',
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    // Return without clientSecret
    return NextResponse.json({
      id: upserted.id,
      provider: upserted.provider,
      clientId: upserted.clientId,
      authorizationUrl: upserted.authorizationUrl,
      tokenUrl: upserted.tokenUrl,
      userInfoUrl: upserted.userInfoUrl,
      scopes: upserted.scopes,
      isActive: upserted.isActive,
      createdAt: upserted.createdAt,
      updatedAt: upserted.updatedAt,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('OAuth provider upsert error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove an OAuth provider configuration — admin only
export async function DELETE(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin');
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Provider ID is required' },
        { status: 400 }
      );
    }

    const provider = await db.oAuthProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      return NextResponse.json(
        { error: 'OAuth provider not found' },
        { status: 404 }
      );
    }

    await db.oAuthProvider.delete({
      where: { id },
    });

    return NextResponse.json({ message: `OAuth provider "${provider.provider}" deleted successfully` });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('OAuth provider delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
