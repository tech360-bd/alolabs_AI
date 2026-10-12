/**
 * Session Manager
 * ALO Labs AIOS — Session management with configurable expiry,
 * multi-device support, and rotation. Stores sessions in the
 * Settings table (compatible with existing auth system).
 */

import { randomBytes, createHash } from 'crypto';
import { db } from '@/lib/db';

// ─── Configuration ──────────────────────────────────────────────────

const DEFAULT_SESSION_EXPIRY_HOURS = 24;
const MAX_SESSION_AGE_HOURS = 168; // 7 days
const SESSION_KEY_PREFIX = 'session:';
const SESSION_META_PREFIX = 'session:meta:';

// ─── Types ──────────────────────────────────────────────────────────

export interface SessionMetadata {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  device?: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}

export interface SessionInfo {
  token: string;
  metadata: SessionMetadata;
  isActive: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(48).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function computeExpiry(lastActivityAt: Date): Date {
  const expiresAt = new Date(lastActivityAt);
  expiresAt.setHours(expiresAt.getHours() + DEFAULT_SESSION_EXPIRY_HOURS);

  // Enforce maximum session age
  const maxExpiry = new Date(expiresAt);
  maxExpiry.setHours(maxExpiry.getHours() + MAX_SESSION_AGE_HOURS);

  if (expiresAt > maxExpiry) {
    return maxExpiry;
  }

  return expiresAt;
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// ─── Session Creation ────────────────────────────────────────────────

/**
 * Create a new session for a user.
 *
 * @param userId - The user's ID
 * @param metadata - Optional metadata (user agent, IP, device)
 * @param customExpiryHours - Override default expiry (max 168h / 7d)
 * @returns The session token (raw, not hashed)
 */
export async function createSession(
  userId: string,
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    device?: string;
  },
  customExpiryHours?: number,
): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = new Date();

  const expiryHours = Math.min(
    customExpiryHours ?? DEFAULT_SESSION_EXPIRY_HOURS,
    MAX_SESSION_AGE_HOURS,
  );

  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + expiryHours);

  const sessionData = {
    userId,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
    device: metadata?.device,
    createdAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Store session keyed by token hash
  await db.settings.upsert({
    where: { key: `${SESSION_KEY_PREFIX}${tokenHash}` },
    create: {
      key: `${SESSION_KEY_PREFIX}${tokenHash}`,
      value: JSON.stringify(sessionData),
    },
    update: {
      value: JSON.stringify(sessionData),
    },
  });

  // Store metadata keyed by userId:tokenHash for user-scoped lookups
  await db.settings.upsert({
    where: { key: `${SESSION_META_PREFIX}${userId}:${tokenHash}` },
    create: {
      key: `${SESSION_META_PREFIX}${userId}:${tokenHash}`,
      value: JSON.stringify({
        tokenHash,
        ...sessionData,
      }),
    },
    update: {
      value: JSON.stringify({
        tokenHash,
        ...sessionData,
      }),
    },
  });

  return token;
}

// ─── Session Validation ─────────────────────────────────────────────

/**
 * Validate a session token and extend its expiry.
 *
 * @param token - Raw session token
 * @returns Session info if valid, null if invalid/expired
 */
export async function validateSession(
  token: string,
): Promise<SessionInfo | null> {
  const tokenHash = hashToken(token);

  const session = await db.settings.findUnique({
    where: { key: `${SESSION_KEY_PREFIX}${tokenHash}` },
  });

  if (!session) return null;

  let sessionData: SessionMetadata;
  try {
    sessionData = JSON.parse(session.value) as SessionMetadata;
  } catch {
    return null;
  }

  // Check expiry
  if (isExpired(sessionData.expiresAt)) {
    await destroySession(token);
    return null;
  }

  // Extend session (update lastActivityAt and recompute expiresAt)
  const now = new Date();
  const newExpiresAt = computeExpiry(now);

  // Prevent extending beyond maximum age from creation
  const maxFromCreation = new Date(sessionData.createdAt);
  maxFromCreation.setHours(maxFromCreation.getHours() + MAX_SESSION_AGE_HOURS);

  if (newExpiresAt > maxFromCreation) {
    sessionData.expiresAt = maxFromCreation.toISOString();
  } else {
    sessionData.expiresAt = newExpiresAt.toISOString();
  }

  sessionData.lastActivityAt = now.toISOString();

  const updatedValue = JSON.stringify(sessionData);

  await db.settings.update({
    where: { key: `${SESSION_KEY_PREFIX}${tokenHash}` },
    data: { value: updatedValue },
  });

  // Also update the meta record
  await db.settings
    .findUnique({
      where: { key: `${SESSION_META_PREFIX}${sessionData.userId}:${tokenHash}` },
    })
    .then(async (meta) => {
      if (meta) {
        await db.settings.update({
          where: { key: meta.key },
          data: {
            value: JSON.stringify({ tokenHash, ...sessionData }),
          },
        });
      }
    })
    .catch(() => {
      /* ignore meta update failure */
    });

  return {
    token,
    metadata: sessionData,
    isActive: true,
  };
}

