/**
 * ALO Labs AgentOS — /api/v1 helpers
 *
 * Thin, uniform wrappers so every v1 route has identical auth, error shape,
 * and tenant scoping.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authenticateV1, hasScope, type V1Identity } from '@/lib/v1-auth';
import { db } from '@/lib/db';

export interface V1Context {
  identity: V1Identity;
}

/** Authenticate the request or throw a uniform 401. */
export async function v1Auth(request: NextRequest): Promise<V1Identity> {
  const identity = await authenticateV1(request);
  if (!identity) {
    throw new V1Error('Unauthorized', 401);
  }
  return identity;
}

export class V1Error extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Run a v1 handler with uniform auth + error handling. */
export function v1Handler<T>(
  handler: (ctx: V1Context, request: NextRequest) => Promise<T>,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    try {
      const identity = await v1Auth(request);
      // Every API key is least-privilege by default. Session users are
      // separately bound to a company membership. Permission naming follows
      // resource:read, resource:write and resource:execute.
      const segments = request.nextUrl.pathname.split('/').filter(Boolean);
      const resource = segments[2] === 'command' ? 'runs' : segments[2];
      const action = segments.includes('run') || segments[2] === 'command'
        ? 'execute'
        : request.method === 'GET' ? 'read' : 'write';
      if (identity.kind === 'apiKey' && resource && !hasScope(identity, `${resource}:${action}`)) {
        throw new V1Error(`Scope required: ${resource}:${action}`, 403, 'FORBIDDEN');
      }
      const data = await handler({ identity }, request);
      const asyncCommand = request.method === 'POST' && (
        segments[2] === 'command' || segments[2] === 'runs' ||
        (segments[2] === 'workflows' && segments.includes('run'))
      );
      return NextResponse.json({ success: true, data }, { status: asyncCommand ? 202 : 200 });
    } catch (error) {
      if (error instanceof V1Error) {
        return NextResponse.json(
          { success: false, error: { code: error.code, message: error.message } },
          { status: error.status },
        );
      }
      console.error('[api/v1]', error);
      return NextResponse.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
        { status: 500 },
      );
    }
  };
}

/** Ensure a project belongs to this company before linking a run or artifact. */
export async function v1ProjectAccess(projectId: string, companyId: string): Promise<void> {
  const project = await db.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new V1Error('Project not found', 404, 'NOT_FOUND');
}

/** Pagination params from the query string. */
export function v1Pagination(request: NextRequest): { limit: number; offset: number } {
  const q = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, parseInt(q.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(q.get('offset') ?? '0', 10) || 0);
  return { limit, offset };
}

/** Read + validate a JSON body. */
export async function v1Body<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new V1Error('Invalid JSON body', 400, 'VALIDATION_ERROR');
  }
}
