# P5 — Enterprise Session Management

## Task
Enhance the AISMH auth system with enterprise-grade session management without modifying existing `auth.ts` exports.

## Files Created

### 1. `src/lib/session-manager.ts`
Enterprise session manager with:
- `createSession(userId, options?)` — 1h TTL default, 30 days with `rememberMe`
- `verifySession(token)` — sliding expiry, auto-extends TTL on each use
- `revokeSession(token)` — single session revocation
- `revokeAllSessions(userId)` — bulk revocation for a user
- `listActiveSessions(userId)` — list non-expired sessions (tokens truncated)
- `cleanupExpiredSessions()` — batch cleanup for cron/API
- `refreshSession(token)` — JWT rotation (new token, invalidate old)
- Storage: `session:{token}` and `user:sessions:{userId}` in db.settings

### 2. `src/lib/session-cleanup.ts`
Thin wrapper: `runSessionCleanup()` → calls `cleanupExpiredSessions()`, returns `{ cleaned: number }`

### 3. `src/app/api/auth/sessions/route.ts`
Session management API:
- `GET /api/auth/sessions` — list active sessions for current user
- `POST /api/auth/sessions` — refresh current session token (rotation)
- `DELETE /api/auth/sessions` — revoke current session (logout)
- `DELETE /api/auth/sessions?all=true` — revoke all sessions for user
- All handlers have auth check with legacy fallback

### 4. `src/app/api/auth/sessions/cleanup/route.ts`
Admin-only cleanup endpoint:
- `POST /api/auth/sessions/cleanup` — trigger expired session cleanup
- Requires `super_admin` or `admin` role

## Design Decisions
- Used raw token (not hashed) as key to match existing `auth.ts` pattern
- Auth helper in API routes tries enterprise verify first, then falls back to legacy `verifySessionToken`
- Tokens truncated to 8 chars in listing responses for security
- Sliding expiry recalculates from `now` on each verify
- Cleanup scans all `session:*` keys, batch-deletes expired, and updates user session indexes

## TypeScript Result
`npx tsc --noEmit` — **0 errors, 0 warnings**
