import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { hashSessionToken, sessionKey, legacySessionKey } from './session-token';
import { removeSessionFromIndex, removeSessionIndexEntry, userSessionsKey } from './session-index';
import { audienceForRole, audienceForToken, type Audience } from './access/surfaces';
import { recordAccessViolation } from './access/audit';

const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = '24h';
const configuredSessionTtl = Number(process.env.SESSION_TTL_HOURS ?? 24);
const configuredIdleHours = Number(process.env.SESSION_IDLE_HOURS ?? 12);
const SESSION_TTL_HOURS = Number.isFinite(configuredSessionTtl) && configuredSessionTtl > 0 ? configuredSessionTtl : 24;
const SESSION_IDLE_HOURS = Number.isFinite(configuredIdleHours) && configuredIdleHours >= 0 ? configuredIdleHours : 12;
/** Avoid a database write on every authenticated request. */
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set (>= 32 chars) in production');
  }
  // Development/test only: a per-process random secret. Never a hardcoded key.
  if (!globalThis.__aloDevJwtSecret) {
    globalThis.__aloDevJwtSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.__aloDevJwtSecret;
}

declare global {
  var __aloDevJwtSecret: string | undefined;
}

// ─── JWT Functions ──────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  role?: string;
  jti?: string;
  aud?: Audience;
  iat?: number;
  exp?: number;
}

export function signToken(payload: JwtPayload, expiresIn: number | string = JWT_EXPIRES_IN): string {
  return jwt.sign(payload, resolveJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
}

/** Verifies the signature and pins JWTs to HS256; malformed/expired tokens fail closed. */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, resolveJwtSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload & Partial<JwtPayload>;
    const userId = typeof decoded.userId === 'string'
      ? decoded.userId
      : typeof decoded.sub === 'string'
        ? decoded.sub
        : null;
    if (!userId) return null;
    return { ...decoded, userId };
  } catch {
    return null;
  }
}

// ─── Password Functions ─────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** @deprecated Use comparePassword instead */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Database-backed JWT Sessions ────────────────────────────────────────────

export interface SessionRecord {
  /** Prisma Session.id; absent only on legacy Settings-backed sessions. */
  id?: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  method?: string;
  aud?: Audience;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  isRefreshToken?: boolean;
}

export interface SessionCreateOptions {
  method?: string;
  ttlHours?: number;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  isRefreshToken?: boolean;
}

export interface SessionVerifyOptions {
  /** Passive verification must not prolong an idle browser session. */
  touch?: boolean;
  /** Defaults to internal. Only client and shared-account handlers opt out. */
  audience?: Audience | 'any';
}

export interface VerifiedSession {
  userId: string;
  session: SessionRecord;
  audience: Audience;
  role: string;
}

interface PrismaSessionRow {
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
}

/** The owner's current role is authoritative; claims never grant access by themselves. */
async function loadSessionOwner(userId: string): Promise<{ role: string; isActive: boolean } | null> {
  const owner = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!owner || typeof owner.role !== 'string') return null;
  return { role: owner.role, isActive: owner.isActive !== false };
}

function toSessionRecord(row: PrismaSessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    method: row.method,
    aud: row.audience === 'client' ? 'client' : 'internal',
    deviceInfo: row.deviceInfo ?? undefined,
    ipAddress: row.ipAddress ?? undefined,
    userAgent: row.userAgent ?? undefined,
    isRefreshToken: row.isRefreshToken,
  };
}

export async function createSessionToken(userId: string, options: SessionCreateOptions = {}): Promise<string> {
  const owner = await loadSessionOwner(userId);
  if (!owner || !owner.isActive) throw new Error('Cannot create a session for a missing or inactive user');

  const audience = audienceForRole(owner.role);
  const now = new Date();
  const ttlHours = options.ttlHours && Number.isFinite(options.ttlHours) && options.ttlHours > 0
    ? options.ttlHours
    : SESSION_TTL_HOURS;
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  const pendingHash = `pending:${crypto.randomBytes(24).toString('hex')}`;
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: pendingHash,
      audience,
      method: options.method ?? 'password',
      deviceInfo: options.deviceInfo?.slice(0, 191),
      ipAddress: options.ipAddress?.slice(0, 191),
      userAgent: options.userAgent?.slice(0, 191),
      isRefreshToken: options.isRefreshToken ?? false,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    },
    select: { id: true },
  });

  const token = signToken({ userId, role: owner.role, jti: session.id, aud: audience }, Math.floor(ttlHours * 60 * 60));
  try {
    await db.session.update({
      where: { id: session.id },
      data: { tokenHash: hashSessionToken(token) },
    });
  } catch (error) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    throw error;
  }

  return token;
}

