/**
 * Compatibility facade for the legacy security-session API.
 *
 * All session lifecycle operations are delegated to the Prisma-backed JWT
 * manager. This module only adapts its data shape for the existing security
 * dashboard and keeps the Settings-backed opaque-token migration path alive.
 */
import { createSessionToken, verifySessionToken } from '@/lib/auth';
import {
  listActiveSessions,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSessionByCreatedAt,
  revokeSessionById,
  revokeUserSession,
  type SessionInfo as JwtSessionInfo,
} from '@/lib/session-manager';

const DEFAULT_SESSION_EXPIRY_HOURS = 24;
const MAX_SESSION_AGE_HOURS = 168;

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
  id: string;
  /** Short digest label only. Never a replayable JWT. */
  token: string;
  metadata: SessionMetadata;
  isActive: boolean;
}

function toMetadata(session: JwtSessionInfo['session']): SessionMetadata {
  return {
    userId: session.userId,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    device: session.deviceInfo,
    createdAt: session.createdAt,
    lastActivityAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
  };
}

/** Create a Prisma-backed JWT session; the optional duration is capped at 7d. */
export async function createSession(
  userId: string,
  metadata?: { userAgent?: string; ipAddress?: string; device?: string },
  customExpiryHours?: number,
): Promise<string> {
  const requested = customExpiryHours ?? DEFAULT_SESSION_EXPIRY_HOURS;
  const ttlHours = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, MAX_SESSION_AGE_HOURS)
    : DEFAULT_SESSION_EXPIRY_HOURS;
  return createSessionToken(userId, {
    method: 'security-manager',
    ttlHours,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
    deviceInfo: metadata?.device,
    isRefreshToken: ttlHours > DEFAULT_SESSION_EXPIRY_HOURS,
  });
}

/** Validate and touch an internal or client JWT/legacy session. */
export async function validateSession(token: string): Promise<SessionInfo | null> {
  const verified = await verifySessionToken(token, { audience: 'any' });
  if (!verified) return null;
  return {
    id: verified.session.id ?? '',
    token: '',
    metadata: toMetadata(verified.session),
    isActive: true,
  };
}

/** Destroy an authenticated user's session. */
export async function destroySession(token: string, userId?: string): Promise<boolean> {
  if (!token) return false;
  const verified = await verifySessionToken(token, { audience: 'any' });
  if (!verified || (userId && verified.userId !== userId)) return false;
  return revokeUserSession(verified.userId, token);
}

/** Revoke a session by its safe listing id or legacy creation timestamp. */
export async function destroyListedSession(
  userId: string,
  options: { sessionId?: string; sessionCreatedAt?: string },
): Promise<boolean> {
  if (options.sessionId) return revokeSessionById(userId, options.sessionId);
  if (options.sessionCreatedAt) return revokeSessionByCreatedAt(userId, options.sessionCreatedAt);
  return false;
}

/** Revoke all sessions for a user, or preserve the currently authenticated one. */
export async function destroyAllUserSessions(userId: string, currentToken?: string): Promise<number> {
  if (currentToken) return revokeOtherSessions(userId, currentToken);
  return revokeAllSessions(userId);
}

/** Rotate the current session, preserving its device metadata and lifetime class. */
export async function rotateSessionToken(oldToken: string): Promise<string | null> {
  const verified = await verifySessionToken(oldToken, { audience: 'any' });
  if (!verified) return null;
  const old = verified.session;
  const longLived = old.isRefreshToken === true;
  const token = await createSessionToken(old.userId, {
    method: 'security-rotation',
    ttlHours: longLived ? MAX_SESSION_AGE_HOURS : DEFAULT_SESSION_EXPIRY_HOURS,
    deviceInfo: old.deviceInfo,
    ipAddress: old.ipAddress,
    userAgent: old.userAgent,
    isRefreshToken: longLived,
  });
  await revokeUserSession(old.userId, oldToken);
  return token;
}

export async function getSessionCount(userId: string): Promise<number> {
  return (await listActiveSessions(userId)).length;
}

/** List current JWT rows plus still-live legacy records. */
export async function listUserSessions(userId: string): Promise<SessionInfo[]> {
  const sessions = await listActiveSessions(userId);
  return sessions.map((session) => ({
    id: session.id,
    token: session.token,
    metadata: toMetadata(session.session),
    isActive: true,
  }));
}
