/**
 * Enterprise Session Manager — P5
 * ALO Labs AISMH
 *
 * Enhanced session management with TTL, sliding expiry, token rotation,
 * multi-device tracking, and cleanup. Stores sessions in db.settings
 * with the same key pattern as the existing auth system.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';

// ─── Configuration ──────────────────────────────────────────────────

const TOKEN_LENGTH = 48;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_KEY_PREFIX = 'session:';
const USER_SESSIONS_KEY_PREFIX = 'user:sessions:';

// ─── Types ──────────────────────────────────────────────────────────

export interface SessionData {
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  deviceInfo?: string;
  ipAddress?: string;
  isRefreshToken?: boolean;
}

export interface SessionInfo {
  token: string;
  session: SessionData;
}

export interface CreateSessionOptions {
  rememberMe?: boolean;
  deviceInfo?: string;
  ipAddress?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

function now(): string {
  return new Date().toISOString();
}

function ttlMs(rememberMe?: boolean): number {
  return rememberMe ? REMEMBER_ME_TTL_MS : DEFAULT_TTL_MS;
}

function expiresAt(rememberMe?: boolean): string {
  return new Date(Date.now() + ttlMs(rememberMe)).toISOString();
}

function isExpired(session: SessionData): boolean {
  return new Date(session.expiresAt) < new Date();
}

function sessionKey(token: string): string {
  return `${SESSION_KEY_PREFIX}${token}`;
}

function userSessionsKey(userId: string): string {
  return `${USER_SESSIONS_KEY_PREFIX}${userId}`;
}

async function addUserSessionToken(userId: string, token: string): Promise<void> {
  const key = userSessionsKey(userId);
  const existing = await db.settings.findUnique({ where: { key } });
  let tokens: string[] = [];
  if (existing) {
    try {
      tokens = JSON.parse(existing.value) as string[];
    } catch {
      tokens = [];
    }
  }
  if (!tokens.includes(token)) {
    tokens.push(token);
  }
  await db.settings.upsert({
    where: { key },
    update: { value: JSON.stringify(tokens), updatedAt: new Date() },
    create: { key, value: JSON.stringify(tokens), type: 'json' },
  });
}

async function removeUserSessionToken(userId: string, token: string): Promise<void> {
  const key = userSessionsKey(userId);
  const existing = await db.settings.findUnique({ where: { key } });
  if (!existing) return;
  let tokens: string[] = [];
  try {
    tokens = JSON.parse(existing.value) as string[];
  } catch {
    return;
  }
  const filtered = tokens.filter((t) => t !== token);
  if (filtered.length === 0) {
    await db.settings.delete({ where: { key } }).catch(() => {});
  } else {
    await db.settings.update({
      where: { key },
      data: { value: JSON.stringify(filtered), updatedAt: new Date() },
    });
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Create a new session with configurable TTL.
 * Default: 1 hour. With rememberMe: 30 days.
 */
export async function createSession(
  userId: string,
  options?: CreateSessionOptions,
): Promise<string> {
  const token = generateToken();
  const createdAt = now();
  const expAt = expiresAt(options?.rememberMe);

  const sessionData: SessionData = {
    userId,
    createdAt,
    expiresAt: expAt,
    lastUsedAt: createdAt,
    deviceInfo: options?.deviceInfo,
    ipAddress: options?.ipAddress,
    isRefreshToken: false,
  };

  await db.settings.upsert({
    where: { key: sessionKey(token) },
    update: { value: JSON.stringify(sessionData), updatedAt: new Date() },
    create: { key: sessionKey(token), value: JSON.stringify(sessionData), type: 'json' },
  });

  await addUserSessionToken(userId, token);

  return token;
}

/**
 * Verify a session token. Implements sliding expiry — extends TTL on each use.
 * Returns session data if valid, null if invalid/expired.
 */
export async function verifySession(
  token: string,
): Promise<SessionData | null> {
  if (!token) return null;

  const record = await db.settings.findUnique({
    where: { key: sessionKey(token) },
  });
  if (!record) return null;

  let session: SessionData;
  try {
    session = JSON.parse(record.value) as SessionData;
  } catch {
    return null;
  }

  if (isExpired(session)) {
    await revokeSession(token);
    return null;
  }

  // Sliding expiry: extend expiresAt from now
  const newExpiresAt = new Date(
    Date.now() + ttlMs(session.isRefreshToken ? true : false),
  ).toISOString();
  session.lastUsedAt = now();
  session.expiresAt = newExpiresAt;

  await db.settings.update({
    where: { key: sessionKey(token) },
    data: { value: JSON.stringify(session), updatedAt: new Date() },
  });

  return session;
}

