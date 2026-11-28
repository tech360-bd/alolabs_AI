/**
 * Session lifecycle helpers for JWTs stored in Prisma Session rows.
 *
 * New sessions are signed JWTs, but every request also requires a matching
 * SHA-256 token digest in the database. Settings-backed opaque sessions are
 * supported temporarily for rolling upgrades and are cleaned up here too.
 */
import { db } from '@/lib/db';
import { hashSessionToken } from '@/lib/session-token';
import { clearSessionIndex, removeSessionIndexEntry } from '@/lib/session-index';
import {
  createSessionToken,
  deleteSessionToken,
  isSessionExpired,
  purgeExpiredSessions,
  revokeUserSessions,
  verifySessionToken,
  type SessionCreateOptions,
  type SessionRecord,
} from '@/lib/auth';

const REMEMBER_ME_TTL_HOURS = 30 * 24;
const DEFAULT_TTL_HOURS = 24;
const configuredIdleHours = Number(process.env.SESSION_IDLE_HOURS ?? 12);
const SESSION_IDLE_HOURS = Number.isFinite(configuredIdleHours) && configuredIdleHours >= 0 ? configuredIdleHours : 12;
const LEGACY_SESSION_PREFIX = 'session:';
const LEGACY_META_PREFIX = 'session:meta:';

export type SessionData = SessionRecord;

export interface SessionInfo {
  /** Database id, or a non-replayable digest-derived id for a legacy row. */
  id: string;
  /** Short digest label only; the replayable JWT is never listed. */
  token: string;
  session: SessionData;
}

export interface CreateSessionOptions {
  rememberMe?: boolean;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
}

