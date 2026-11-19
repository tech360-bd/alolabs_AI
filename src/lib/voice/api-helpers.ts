/**
 * Shared helpers for the Voice & Contact Center API routes.
 *
 * Conventions:
 * - `withCompany` wraps a handler with company-scoped authentication and
 *   uniform error mapping, so every voice route enforces tenant isolation
 *   the same way.
 * - Responses use `{ data, ... }` / `{ error }` like the existing API surface.
 */

import { NextResponse } from 'next/server'
import { requireCompanyAuth, type AuthenticatedUser } from '@/lib/api-auth'

export type CompanyAuth = AuthenticatedUser & { companyId: string }

type Handler<T> = (auth: CompanyAuth) => Promise<T>

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/**
 * A handler result that is already a full HTTP response (e.g. a CSV download
 * or an audio stream). Returned untouched by `withCompany`, which otherwise
 * JSON-encodes everything. Kept explicit so a route can never accidentally
 * return `{}` where a file was intended.
 */
export class RawResponse {
  constructor(readonly response: Response) {}
}

export async function withCompany<T>(handler: Handler<T>): Promise<NextResponse | Response> {
  try {
    let auth: CompanyAuth
    try {
      auth = await requireCompanyAuth()
    } catch {
      return jsonError('Unauthorized — company session required', 401)
    }
    const result = await handler(auth)
    if (result instanceof RawResponse) return result.response
    return NextResponse.json(result as Record<string, unknown>)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    if (/Unauthorized/i.test(message)) return jsonError(message, 401)
    if (/not found for this tenant/i.test(message)) return jsonError(message, 404)
    if (/Invalid|invalid|required|refus/i.test(message)) return jsonError(message, 400)
    return jsonError(message, 500)
  }
}

/** Parse a JSON body, returning null on malformed input. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function requireString(body: Record<string, unknown>, field: string): string {
  const v = body[field]
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`Invalid request: "${field}" is required`)
  }
  return v.trim()
}

export function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const v = body[field]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

export function optionalNumber(body: Record<string, unknown>, field: string): number | undefined {
  const v = body[field]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Parse JSON columns defensively (they are stored as strings). */
export { parseNonNullJsonOr as parseJsonColumn } from '@/lib/json-values'