function parseSessionRecord(raw: string): SessionRecord | null {
  try {
    const data = JSON.parse(raw) as Partial<SessionRecord> & { id?: string };
    const userId = typeof data.userId === 'string' ? data.userId : undefined;
    if (!userId || typeof data.expiresAt !== 'string' || typeof data.createdAt !== 'string') return null;
    return {
      ...(typeof data.id === 'string' ? { id: data.id } : {}),
      userId,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      lastUsedAt: typeof data.lastUsedAt === 'string' ? data.lastUsedAt : data.createdAt,
      method: typeof data.method === 'string' ? data.method : undefined,
      ...(data.aud === 'internal' || data.aud === 'client' ? { aud: data.aud } : {}),
      deviceInfo: typeof data.deviceInfo === 'string' ? data.deviceInfo : undefined,
      ipAddress: typeof data.ipAddress === 'string' ? data.ipAddress : undefined,
      userAgent: typeof data.userAgent === 'string' ? data.userAgent : undefined,
      isRefreshToken: data.isRefreshToken === true,
    };
  } catch {
    return null;
  }
}

export function isSessionExpired(record: SessionRecord, now: Date = new Date()): boolean {
  const expiresAt = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return true;
  const lastUsed = Date.parse(record.lastUsedAt);
  return SESSION_IDLE_HOURS > 0
    && Number.isFinite(lastUsed)
    && now.getTime() - lastUsed > SESSION_IDLE_HOURS * 60 * 60 * 1000;
}

async function verifyJwtSession(
  token: string,
  payload: JwtPayload,
  options: SessionVerifyOptions,
): Promise<VerifiedSession | null> {
  if (!payload.jti || !payload.aud) return null;

  const row = await db.session.findUnique({ where: { id: payload.jti } }) as PrismaSessionRow | null;
  if (!row || row.revokedAt || row.tokenHash !== hashSessionToken(token)) return null;
  if (row.userId !== payload.userId || row.audience !== payload.aud) return null;

  const record = toSessionRecord(row);
  const now = new Date();
  if (isSessionExpired(record, now)) {
    await db.session.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }

  const owner = await loadSessionOwner(row.userId);
  if (!owner || !owner.isActive) {
    await db.session.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }

  const audience = audienceForRole(owner.role);
  if (record.aud !== audience || audienceForToken(token) !== audience) {
    await db.session.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }

  const expected = options.audience ?? 'internal';
  if (expected !== 'any' && expected !== audience) {
    await recordAccessViolation({
      type: audience === 'client' ? 'client_to_internal_denied' : 'internal_to_client_denied',
      userId: row.userId,
      role: owner.role,
      reason: `session audience "${audience}" presented to the ${expected} surface`,
    });
    return null;
  }

  if (options.touch !== false && now.getTime() - row.lastUsedAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    record.lastUsedAt = now.toISOString();
    await db.session.update({ where: { id: row.id }, data: { lastUsedAt: now } }).catch(() => undefined);
  }
  return { userId: row.userId, session: record, audience, role: owner.role };
}

/** Re-key a legacy raw-token row to its hashed Settings key on first valid use. */
async function migrateLegacySessionKey(token: string, value: string): Promise<void> {
  const hashed = sessionKey(token);
  const legacy = legacySessionKey(token);
  try {
    await db.settings.upsert({
      where: { key: hashed },
      update: { value, updatedAt: new Date() },
      create: { key: hashed, value, type: 'json' },
    });
    await db.settings.delete({ where: { key: legacy } });
  } catch {
    // Leave the legacy row in place; the next valid request can retry.
  }
}

async function verifyLegacySession(
  token: string,
  options: SessionVerifyOptions,
): Promise<VerifiedSession | null> {
  let stored = await db.settings.findUnique({ where: { key: sessionKey(token) } });
  let key = sessionKey(token);

  if (!stored) {
    const legacy = await db.settings.findUnique({ where: { key: legacySessionKey(token) } });
    if (!legacy) return null;
    const legacyRecord = parseSessionRecord(legacy.value);
    if (legacyRecord && !isSessionExpired(legacyRecord)) {
      await migrateLegacySessionKey(token, legacy.value);
      stored = await db.settings.findUnique({ where: { key: sessionKey(token) } });
      if (!stored) {
        // Keep a valid old session working if the best-effort re-key failed.
        stored = legacy;
        key = legacySessionKey(token);
      }
    } else {
      stored = legacy;
      key = legacySessionKey(token);
    }
  }

  const record = parseSessionRecord(stored.value);
  const now = new Date();
  if (!record || isSessionExpired(record, now)) {
    await deleteSessionToken(token);
    return null;
  }

  const owner = await loadSessionOwner(record.userId);
  if (!owner || !owner.isActive) {
    await deleteSessionToken(token);
    return null;
  }

  const audience = audienceForRole(owner.role);
  if ((record.aud && record.aud !== audience) || audienceForToken(token) !== audience) {
    await deleteSessionToken(token);
    return null;
  }

  const expected = options.audience ?? 'internal';
  if (expected !== 'any' && expected !== audience) {
    await recordAccessViolation({
      type: audience === 'client' ? 'client_to_internal_denied' : 'internal_to_client_denied',
      userId: record.userId,
      role: owner.role,
      reason: `legacy session audience "${audience}" presented to the ${expected} surface`,
    });
    return null;
  }

  if (!record.aud) record.aud = audience;
  if (options.touch !== false && now.getTime() - Date.parse(record.lastUsedAt) > SESSION_TOUCH_INTERVAL_MS) {
    record.lastUsedAt = now.toISOString();
    await db.settings.update({
      where: { key },
      data: { value: JSON.stringify(record), updatedAt: now },
    }).catch(() => undefined);
  }
  return { userId: record.userId, session: record, audience, role: owner.role };
}

