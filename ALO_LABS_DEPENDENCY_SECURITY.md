# Production dependency advisory triage — 2026-10-09

**Overall: FAIL.** `npm audit --omit=dev` initially reported **9** findings (5 high, 4 moderate). The registry identifies Next.js 16.3.8 as a compatible patch for advisories affecting 16.3.6. After upgrading `next` and `eslint-config-next` to 16.3.8 and reconciling npm/Bun locks, the audit still exits **1** with **8 findings (4 high, 4 moderate)**. The pinned Next finding is gone. Typecheck, lint, 727 tests and production build passed after that upgrade, as did an isolated standalone boot. CI and deployment quality jobs now run a fail-closed production `npm audit --audit-level=moderate`; they will block while the remaining advisories exist. This is intentional, not a green release claim.

| Package / chain | Severity | Current path | Remediation risk / decision |
|---|---|---|---|
| `next` | Previously high; **resolved in current audit** | 16.3.6 → 16.3.8 | Compatible patch verified with local checks. No production smoke or browser E2E certification. |
| `prisma`, `@prisma/config`, `deepmerge-ts`, `effect` | 4 high across Prisma/tooling chain | Prisma 6.19.2 with aligned adapter | **Resolved 2026-10-18** (see below): CLI moved to `devDependencies` and its two vulnerable transitives are pinned to patched versions. Still blocking only if the CLI stops working — CI exercises `prisma generate` + delegate reconciliation on every push. |
| `minio`, `query-string`, `stream-json`, `decode-uri-component` | 4 moderate across MinIO/transitives | **Removed 2026-10-18** — `minio` 8.0.7 deleted | Replaced by `@aws-sdk/client-s3` behind the same adapter API. A downgrade or npm override was proven unsafe: 8.x hard-requires `stream-json@1.x` (`stream-json/src/jsonl/Parser.js`), which 3.x removed. |

The audit JSON is stored only under ignored `backups/`; no secrets were included. `bun.lock` was regenerated with Bun 1.3.4 and its frozen-lockfile dry run passed; this does not prove hosted CI has passed. A future release needs a nonzero-advisory policy decision based on actual exploitability/remediation and a passing blocking CI gate. Do not disable or soften the security gate merely to make deployment green.

## Resolution pass — 2026-10-18

`npm audit --omit=dev --audit-level=moderate` now reports **0 vulnerabilities** (exit 0) against the committed `package-lock.json`. Neither the gate nor its level was changed.

### MinIO chain (4 moderate) — dependency removed, not suppressed

`minio@8.0.7` is structurally unpatched: it `require`s `stream-json/src/jsonl/Parser.js` at import time, and every `stream-json` release above the advisory range (3.6.0+) is ESM-only without that path. This was verified empirically — an npm `overrides` entry for `stream-json@^3.7.0` makes `require('minio')` fail with `MODULE_NOT_FOUND`. Downgrading to 7.1.3 does not help either: it still pins the vulnerable `query-string@7` → `decode-uri-component@0.2.2` chain.

`src/lib/minio.ts` now wraps `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (path-style addressing for IP/localhost endpoints, virtual-hosted for DNS endpoints, `S3_FORCE_PATH_STYLE=true` to override). The exported adapter surface is unchanged, and the local-filesystem fallback behaviour is preserved.

Two defects surfaced while doing this:

1. `src/app/api/db/restore/route.ts` imported `{ MinioClient }` from `minio`, which exports `Client` — every S3 backup validation/restore threw `MinioClient is not a constructor` and was reported as "S3 read failed". Both call sites now use the shared client.
2. Local-fallback object keys came straight from the HTTP request (`path.join(LOCAL_STORAGE_DIR, key)`), so `key=../../…` escaped the storage root. `sanitizeObjectKey()` now rejects traversal and absolute keys.

Evidence: `__tests__/unit/lib/s3-client.test.ts` (9 tests) runs the real SDK against an in-process S3 endpoint and asserts the wire format — path-style `/<bucket>/<key>`, `AWS4-HMAC-SHA256` credential scope, `x-amz-date`, metadata headers, `ListObjectsV2` parsing, 404 handling, DELETE, and presigned URLs.

### Prisma tooling chain (4 high) — corrected dependency scope

`prisma` is a build/deploy CLI; it is not part of the runtime image. The Dockerfile installs all dependencies in the builder stage (`npm ci`), runs `npx prisma generate`, and the runner image only receives the standalone build plus `node_modules/.prisma`. `deploy/scripts/deploy.sh` runs `bunx prisma …` after a dev-inclusive `bun install --frozen-lockfile` on the host.

It therefore moved to `devDependencies`, with `@prisma/client` (the runtime library) unchanged in `dependencies`. Because `@prisma/client` declares `peerDependencies: { prisma: "*" }`, npm still resolved the CLI and flagged it; `overrides` pin its two vulnerable transitives to patched releases:

- `deepmerge-ts` 7.1.5 → 8.0.2
- `effect` 3.18.4 → 3.22.3

Verification performed here: `@prisma/config` (the only consumer of both packages) loads a config file and resolves a schema path under these versions; its exports are intact. Verification **not** performed here: `prisma generate`, `prisma validate`, `prisma migrate deploy` and `prisma db execute` — the CLI downloads engine binaries from `binaries.prisma.sh`, which is unreachable from this sandbox. CI runs `bun run db:generate` and `check:prisma-delegates` immediately after the audit gate, so the first push is the real test of that path.

### Lockfiles

`package-lock.json` regenerated with npm; `bun.lock` regenerated with Bun 1.3.4 (the version pinned in CI). `bun install --frozen-lockfile --lockfile-only` in a clean directory exits 0 and leaves the lockfile byte-identical. Bun applies the same `overrides` (only `deepmerge-ts@8.0.2` and `effect@3.22.3` exist in the resolved graph).
