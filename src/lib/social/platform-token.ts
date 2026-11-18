import { db } from '@/lib/db';
import { readSocialCredential } from './credentials';
import type { SocialPlatform } from './types';

export async function getPlatformToken(platform: SocialPlatform): Promise<{
  accessToken: string;
  refreshToken?: string;
  metadata?: Record<string, unknown>;
} | null> {
  const setting = await db.settings.findUnique({
    where: { key: `social:${platform}:token` },
  });

  if (!setting) return null;

  try {
    const data = JSON.parse(readSocialCredential(setting.value));
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || undefined,
      metadata: data.metadata || undefined,
    };
  } catch {
    return null;
  }
}