/**
 * Validate the JWT signature/expiry, the matching DB Session row, the active
 * account, current audience, absolute/idle expiry and caller's route audience.
 * Opaque Settings-backed tokens are accepted only as a rolling-upgrade path.
 */
export async function verifySessionToken(
  token: string,
  options: SessionVerifyOptions = {},
): Promise<VerifiedSession | null> {
  if (!token || typeof token !== 'string' || token.length > 4096) return null;

  if (token.split('.').length === 3) {
    const payload = verifyToken(token);
    return payload ? verifyJwtSession(token, payload, options) : null;
  }
  return verifyLegacySession(token, options);
}

/** Revoke every database-backed and legacy session for a user. */
export async function revokeUserSessions(userId: string, client: Pick<typeof db, 'session' | 'settings'> = db): Promise<number> {
  const jwt = await client.session.deleteMany({ where: { userId } });
  const legacy = await client.settings.findMany({ where: { key: { startsWith: 'session:' } }, select: { id: true, key: true, value: true } });
  const ids = legacy.filter(row => !row.key.startsWith('session:meta:') && parseSessionRecord(row.value)?.userId === userId).map(row => row.id);
  const removed = ids.length ? await client.settings.deleteMany({ where: { id: { in: ids } } }) : { count: 0 };
  await client.settings.deleteMany({ where: { OR: [{ key: { startsWith: `session:meta:${userId}:` } }, { key: userSessionsKey(userId) }] } });
  return jwt.count + removed.count;
}

/** Remove expired JWT rows and expired legacy Settings rows. */
export async function purgeExpiredSessions(now: Date = new Date()): Promise<number> {
  const dbRows = await db.session.findMany({
    select: { id: true, userId: true, expiresAt: true, lastUsedAt: true },
  });
  const expiredDb = dbRows.filter((row) => isSessionExpired({
    userId: row.userId,
    createdAt: row.expiresAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
  }, now));
  const dbResult = expiredDb.length
    ? await db.session.deleteMany({ where: { id: { in: expiredDb.map((row) => row.id) } } })
    : { count: 0 };

  const settingsRows = await db.settings.findMany({
    where: { key: { startsWith: 'session:' } },
    select: { id: true, key: true, value: true },
  });
  let legacyPurged = 0;
  for (const row of settingsRows) {
    if (row.key.startsWith('session:meta:')) continue;
    const record = parseSessionRecord(row.value);
    if (!record || isSessionExpired(record, now)) {
      await db.settings.delete({ where: { id: row.id } }).catch(() => undefined);
      if (record) {
        await removeSessionIndexEntry(record.userId, row.key.slice('session:'.length)).catch(() => undefined);
      }
      legacyPurged += 1;
    }
  }
  return dbResult.count + legacyPurged;
}

function ignoreConcurrentRemoval(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2025') throw error;
}

/** Delete by token digest (JWT or legacy) and remove its legacy index entry. */
export async function deleteSessionToken(token: string): Promise<void> {
  if (!token || typeof token !== 'string') return;
  const tokenHash = hashSessionToken(token);
  let userId: string | undefined;

  const dbSession = await db.session.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true },
  });
  if (dbSession) {
    userId = dbSession.userId;
    await db.session.delete({ where: { id: dbSession.id } }).catch(ignoreConcurrentRemoval);
  }

  for (const key of [sessionKey(token), legacySessionKey(token)]) {
    const row = await db.settings.findUnique({ where: { key } });
    if (!row) continue;
    if (!userId) userId = parseSessionRecord(row.value)?.userId;
    await db.settings.delete({ where: { key } }).catch(ignoreConcurrentRemoval);
  }
  if (userId) await removeSessionFromIndex(userId, token).catch(() => undefined);
}