type SessionRow = {
  id: string;
  userId: string;
  tokenHash: string;
  audience: string;
  method: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isRefreshToken: boolean;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

function sessionDataFromRow(row: SessionRow): SessionData {
  return {
    id: row.id,
    userId: row.userId,
    aud: row.audience === 'client' ? 'client' : 'internal',
    method: row.method,
    deviceInfo: row.deviceInfo ?? undefined,
    ipAddress: row.ipAddress ?? undefined,
    userAgent: row.userAgent ?? undefined,
    isRefreshToken: row.isRefreshToken,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function parseLegacySession(value: string): SessionData | null {
  try {
    const data = JSON.parse(value) as Partial<SessionData>;
    if (typeof data.userId !== 'string' || typeof data.createdAt !== 'string' || typeof data.expiresAt !== 'string') {
      return null;
    }
    return {
      ...(typeof data.id === 'string' ? { id: data.id } : {}),
      userId: data.userId,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      lastUsedAt: typeof data.lastUsedAt === 'string' ? data.lastUsedAt : data.createdAt,
      ...(data.aud === 'internal' || data.aud === 'client' ? { aud: data.aud } : {}),
      ...(typeof data.method === 'string' ? { method: data.method } : {}),
      ...(typeof data.deviceInfo === 'string' ? { deviceInfo: data.deviceInfo } : {}),
      ...(typeof data.ipAddress === 'string' ? { ipAddress: data.ipAddress } : {}),
      ...(typeof data.userAgent === 'string' ? { userAgent: data.userAgent } : {}),
      isRefreshToken: data.isRefreshToken === true,
    };
  } catch {
    return null;
  }
}

function matchesCreatedAt(value: string, isoCreatedAt: string): boolean {
  const valueTime = Date.parse(value);
  const targetTime = Date.parse(isoCreatedAt);
  return Number.isFinite(valueTime) && Number.isFinite(targetTime) && valueTime === targetTime;
}

/** Create a JWT with an absolute lifetime; remember-me sessions last 30 days. */
export async function createSession(
  userId: string,
  options: CreateSessionOptions = {},
): Promise<string> {
  const rememberMe = options.rememberMe === true;
  const sessionOptions: SessionCreateOptions = {
    method: 'session-manager',
    ttlHours: rememberMe ? REMEMBER_ME_TTL_HOURS : DEFAULT_TTL_HOURS,
    deviceInfo: options.deviceInfo,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    isRefreshToken: rememberMe,
  };
  return createSessionToken(userId, sessionOptions);
}

/** Validate a session through the single JWT/legacy verifier. */
export async function verifySession(token: string): Promise<SessionData | null> {
  if (!token) return null;
  const verified = await verifySessionToken(token);
  return verified?.session ?? null;
}

/** Revoke one JWT or legacy opaque token. */
export async function revokeSession(token: string): Promise<boolean> {
  if (!token) return false;
  const tokenHash = hashSessionToken(token);
  const [jwtSession, hashedLegacy, rawLegacy] = await Promise.all([
    db.session.findUnique({ where: { tokenHash }, select: { id: true } }).catch(() => null),
    db.settings.findUnique({ where: { key: `${LEGACY_SESSION_PREFIX}${tokenHash}` }, select: { id: true } }).catch(() => null),
    db.settings.findUnique({ where: { key: `${LEGACY_SESSION_PREFIX}${token}` }, select: { id: true } }).catch(() => null),
  ]);
  if (!jwtSession && !hashedLegacy && !rawLegacy) return false;
  await deleteSessionToken(token);
  return true;
}

/** Revoke a token only when it belongs to the authenticated owner. */
export async function revokeUserSession(userId: string, token: string): Promise<boolean> {
  const verified = await verifySessionToken(token, { audience: 'any' });
  if (!verified || verified.userId !== userId) return false;
  return revokeSession(token);
}

/** Revoke a listed database/legacy session without disclosing its bearer token. */
export async function revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  const row = await db.session.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (row) {
    const result = await db.session.deleteMany({ where: { id: row.id, userId } });
    return result.count > 0;
  }

  // Legacy sessions had no relational id. Their list identifier is a digest of
  // the Settings key suffix, so it remains safe to send to the browser.
  const legacyRows = await db.settings.findMany({
    where: { key: { startsWith: LEGACY_SESSION_PREFIX } },
    select: { id: true, key: true, value: true },
  });
  for (const legacy of legacyRows) {
    if (legacy.key.startsWith(LEGACY_META_PREFIX)) continue;
    const suffix = legacy.key.slice(LEGACY_SESSION_PREFIX.length);
    if (`legacy-${hashSessionToken(suffix)}` !== sessionId) continue;
    const session = parseLegacySession(legacy.value);
    if (!session || session.userId !== userId) return false;
    await db.settings.delete({ where: { id: legacy.id } });
    await removeSessionIndexEntry(userId, suffix).catch(() => undefined);
    return true;
  }
  return false;
}

/** Revoke one listed session by its creation timestamp (legacy API compatibility). */
export async function revokeSessionByCreatedAt(userId: string, createdAt: string): Promise<boolean> {
  const targetTime = Date.parse(createdAt);
  if (!Number.isFinite(targetTime)) return false;

  const rows = await db.session.findMany({
    where: { userId },
    select: { id: true, createdAt: true },
  });
  const jwtRow = rows.find((row) => row.createdAt.getTime() === targetTime);
  if (jwtRow) {
    const result = await db.session.deleteMany({ where: { id: jwtRow.id, userId } });
    return result.count > 0;
  }

  const legacyRows = await db.settings.findMany({
    where: { key: { startsWith: LEGACY_SESSION_PREFIX } },
    select: { id: true, key: true, value: true },
  });
  for (const legacy of legacyRows) {
    if (legacy.key.startsWith(LEGACY_META_PREFIX)) continue;
    const session = parseLegacySession(legacy.value);
    if (!session || session.userId !== userId || !matchesCreatedAt(session.createdAt, createdAt)) continue;
    await db.settings.delete({ where: { id: legacy.id } });
    await removeSessionIndexEntry(userId, legacy.key.slice(LEGACY_SESSION_PREFIX.length)).catch(() => undefined);
    return true;
  }
  return false;
}

/** Revoke all sessions for a user, including legacy Settings-backed records. */
export async function revokeAllSessions(userId: string): Promise<number> {
  return revokeUserSessions(userId);
}

/** Revoke all sessions except the presented JWT/opaque token. */
export async function revokeOtherSessions(userId: string, currentToken: string): Promise<number> {
  const currentHash = hashSessionToken(currentToken);
  const rows = await db.session.findMany({
    where: { userId },
    select: { id: true, tokenHash: true },
  });
  const jwtIds = rows.filter((row) => row.tokenHash !== currentHash).map((row) => row.id);
  const jwtResult = jwtIds.length
    ? await db.session.deleteMany({ where: { userId, id: { in: jwtIds } } })
    : { count: 0 };

  const legacyRows = await db.settings.findMany({
    where: { key: { startsWith: LEGACY_SESSION_PREFIX } },
    select: { id: true, key: true, value: true },
  });
  let legacyRevoked = 0;
  for (const row of legacyRows) {
    if (row.key.startsWith(LEGACY_META_PREFIX)) continue;
    const record = parseLegacySession(row.value);
    const keySuffix = row.key.slice(LEGACY_SESSION_PREFIX.length);
    const currentLegacyKey = keySuffix === currentHash || keySuffix === currentToken;
    if (record?.userId !== userId || currentLegacyKey) continue;
    await db.settings.delete({ where: { id: row.id } });
    await removeSessionIndexEntry(userId, keySuffix).catch(() => undefined);
    legacyRevoked += 1;
  }

  // Drop stale legacy metadata; the hashed DB session row is authoritative for
  // current sessions and the legacy primary rows remain independently usable.
  await db.settings.deleteMany({ where: { key: { startsWith: `${LEGACY_META_PREFIX}${userId}:` } } }).catch(() => undefined);
  await clearSessionIndex(userId).catch(() => undefined);
  return jwtResult.count + legacyRevoked;
}

/** List active sessions without ever exposing a replayable bearer token. */
export async function listActiveSessions(userId: string): Promise<SessionInfo[]> {
  const now = new Date();
  const rows = await db.session.findMany({
    where: { userId, expiresAt: { gt: now }, revokedAt: null },
    orderBy: { lastUsedAt: 'desc' },
  });
  const results: SessionInfo[] = rows
    .filter((row) => SESSION_IDLE_HOURS <= 0 || now.getTime() - row.lastUsedAt.getTime() <= SESSION_IDLE_HOURS * 60 * 60 * 1000)
    .map((row) => ({
      id: row.id,
      token: row.tokenHash.slice(0, 8),
      session: sessionDataFromRow(row),
    }));

  // Include sessions created by older deployments until they expire. The row
  // key suffix may be a legacy raw token, so return only a digest-derived id
  // and display label, never that suffix.
  const legacyRows = await db.settings.findMany({
    where: { key: { startsWith: LEGACY_SESSION_PREFIX } },
    select: { key: true, value: true },
  });
  for (const row of legacyRows) {
    if (row.key.startsWith(LEGACY_META_PREFIX)) continue;
    const session = parseLegacySession(row.value);
    if (!session || session.userId !== userId || isSessionExpired(session, now)) continue;
    const suffix = row.key.slice(LEGACY_SESSION_PREFIX.length);
    const id = `legacy-${hashSessionToken(suffix)}`;
    if (results.some((result) => result.id === id)) continue;
    results.push({ id, token: hashSessionToken(suffix).slice(0, 8), session });
  }
  return results;
}

/** Remove expired JWT and legacy sessions. */
export async function cleanupExpiredSessions(): Promise<number> {
  return purgeExpiredSessions();
}

/** Rotate an active session into a new JWT and immediately revoke the old token. */
export async function refreshSession(token: string): Promise<string | null> {
  const verified = await verifySessionToken(token, { audience: 'any' });
  if (!verified) return null;

  const old = verified.session;
  const keepLongLived = old.isRefreshToken === true;
  const next = await createSessionToken(old.userId, {
    method: 'refresh',
    ttlHours: keepLongLived ? REMEMBER_ME_TTL_HOURS : DEFAULT_TTL_HOURS,
    deviceInfo: old.deviceInfo,
    ipAddress: old.ipAddress,
    userAgent: old.userAgent,
    isRefreshToken: keepLongLived,
  });
  await deleteSessionToken(token);
  return next;
}
