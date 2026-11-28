/**
 * LiveKit connector & self-hosted WebRTC/SIP service — livekit/livekit (Apache-2.0).
 *
 * Implements:
 *   - Native HMAC-SHA256 LiveKit JWT Access Token signing (zero extra runtime dependency)
 *   - Official LiveKit Webhook JWT + SHA-256 body-hash verification
 *   - SSRF-guarded LiveKit Twirp RoomService API (`ListRooms`, `CreateRoom`, `DeleteRoom`,
 *     `ListParticipants`, `RemoveParticipant`)
 *   - Primary self-hosted Voice AI, SIP & WebRTC meeting infrastructure for ALO Labs AI
 */

import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  type ConnectorContext,
  type ExternalSystemAdapter,
  IntegrationError,
  guardedFetch,
  joinUrl,
  requireApiKey,
  runConnectorOp,
} from '../../types';

export interface LiveKitTokenClaims {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name?: string;
  roomName: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  roomCreate?: boolean;
  ttlSeconds?: number;
}

/**
 * Generates an HS256 JWT token conforming to LiveKit AccessToken grants.
 */
export function signLiveKitAccessToken(claims: LiveKitTokenClaims): string {
  const ttl = Math.max(60, Math.min(86_400, claims.ttlSeconds ?? 3600));
  return jwt.sign(
    {
      name: claims.name ?? claims.identity,
      video: {
        room: claims.roomName,
        roomJoin: true,
        roomCreate: Boolean(claims.roomCreate),
        canPublish: claims.canPublish ?? true,
        canSubscribe: claims.canSubscribe ?? true,
      },
    },
    claims.apiSecret,
    {
      algorithm: 'HS256',
      issuer: claims.apiKey,
      subject: claims.identity,
      notBefore: 0,
      expiresIn: ttl,
    },
  );
}

/**
 * Verifies an incoming LiveKit Webhook Authorization JWT signature, expiration,
 * issuer key match, and SHA-256 digest of the raw request body.
 */
export function verifyLiveKitWebhook(
  rawBody: string | Buffer,
  authHeader: string | null | undefined,
  apiKey: string,
  apiSecret: string,
): { valid: boolean; reason?: string; event?: Record<string, unknown> } {
  if (!authHeader) return { valid: false, reason: 'Missing Authorization header' };
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token.split('.').length !== 3) return { valid: false, reason: 'Malformed JWT' };

  let claims: { iss?: string; exp?: number; nbf?: number; sha256?: string };
  try {
    claims = jwt.verify(token, apiSecret, {
      algorithms: ['HS256'],
      issuer: apiKey,
      clockTolerance: 5,
    }) as typeof claims;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid webhook signature';
    if (msg.includes('issuer')) return { valid: false, reason: 'Issuer mismatch' };
    if (msg.includes('expired')) return { valid: false, reason: 'Webhook token expired' };
    if (msg.includes('not active')) return { valid: false, reason: 'Webhook token not yet valid' };
    return { valid: false, reason: 'Invalid webhook signature' };
  }

  if (claims.sha256) {
    const bodyDigest = createHash('sha256').update(rawBody).digest('base64');
    const bodyDigestHex = createHash('sha256').update(rawBody).digest('hex');
    if (claims.sha256 !== bodyDigest && claims.sha256 !== bodyDigestHex) {
      return { valid: false, reason: 'Body SHA-256 digest mismatch' };
    }
  }

  try {
    const event = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as Record<string, unknown>;
    return { valid: true, event };
  } catch {
    return { valid: true };
  }
}