// ─── Session Destruction ────────────────────────────────────────────

/**
 * Destroy a single session.
 */
export async function destroySession(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);

  const session = await db.settings.findUnique({
    where: { key: `${SESSION_KEY_PREFIX}${tokenHash}` },
  });

  if (!session) return false;

  let userId = '';
  try {
    const data = JSON.parse(session.value) as SessionMetadata;
    userId = data.userId;
  } catch {
    // continue
  }

  // Delete both records
  await db.settings.deleteMany({
    where: {
      OR: [
        { key: `${SESSION_KEY_PREFIX}${tokenHash}` },
        { key: `${SESSION_META_PREFIX}${userId}:${tokenHash}` },
      ],
    },
  });

  return true;
}

/**
 * Destroy all sessions for a user (logout all devices).
 */
export async function destroyAllUserSessions(userId: string): Promise<number> {
  // Find all session meta records for this user
  const sessions = await db.settings.findMany({
    where: {
      key: { startsWith: `${SESSION_META_PREFIX}${userId}:` },
    },
  });

  const keysToDelete: string[] = [];

  for (const session of sessions) {
    try {
      const data = JSON.parse(session.value) as { tokenHash: string };
      keysToDelete.push(`${SESSION_KEY_PREFIX}${data.tokenHash}`);
    } catch {
      // continue
    }
    keysToDelete.push(session.key);
  }

  if (keysToDelete.length === 0) return 0;

  const result = await db.settings.deleteMany({
    where: { key: { in: keysToDelete } },
  });

  return result.count;
}

// ─── Session Rotation ───────────────────────────────────────────────

/**
 * Rotate a session token: issue a new token and invalidate the old one.
 * Useful after sensitive operations (password change, role change, etc.)
 */
export async function rotateSessionToken(
  oldToken: string,
): Promise<string | null> {
  const sessionInfo = await validateSession(oldToken);
  if (!sessionInfo) return null;

  // Create new session with same metadata
  const newToken = await createSession(
    sessionInfo.metadata.userId,
    {
      userAgent: sessionInfo.metadata.userAgent,
      ipAddress: sessionInfo.metadata.ipAddress,
      device: sessionInfo.metadata.device,
    },
  );

  // Destroy old session
  await destroySession(oldToken);

  return newToken;
}

// ─── Session Count ──────────────────────────────────────────────────

/**
 * Count active (non-expired) sessions for a user.
 */
export async function getSessionCount(userId: string): Promise<number> {
  const sessions = await db.settings.findMany({
    where: {
      key: { startsWith: `${SESSION_META_PREFIX}${userId}:` },
    },
  });

  let count = 0;
  for (const session of sessions) {
    try {
      const data = JSON.parse(session.value) as SessionMetadata;
      if (!isExpired(data.expiresAt)) {
        count++;
      }
    } catch {
      // Skip invalid records
    }
  }

  return count;
}

// ─── List User Sessions ─────────────────────────────────────────────

/**
 * List all active sessions for a user.
 */
export async function listUserSessions(
  userId: string,
): Promise<SessionInfo[]> {
  const sessions = await db.settings.findMany({
    where: {
      key: { startsWith: `${SESSION_META_PREFIX}${userId}:` },
    },
    orderBy: { createdAt: 'desc' },
  });

  const result: SessionInfo[] = [];

  for (const session of sessions) {
    try {
      const data = JSON.parse(session.value) as SessionMetadata;
      if (!isExpired(data.expiresAt)) {
        result.push({
          token: '', // Never expose raw tokens in listings
          metadata: data,
          isActive: true,
        });
      }
    } catch {
      // Skip invalid records
    }
  }

  return result;
}