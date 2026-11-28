import crypto from 'crypto';
import { db } from './db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GatewayRequest {
  headers: {
    authorization?: string;
    'x-alo-company-id'?: string;
    'x-alo-user-id'?: string;
    'x-alo-request-id'?: string;
    'x-alo-timestamp'?: string;
    'x-alo-signature'?: string;
  };
  body?: unknown;
  url: string;
  method: string;
}

export interface GatewayResult {
  authenticated: boolean;
  company: { id: string; name: string; slug: string } | null;
  user: { id: string; role: string } | null;
  apiKey: { id: string; scopes: string[]; rateLimit: number } | null;
  error?: string;
  errorCode?: number;
}

// ─── In-memory rate limit store ─────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every 60 seconds (do not keep process alive on its own)
if (typeof globalThis !== 'undefined') {
  const interval = setInterval(cleanupRateLimits, 60_000);
  interval.unref?.();
}

// ─── HMAC helpers ────────────────────────────────────────────────────────────

/**
 * Hash an API key using SHA-256 (matches how keys are stored in CompanyApiKey.keyHash)
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Verify an HMAC-SHA256 signature
 */
export function verifyHMAC(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}

/**
 * Generate an HMAC-SHA256 signature
 */
export function generateHMAC(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// ─── API Key Verification ────────────────────────────────────────────────────

/**
 * Verify an API key against the CompanyApiKey table
 * Returns the key record if valid, null otherwise
 */
export async function verifyApiKey(apiKey: string) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return null;
  }
  const keyHash = hashApiKey(apiKey);
  const keyRecord = await db.companyApiKey.findUnique({
    where: { keyHash },
    include: {
      company: {
        select: { id: true, name: true, slug: true, status: true },
      },
    },
  });

  if (!keyRecord) return null;
  if (!keyRecord.isActive) return null;

  // Check expiration
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return null;
  }

  // Check company status
  if (keyRecord.company.status !== 'active') {
    return null;
  }

  // Update last used
  await db.companyApiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  let scopes: string[] = [];
  try {
    scopes = JSON.parse(keyRecord.scopes || '[]');
  } catch {
    scopes = [];
  }

  return {
    id: keyRecord.id,
    keyPrefix: keyRecord.keyPrefix,
    keyType: keyRecord.keyType,
    scopes,
    rateLimit: keyRecord.rateLimit,
    company: keyRecord.company,
  };
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/**
 * Check and enforce per-minute rate limit for an API key
 * Returns true if the request is within limits, false if rate limited
 */
export function checkRateLimit(apiKeyId: string, limit: number = 1000): boolean {
  const now = Date.now();
  const windowKey = `${apiKeyId}:${Math.floor(now / 60_000)}`;

  const entry = rateLimitStore.get(windowKey);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(windowKey, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

// ─── Service Permission ──────────────────────────────────────────────────────

/**
 * Check if a company has access to a specific service
 */
export async function checkServicePermission(
  companyId: string,
  service: string
): Promise<boolean> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      status: true,
      paidApiAllowed: true,
      smsAllowed: true,
      whatsappBulkAllowed: true,
      publicPublishAllowed: true,
      allowedWorkflows: true,
    },
  });

  if (!company || company.status !== 'active') return false;

  const serviceMap: Record<string, (c: NonNullable<typeof company>) => boolean> = {
    'paid-api': (c) => c.paidApiAllowed,
    'sms': (c) => c.smsAllowed,
    'whatsapp-bulk': (c) => c.whatsappBulkAllowed,
    'public-publish': (c) => c.publicPublishAllowed,
  };

  if (service in serviceMap) {
    return serviceMap[service](company);
  }

  // For workflow-based services, check allowedWorkflows JSON
  try {
    const allowed: string[] = JSON.parse(company.allowedWorkflows || '[]');
    return allowed.includes('*') || allowed.includes(service);
  } catch {
    return false;
  }
}

// ─── Full Gateway Validation ─────────────────────────────────────────────────

/**
 * Validate a complete gateway request with API key, HMAC, rate limit, and user context
 */