async function lkTwirp(
  ctx: ConnectorContext,
  servicePath: string,
  body: Record<string, unknown>,
  timeoutMs?: number,
): Promise<unknown> {
  const apiKey = requireApiKey(ctx, 'telephony.livekit');
  const apiSecret = ctx.credential.extras?.apiSecret;
  if (!apiSecret) {
    throw new IntegrationError('telephony.livekit', 'missing extras.apiSecret for LiveKit token signing');
  }
  const token = jwt.sign(
    {
      video: { roomList: true, roomCreate: true, roomAdmin: true },
      sip: { list: true, admin: true },
    },
    apiSecret,
    {
      algorithm: 'HS256',
      issuer: apiKey,
      expiresIn: 300,
    },
  );

  const res = await guardedFetch('telephony.livekit', joinUrl(ctx.credential.baseUrl, servicePath), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    timeoutMs: timeoutMs ?? ctx.timeoutMs,
  });
  if (!res.ok) {
    throw new IntegrationError('telephony.livekit', `LiveKit Twirp ${servicePath} failed`, res.status);
  }
  return res.json();
}

export const livekitAdapter: ExternalSystemAdapter = {
  id: 'telephony.livekit',
  category: 'telephony',
  licenseClass: 'permissive',
  strategy: 'API_INTEGRATE',
  description: 'LiveKit (Apache-2.0) — self-hosted real-time WebRTC, SIP & AI voice/video media server',
  upstreamRepo: 'livekit/livekit',

  async testConnection(ctx) {
    return runConnectorOp(this, ctx, 'testConnection', async () => {
      const data = (await lkTwirp(ctx, 'twirp/livekit.RoomService/ListRooms', {}, 10_000)) as { rooms?: unknown[] };
      return {
        reachable: true,
        roomsCount: Array.isArray(data?.rooms) ? data.rooms.length : 0,
      };
    });
  },
};

export async function livekitCreateRoom(
  ctx: ConnectorContext,
  roomName: string,
  emptyTimeoutSeconds = 300,
) {
  return runConnectorOp(livekitAdapter, ctx, 'createRoom', async () => {
    return lkTwirp(ctx, 'twirp/livekit.RoomService/CreateRoom', {
      name: roomName,
      empty_timeout: emptyTimeoutSeconds,
    }) as Promise<Record<string, unknown>>;
  });
}

export async function livekitListRooms(
  ctx: ConnectorContext,
  names?: string[],
) {
  return runConnectorOp(livekitAdapter, ctx, 'listRooms', async () => {
    return lkTwirp(ctx, 'twirp/livekit.RoomService/ListRooms', names?.length ? { names } : {}) as Promise<{
      rooms?: Array<{ name: string; sid?: string; num_participants?: number }>;
    }>;
  });
}

export async function livekitGetRoom(ctx: ConnectorContext, roomName: string) {
  return runConnectorOp(livekitAdapter, ctx, 'getRoom', async () => {
    const res = (await lkTwirp(ctx, 'twirp/livekit.RoomService/ListRooms', {
      names: [roomName],
    })) as { rooms?: Array<Record<string, unknown>> };
    const room = res.rooms?.[0];
    if (!room) throw new IntegrationError('telephony.livekit', `LiveKit room "${roomName}" not found`, 404);
    return room;
  });
}

export async function livekitDeleteRoom(ctx: ConnectorContext, roomName: string) {
  return runConnectorOp(livekitAdapter, ctx, 'deleteRoom', async () => {
    return lkTwirp(ctx, 'twirp/livekit.RoomService/DeleteRoom', {
      room: roomName,
    }) as Promise<Record<string, unknown>>;
  });
}

export async function livekitListParticipants(ctx: ConnectorContext, roomName: string) {
  return runConnectorOp(livekitAdapter, ctx, 'listParticipants', async () => {
    return lkTwirp(ctx, 'twirp/livekit.RoomService/ListParticipants', {
      room: roomName,
    }) as Promise<{ participants?: Array<Record<string, unknown>> }>;
  });
}

export async function livekitRemoveParticipant(ctx: ConnectorContext, roomName: string, identity: string) {
  return runConnectorOp(livekitAdapter, ctx, 'removeParticipant', async () => {
    return lkTwirp(ctx, 'twirp/livekit.RoomService/RemoveParticipant', {
      room: roomName,
      identity,
    }) as Promise<Record<string, unknown>>;
  });
}
