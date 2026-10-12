// ALO Labs AIOS — Social Accounts Management API
// List, connect, and disconnect social media accounts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth';
import type { SocialPlatform } from '@/lib/social/types';

// ─── Constants ─────────────────────────────────────────────────────────────────

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'youtube',
  'tiktok',
  'pinterest',
  'telegram',
  'whatsapp',
];

const TOKEN_KEY_PREFIX = 'social:';
const TOKEN_KEY_SUFFIX = ':token';

function tokenKeyFor(platform: SocialPlatform): string {
  return `${TOKEN_KEY_PREFIX}${platform}${TOKEN_KEY_SUFFIX}`;
}

// ─── Helper: Parse account data from Settings ──────────────────────────────────

interface ConnectedAccount {
  platform: SocialPlatform;
  isActive: boolean;
  connectedAt: string | null;
  platformUserId: string | null;
  platformUsername: string | null;
  expiresIn: number | null;
  tokenExpiresAt: string | null;
}

function parseAccountSetting(key: string, value: string): ConnectedAccount | null {
  if (!key.startsWith(TOKEN_KEY_PREFIX) || !key.endsWith(TOKEN_KEY_SUFFIX)) {
    return null;
  }

  const platform = key.slice(TOKEN_KEY_PREFIX.length, -TOKEN_KEY_SUFFIX.length) as SocialPlatform;
  if (!SOCIAL_PLATFORMS.includes(platform)) return null;

  try {
    const data = JSON.parse(value);
    return {
      platform,
      isActive: true,
      connectedAt: data.connectedAt || null,
      platformUserId: data.platformUserId || null,
      platformUsername: data.platformUsername || null,
      expiresIn: data.expiresIn || null,
      tokenExpiresAt: data.expiresIn
        ? new Date(new Date(data.connectedAt).getTime() + data.expiresIn * 1000).toISOString()
        : null,
    };
  } catch {
    return null;
  }
}

// ─── GET: List all connected social accounts ────────────────────────────────────

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

    // Fetch all settings that match social token pattern
    const allSettings = await db.settings.findMany({
      where: {
        key: {
          startsWith: TOKEN_KEY_PREFIX,
          endsWith: TOKEN_KEY_SUFFIX,
        },
      },
      orderBy: { key: 'asc' },
    });

    const accounts: ConnectedAccount[] = [];
    for (const setting of allSettings) {
      const account = parseAccountSetting(setting.key, setting.value);
      if (account) {
        accounts.push(account);
      }
    }

    return NextResponse.json({
      data: accounts,
      total: accounts.length,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Social accounts GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: Connect a new social account ─────────────────────────────────────────

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

    const body = await request.json();
    const { platform, accessToken, refreshToken, expiresIn, platformUserId, platformUsername, metadata } = body as {
      platform: SocialPlatform;
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      platformUserId?: string;
      platformUsername?: string;
      metadata?: Record<string, unknown>;
    };

    if (!platform || !SOCIAL_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: `Invalid platform. Supported: ${SOCIAL_PLATFORMS.join(', ')}` },
        { status: 400 },
      );
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
    }

    const key = tokenKeyFor(platform);
    const tokenPayload = {
      accessToken,
      refreshToken: refreshToken || null,
      expiresIn: expiresIn || null,
      platformUserId: platformUserId || null,
      platformUsername: platformUsername || null,
      metadata: metadata || null,
      connectedAt: new Date().toISOString(),
    };

    await db.settings.upsert({
      where: { key },
      update: {
        value: JSON.stringify(tokenPayload),
        type: 'json',
        updatedAt: new Date(),
      },
      create: {
        key,
        value: JSON.stringify(tokenPayload),
        type: 'json',
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'social_account_connect',
        resource: `social:${platform}`,
        details: JSON.stringify({
          platform,
          platformUserId,
          platformUsername,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      platform,
      platformUsername: platformUsername || null,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Social accounts POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE: Disconnect a social account ────────────────────────────────────────

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
    const platform = searchParams.get('platform') as SocialPlatform | null;

    if (!platform || !SOCIAL_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: `Invalid or missing platform. Supported: ${SOCIAL_PLATFORMS.join(', ')}` },
        { status: 400 },
      );
    }

    const key = tokenKeyFor(platform);

    // Check if account exists
    const existing = await db.settings.findUnique({ where: { key } });
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await db.settings.delete({ where: { key } });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action: 'social_account_disconnect',
        resource: `social:${platform}`,
        details: JSON.stringify({ platform }),
      },
    });

    return NextResponse.json({ success: true, platform });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Social accounts DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}