/**
 * Revoke a single session by token.
 */
export async function revokeSession(token: string): Promise<boolean> {
  const record = await db.settings.findUnique({
    where: { key: sessionKey(token) },
  });
  if (!record) return false;

  let userId = '';
  try {
    const data = JSON.parse(record.value) as SessionData;
    userId = data.userId;
  } catch {
    // continue cleanup
  }

  await db.settings.delete({ where: { key: sessionKey(token) } }).catch(() => {});

  if (userId) {
    await removeUserSessionToken(userId, token);
  }

  return true;
}

/**
 * Revoke all sessions for a user.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const record = await db.settings.findUnique({
    where: { key: userSessionsKey(userId) },
  });
  if (!record) return 0;

  let tokens: string[] = [];
  try {
    tokens = JSON.parse(record.value) as string[];
  } catch {
    return 0;
  }

  if (tokens.length === 0) return 0;

  // Delete all session records
  await db.settings.deleteMany({
    where: {
      key: { in: tokens.map((t) => sessionKey(t)) },
    },
  });

  // Delete the user sessions index
  await db.settings
    .delete({ where: { key: userSessionsKey(userId) } })
    .catch(() => {});

  return tokens.length;
}

/**
 * List all active (non-expired) sessions for a user.
 * Tokens are truncated for safety — never expose raw tokens in listings.
 */
export async function listActiveSessions(
  userId: string,
): Promise<SessionInfo[]> {
  const record = await db.settings.findUnique({
    where: { key: userSessionsKey(userId) },
  });
  if (!record) return [];

  let tokens: string[] = [];
  try {
    tokens = JSON.parse(record.value) as string[];
  } catch {
    return [];
  }

  const results: SessionInfo[] = [];

  for (const token of tokens) {
    const sessionRecord = await db.settings.findUnique({
      where: { key: sessionKey(token) },
    });
    if (!sessionRecord) continue;

    try {
      const session = JSON.parse(sessionRecord.value) as SessionData;
      if (!isExpired(session)) {
        results.push({
          token: token.slice(0, 8) + '...',
          session,
        });
      }
    } catch {
      // Skip corrupted records
    }
  }

  return results;
}

/**
 * Clean up all expired sessions across all users.
 * Returns the count of cleaned sessions.
 * Designed to be called from a cron job or API endpoint.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  // Find all session keys
  const allSessions = await db.settings.findMany({
    where: {
      key: { startsWith: SESSION_KEY_PREFIX },
    },
  });

  const expiredKeys: string[] = [];
  const expiredUserEntries: Map<string, string[]> = new Map();

  for (const record of allSessions) {
    try {
      const session = JSON.parse(record.value) as SessionData;
      if (isExpired(session)) {
        // Extract raw token from key
        const rawToken = record.key.slice(SESSION_KEY_PREFIX.length);
        expiredKeys.push(record.key);

        // Track for user session list cleanup
        const userTokens = expiredUserEntries.get(session.userId) || [];
        userTokens.push(rawToken);
        expiredUserEntries.set(session.userId, userTokens);
      }
    } catch {
      // Also clean up corrupted session records
      expiredKeys.push(record.key);
    }
  }

  if (expiredKeys.length === 0) return 0;

  // Batch delete expired sessions
  await db.settings.deleteMany({
    where: { key: { in: expiredKeys } },
  });

  // Update user session lists to remove expired tokens
  for (const [userId, tokens] of expiredUserEntries) {
    for (const token of tokens) {
      await removeUserSessionToken(userId, token);
    }
  }

  return expiredKeys.length;
}

/**
 * Refresh a session token (JWT rotation). Issues a new token,
 * copies all session metadata, and invalidates the old one.
 */
export async function refreshSession(
  token: string,
): Promise<string | null> {
  // Verify current session first
  const session = await verifySession(token);
  if (!session) return null;

  // Create new session with same metadata, mark as refresh
  const newToken = await createSession(session.userId, {
    rememberMe: session.isRefreshToken || false,
    deviceInfo: session.deviceInfo,
    ipAddress: session.ipAddress,
  });

  // Mark new session as a refresh token
  const newKey = sessionKey(newToken);
  const newRecord = await db.settings.findUnique({ where: { key: newKey } });
  if (newRecord) {
    try {
      const newData = JSON.parse(newRecord.value) as SessionData;
      newData.isRefreshToken = true;
      await db.settings.update({
        where: { key: newKey },
        data: { value: JSON.stringify(newData), updatedAt: new Date() },
      });
    } catch {
      // continue
    }
  }

  // Invalidate old token
  await revokeSession(token);

  return newToken;
}
