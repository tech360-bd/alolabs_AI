/**
 * ALO Open AI Platform — HTTP helpers for `/api/v1/platform/**`.
 *
 * Every platform route goes through `platformRoute`, which enforces, in order:
 *
 *   1. principal resolution (session cookie, bearer session, or project API key)
 *   2. scope check            — a scoped key gets 403, not a silent downgrade
 *   3. rate limit             — keyed on the credential, Redis-shared
 *   4. project tenancy        — a `projectId` in the request must belong to the
 *                               principal's workspace
 *   5. Zod validation         — query and body
 *   6. handler
 *
 * Errors are a single envelope so the web UI and API clients parse one shape:
 *   { error: { code, message, remediation? }, requestId }
 *
 * This is deliberately a sibling of `src/lib/api/secure-route.ts` rather than a
 * variant of it: the AgentOS wrapper authorises against *company* membership,
 * this one against *workspace* ownership, and mixing the two is how tenant
 * boundaries get confused. Shared behaviour (rate limiting, error shape) is
 * imported from the same underlying modules.
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { ZodType } from 'zod';
import {
  resolvePrincipal,
  hasScope,
  principalOwnsProject,
  type PlatformPrincipal,
} from './principal';
import { checkLimit } from '@/lib/security/rate-limiter';

export type PlatformErrorCode =
  | 'unauthorized' | 'forbidden' | 'not_found' | 'invalid_request'
  | 'rate_limited' | 'conflict' | 'unavailable' | 'internal';

export class PlatformError extends Error {
  readonly status: number;
  readonly code: PlatformErrorCode;
  readonly remediation?: string;

  constructor(status: number, code: PlatformErrorCode, message: string, remediation?: string) {
    super(message);
    this.name = 'PlatformError';
    this.status = status;
    this.code = code;
    if (remediation) this.remediation = remediation;
  }
}

export const unauthorized = (message = 'Authentication required', remediation?: string) =>
  new PlatformError(401, 'unauthorized', message, remediation ?? 'Sign in, or send an API key as `Authorization: Bearer alo_pk_…` or `X-API-Key`.');
export const forbidden = (message = 'Insufficient scope', remediation?: string) =>
  new PlatformError(403, 'forbidden', message, remediation);
export const notFound = (message = 'Not found') => new PlatformError(404, 'not_found', message);
export const badRequest = (message: string) => new PlatformError(400, 'invalid_request', message);
export const conflict = (message: string) => new PlatformError(409, 'conflict', message);

export interface PlatformContext {
  principal: PlatformPrincipal;
  request: NextRequest;
  requestId: string;
  /** Validated query object, when the route declared a schema. */
  query: unknown;
  /** Workspace the request is scoped to (always the principal's). */
  workspaceId: string;
}

export interface PlatformRouteOptions<TBody = unknown, TQuery = unknown> {
  /** Required scope, e.g. `ai:chat`. Omit for authenticated-only routes. */
  scope?: string;
  /** Parse and validate the JSON body against this schema. */
  body?: ZodType<TBody>;
  /** Parse and validate `searchParams` against this schema. */
  query?: ZodType<TQuery>;
  /** Require a `projectId` (query or body) that belongs to the workspace. */
  projectScoped?: boolean;
  /** Per-credential rate limit; defaults to the credential's own limit. */
  rateLimit?: { limit: number; windowMs: number };
}

function errorResponse(error: PlatformError, requestId: string): NextResponse {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, ...(error.remediation ? { remediation: error.remediation } : {}) }, requestId },
    { status: error.status, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
  );
}

export function json(data: unknown, requestId: string, status = 200, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'x-request-id': requestId, 'cache-control': 'no-store', ...(headers ?? {}) },
  });
}