export async function validateGatewayRequest(
  req: GatewayRequest
): Promise<GatewayResult> {
  const { headers } = req;

  // 1. Extract API key from Authorization header
  let apiKeyValue: string | null = null;

  if (headers.authorization?.startsWith('Bearer ')) {
    apiKeyValue = headers.authorization.substring(7).trim();
  } else if (headers.authorization?.startsWith('ApiKey ')) {
    apiKeyValue = headers.authorization.substring(7).trim();
  }

  if (!apiKeyValue) {
    return {
      authenticated: false,
      company: null,
      user: null,
      apiKey: null,
      error: 'Missing or invalid Authorization header. Use: Bearer <api-key> or ApiKey <api-key>',
      errorCode: 401,
    };
  }

  // 2. Verify API key
  const keyData = await verifyApiKey(apiKeyValue);
  if (!keyData) {
    return {
      authenticated: false,
      company: null,
      user: null,
      apiKey: null,
      error: 'Invalid, expired, or inactive API key',
      errorCode: 401,
    };
  }

  // 2b. Verify declared company matches key owner
  const declaredCompanyId = headers['x-alo-company-id']?.trim();
  if (declaredCompanyId && declaredCompanyId !== keyData.company.id) {
    return {
      authenticated: false,
      company: null,
      user: null,
      apiKey: null,
      error: 'Company header does not match API key tenant',
      errorCode: 403,
    };
  }

  // 3. Verify HMAC signature if timestamp or signature is provided (never allow partial skip)
  const hasTimestamp = Boolean(headers['x-alo-timestamp']);
  const hasSignature = Boolean(headers['x-alo-signature']);
  if (hasTimestamp !== hasSignature) {
    return {
      authenticated: false,
      company: null,
      user: null,
      apiKey: null,
      error: 'Both X-ALO-Timestamp and X-ALO-Signature headers are required for signed requests.',
      errorCode: 401,
    };
  }

  if (hasTimestamp && hasSignature) {
    const timestamp = parseInt(headers['x-alo-timestamp']!, 10);
    const now = Date.now();

    // Reject requests older than 5 minutes
    if (isNaN(timestamp) || Math.abs(now - timestamp) > 5 * 60 * 1000) {
      return {
        authenticated: false,
        company: null,
        user: null,
        apiKey: null,
        error: 'Request timestamp expired. HMAC signature verification requires a timestamp within 5 minutes.',
        errorCode: 401,
      };
    }

    const bodyStr =
      typeof req.body === 'string'
        ? req.body
        : req.body !== undefined
          ? JSON.stringify(req.body)
          : '';
    const payloadToSign = `${req.method}\n${req.url}\n${headers['x-alo-timestamp']}\n${bodyStr}`;

    let isValid = false;
    const sig = headers['x-alo-signature']!;
    if (/^[0-9a-f]{64}$/i.test(sig)) {
      try {
        isValid = verifyHMAC(payloadToSign, sig, apiKeyValue);
      } catch {
        isValid = false;
      }
    }

    if (!isValid) {
      return {
        authenticated: false,
        company: null,
        user: null,
        apiKey: null,
        error: 'HMAC signature verification failed',
        errorCode: 401,
      };
    }
  }

  // 4. Check rate limit
  const withinLimit = checkRateLimit(keyData.id, keyData.rateLimit);
  if (!withinLimit) {
    return {
      authenticated: false,
      company: null,
      user: null,
      apiKey: null,
      error: `Rate limit exceeded. Maximum ${keyData.rateLimit} requests per minute.`,
      errorCode: 429,
    };
  }

  // 5. User resolution is done via the API key's associated company only.
  // The x-alo-user-id header is NOT trusted to prevent user impersonation.
  // Consumers must authenticate users through their own session/token mechanisms.
  const user: { id: string; role: string } | null = null;

  return {
    authenticated: true,
    company: {
      id: keyData.company.id,
      name: keyData.company.name,
      slug: keyData.company.slug,
    },
    user,
    apiKey: {
      id: keyData.id,
      scopes: keyData.scopes,
      rateLimit: keyData.rateLimit,
    },
  };
}