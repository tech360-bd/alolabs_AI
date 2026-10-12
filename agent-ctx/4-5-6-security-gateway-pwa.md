# Task 4-5-6: Security, API Gateway, and PWA Builder

## Files Created/Modified

### Modified
- `src/app/api/protection/route.ts` — Enhanced with 18-category rule engine, exported `evaluateProtection`, `ProtectionCheck`, `ProtectionResult`
- `src/app/layout.tsx` — Added PWA meta tags, manifest link, service worker registration

### Created
- `src/app/api/protection/evaluate/route.ts` — Standalone ProtectionCheck endpoint
- `src/lib/api-gateway.ts` — HMAC gateway: verifyApiKey, verifyHMAC, checkRateLimit, checkServicePermission, validateGatewayRequest
- `src/app/api/gateway/verify/route.ts` — Gateway verification endpoint
- `src/app/api/gateway/sign/route.ts` — HMAC signature generation endpoint
- `public/manifest.json` — PWA manifest
- `public/icons/icon-192.svg` — 192px SVG icon
- `public/icons/icon-512.svg` — 512px SVG icon
- `public/sw.js` — Service worker
- `src/components/service-worker-registration.tsx` — Client-side SW registration

## Key Architecture Decisions
- Protection API: Phase 1 (pattern-based) runs first for backward compat, Phase 2 (18-category) activates when context fields are provided
- API Gateway: In-memory rate limiting with per-minute windows, auto-cleanup via setInterval
- HMAC: timing-safe comparison via crypto.timingSafeEqual, 5-minute timestamp window
- PWA: SVG icons (maskable), network-first for API routes, cache-first for static