/** Turn a thrown value into a safe response; never leaks a stack or a secret. */
export function handlePlatformError(error: unknown, requestId: string): NextResponse {
  if (error instanceof PlatformError) return errorResponse(error, requestId);
  const message = error instanceof Error ? error.message : String(error);
  // Prisma unique violations surface as P2002 with a code property.
  if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
    return errorResponse(conflict('That value already exists (unique constraint).'), requestId);
  }
  console.error(`[platform] ${requestId} unhandled:`, message);
  return errorResponse(new PlatformError(500, 'internal', 'Internal server error'), requestId);
}

type Handler<TBody, TQuery> = (
  context: PlatformContext & { body: TBody; query: TQuery },
) => Promise<NextResponse>;

/**
 * Wrap a platform route handler.
 *
 * The rate limit runs on the *credential*, never on an IP: an attacker cannot
 * spend another user's quota by spoofing a header, and a shared NAT cannot
 * starve a legitimate user.
 */
export function platformRoute<TBody = undefined, TQuery = undefined>(
  options: PlatformRouteOptions<TBody, TQuery>,
  handler: Handler<TBody, TQuery>,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    const requestId = randomUUID();
    try {
      // 1. Principal
      const principal = await resolvePrincipal(request);
      if (!principal) {
        const sentKey = Boolean(request.headers.get('x-api-key') || request.headers.get('authorization'));
        throw unauthorized(
          sentKey ? 'Invalid, revoked or expired credential' : 'Authentication required',
          sentKey
            ? 'The API key is unknown, revoked, expired, or its workspace is suspended. Create a new key in the workspace settings.'
            : undefined,
        );
      }

      // 2. Scope
      if (options.scope && !hasScope(principal, options.scope)) {
        throw forbidden(
          `This credential lacks the "${options.scope}" scope`,
          `Grant "${options.scope}" to the API key, or call with a session that has it.`,
        );
      }

      // 3. Rate limit (credential-keyed, Redis-shared)
      const limit = options.rateLimit?.limit ?? principal.rateLimitPerMinute;
      const windowMs = options.rateLimit?.windowMs ?? 60_000;
      const bucket = principal.apiKeyId ? `key:${principal.apiKeyId}` : `user:${principal.userId}`;
      const rate = await checkLimit(`platform:${bucket}`, limit, windowMs);
      if (!rate.allowed) {
        return errorResponse(
          new PlatformError(429, 'rate_limited', `Rate limit exceeded (${limit}/min)`, `Retry after ${Math.ceil((rate.resetAt - Date.now()) / 1000)}s.`),
          requestId,
        );
      }

      // 4. Query validation
      let query: TQuery = undefined as TQuery;
      if (options.query) {
        const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
        const parsed = options.query.safeParse(raw);
        if (!parsed.success) {
          throw badRequest(`Invalid query: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'query'} ${i.message}`).join('; ')}`);
        }
        query = parsed.data;
      }

      // 5. Body validation
      let body: TBody = undefined as TBody;
      if (options.body) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw badRequest('Request body must be valid JSON');
        }
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) {
          throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
        }
        body = parsed.data;
      }

      // 6. Project tenancy — checked against the *principal's* workspace
      if (options.projectScoped) {
        const record = (body ?? {}) as Record<string, unknown>;
        const queryRecord = (query ?? {}) as Record<string, unknown>;
        const projectId = (record.projectId ?? queryRecord.projectId) as string | undefined;
        if (!projectId) throw badRequest('projectId is required');
        if (!(await principalOwnsProject(principal, projectId))) {
          // 404, never 403: confirming existence would leak another tenant's ids.
          throw notFound('Project not found');
        }
      }

      return await handler({ principal, request, requestId, query, body, workspaceId: principal.workspaceId });
    } catch (error) {
      return handlePlatformError(error, requestId);
    }
  };
}

/** Read `projectId` from the body or query, for handlers that need it directly. */
export function projectIdOf(context: { body: unknown; query: unknown }): string | null {
  const body = (context.body ?? {}) as Record<string, unknown>;
  const query = (context.query ?? {}) as Record<string, unknown>;
  const value = body.projectId ?? query.projectId;
  return typeof value === 'string' && value.length ? value : null;
}
