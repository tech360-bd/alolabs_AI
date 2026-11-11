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

export async function withCompany<T>(handler: Handler<T>): Promise<NextResponse> {
  try {
    let auth: CompanyAuth
    try {
      auth = await requireCompanyAuth()
    } catch {
      return jsonError('Unauthorized — company session required', 401)
    }
    const result = await handler(auth)
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
export function parseJsonColumn<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}
