import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db';

const SALT_ROUNDS = 12;
const TOKEN_LENGTH = 48;
const JWT_EXPIRES_IN = '24h';

/**
 * Session lifetime. Sessions are opaque random tokens persisted in the
 * Settings table (`session:<token>`), with explicit `expiresAt` and an idle
 * timeout, so a leaked token cannot be used forever and a restart never
 * resurrects a revoked session.
 */
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 24);
const SESSION_IDLE_HOURS = Number(process.env.SESSION_IDLE_HOURS ?? 12);
/** How often (ms) lastUsedAt is written back; avoids a write per request. */
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set (>= 32 chars) in production');
  }
  // Development/test only: a per-process random secret. Never a hardcoded string.
  if (!globalThis.__aloDevJwtSecret) {
    globalThis.__aloDevJwtSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.__aloDevJwtSecret;
}

declare global {
  var __aloDevJwtSecret: string | undefined;
}

// ─── JWT Functions ─────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  role?: string;
}

export function signToken(payload: JwtPayload, expiresIn: number | string = JWT_EXPIRES_IN): string {
  return jwt.sign(payload, resolveJwtSecret(), { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, resolveJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

// ─── Password Functions ────────────────────────────────────────────

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

// ─── Session Token Functions (DB-backed) ───────────────────────────

export interface SessionRecord {
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  /** Free-form origin marker: password, oauth:<provider>, mfa */
  method?: string;
}

export interface SessionCreateOptions {
  method?: string;
  ttlHours?: number;
}

function sessionKey(token: string): string {
  return `session:${token}`;
}

export async function createSessionToken(userId: string, options: SessionCreateOptions = {}): Promise<string> {
  const token = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
  const now = new Date();
  const ttlHours = options.ttlHours && options.ttlHours > 0 ? options.ttlHours : SESSION_TTL_HOURS;
  const record: SessionRecord = {
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString(),
    lastUsedAt: now.toISOString(),
    method: options.method,
  };
  await db.settings.upsert({
    where: { key: sessionKey(token) },
    update: { value: JSON.stringify(record), updatedAt: now },
    create: { key: sessionKey(token), value: JSON.stringify(record), type: 'json' },
  });
  return token;
}

function parseSessionRecord(raw: string): SessionRecord | null {
  try {
    const data = JSON.parse(raw) as Partial<SessionRecord> & { id?: string };
    const userId = typeof data.userId === 'string' ? data.userId : typeof data.id === 'string' ? data.id : undefined;
    if (!userId) return null;
    // Legacy sessions (created before expiry enforcement) carry no expiresAt.
    // They are treated as expired: the user must sign in again once.
    if (typeof data.expiresAt !== 'string' || typeof data.createdAt !== 'string') return null;
    return {
      userId,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      lastUsedAt: typeof data.lastUsedAt === 'string' ? data.lastUsedAt : data.createdAt,
      method: typeof data.method === 'string' ? data.method : undefined,
    };
  } catch {
    return null;
  }
}

export function isSessionExpired(record: SessionRecord, now: Date = new Date()): boolean {
  const expiresAt = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return true;
  const lastUsed = Date.parse(record.lastUsedAt);
  if (SESSION_IDLE_HOURS > 0 && Number.isFinite(lastUsed)) {
    if (now.getTime() - lastUsed > SESSION_IDLE_HOURS * 60 * 60 * 1000) return true;
  }
  return false;
}

/**
 * Validates an opaque session token: it must exist, be well-formed, be
 * unexpired (absolute TTL and idle timeout). Expired sessions are deleted.
 * Successful validation refreshes lastUsedAt at most every few minutes.
 */
export async function verifySessionToken(token: string): Promise<{ userId: string; session: SessionRecord } | null> {
  if (!token || typeof token !== 'string' || token.length > 512) return null;
  const session = await db.settings.findUnique({ where: { key: sessionKey(token) } });
  if (!session) return null;
  const record = parseSessionRecord(session.value);
  const now = new Date();
  if (!record || isSessionExpired(record, now)) {
    await deleteSessionToken(token);
    return null;
  }
  if (now.getTime() - Date.parse(record.lastUsedAt) > SESSION_TOUCH_INTERVAL_MS) {
    record.lastUsedAt = now.toISOString();
    await db.settings.update({
      where: { key: sessionKey(token) },
      data: { value: JSON.stringify(record), updatedAt: now },
    }).catch(() => { /* best-effort touch */ });
  }
  return { userId: record.userId, session: record };
}

/** Deletes every session that belongs to a user (password change, admin revoke). */
export async function revokeUserSessions(userId: string): Promise<number> {
  const sessions = await db.settings.findMany({ where: { key: { startsWith: 'session:' } }, select: { id: true, value: true } });
  let revoked = 0;
  for (const session of sessions) {
    try {
      const data = JSON.parse(session.value) as { userId?: string };
      if (data.userId === userId) {
        await db.settings.delete({ where: { id: session.id } });
        revoked += 1;
      }
    } catch { /* skip malformed */ }
  }
  return revoked;
}

/** Removes expired session rows. Safe to run periodically. */
export async function purgeExpiredSessions(now: Date = new Date()): Promise<number> {
  const sessions = await db.settings.findMany({ where: { key: { startsWith: 'session:' } }, select: { id: true, key: true, value: true } });
  let purged = 0;
  for (const session of sessions) {
    if (session.key.startsWith('session:meta:')) continue;
    const record = parseSessionRecord(session.value);
    if (!record || isSessionExpired(record, now)) {
      await db.settings.delete({ where: { id: session.id } }).catch(() => undefined);
      purged += 1;
    }
  }
  return purged;
}

export async function deleteSessionToken(token: string): Promise<void> {
  try {
    await db.settings.delete({
      where: { key: `session:${token}` },
    });
  } catch {
    // Session may already be deleted
  }
}
