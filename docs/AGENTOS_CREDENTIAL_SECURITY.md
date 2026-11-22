# AgentOS — Credential Security (CRM + AI)

Date: 2026-11-19 · Scope: the three credential classes used by the first real CRM task.

## 1. Three separate credentials, never merged

| # | Credential | Where it lives | Who uses it | Exposure |
|---|---|---|---|---|
| 1 | AgentOS session / API key | `session-token` httpOnly cookie, or `Authorization: Bearer` for `/api/v1` | Browser, callers | Never stored by the CRM workflow; API key scopes enforced by `v1Handler` |
| 2 | External CRM API key | `IntegrationCredential.encryptedSecret` (AES-256-GCM) | Server-side connection service only | Fingerprint + `hasSecret` boolean only |
| 3 | AI provider key | `AIProviderConfig.encryptedApiKey` / provider env var | AI router | Never returned by provider APIs |

They are independent: rotating the CRM key does not touch the AI key, and a CRM read cannot leak a
provider key. The workflow never accepts a credential in its request body — only a `credentialId`,
which is resolved inside the caller's tenant.

## 2. Storage and encryption

- `src/lib/security/field-encryption.ts`: AES-256-GCM, random 96-bit IV, auth tag, payload
  `v1:<iv>:<tag>:<ciphertext>`, key = `sha256(ENCRYPTION_KEY || APP_SECRET)`.
- `POST /api/company/integrations` refuses to store a secret when no key is configured (HTTP 503);
  in production the key must be ≥ 32 characters.
- Only `secretFingerprint` (hash) is returned to clients; `encryptedSecret` is never selected by any
  response mapper. Verified by test: responses, run summaries, events and artifacts never contain the
  test key.
- Deletion (`DELETE /api/company/integrations`) removes the row and writes an `AuditEvent`
  (`company.integration.delete`) without the secret.

## 3. Tenancy and least privilege

- Every read is `findFirst({ where: { id, companyId, integrationType } })`. A guessed id from another
  tenant yields `not_found` **before** any decryption or network call (test asserts zero upstream
  requests).
- Session callers must be `super_admin` or company `owner`/`admin` to verify a connection or start the
  workflow. API-key callers need the `crm:write` scope, and client-company keys cannot reach internal
  routes at all.
- The recommended CRM credential for the first test is **read-only** (`leads:read` only). AgentOS
  issues only `GET`; the test asserts the stub CRM observed only GET requests.

## 4. Egress controls (SSRF)

`isAllowedIntegrationUrl` + `guardedFetch` (`src/lib/integrations/types.ts`):

- HTTPS only, unless `ALO_ALLOW_INSECURE_INTEGRATION_TARGETS=true` (for a trusted private network —
  used by the automated tests against `127.0.0.1`; **not** to be enabled casually in production).
- Blocks `localhost`, `localhost.`, `*.localhost`, `*.local`, `*.internal`, `0`, `0.0.0.0`,
  `127/8`, `10/8`, `192.168/16`, `172.16/12`, `169.254/16` (cloud metadata), `100.64/10`
  (CGNAT) and `>=224`, using numeric-label parsing rather than regexes (a 2026-11-19 audit found
  the earlier regexes could never match — see `AGENTOS_SECURITY_AUDIT.md` SA-01).
- Refuses **any IPv6 literal** (`[::1]`, `[::]`, `[::ffff:127.0.0.1]`, `[fe80::1]`, ULA,
  global) fail-closed; use a DNS name. Bracket-aware matching is tested in
  `__tests__/unit/integration-url-guard.test.ts` (29 tests).
- Refuses redirects (`redirect: 'error'`), and the option is applied **after** caller options so
  an adapter cannot re-enable `follow` (fixed 2026-11-19; test asserts it survives
  `redirect:'follow'`). A 30x to a metadata IP cannot bypass the guard.
- Timeouts on every call (10–15 s); response size cap 1 MiB; no unbounded bodies.
- The plaintext secret is passed as a bearer header to the approved host and cleared after use
  (`secret = ''`); it is never placed in a URL, log line or error message.

## 5. Logging and error surfaces

- Verification errors are sanitised: the base URL is replaced by its host, and the secret is replaced
  by `[redacted]` if it ever appears. Messages are capped at 300 characters in audit rows and
  500 characters in `AgentOSRun.error`.
- `console.error` calls in the touched routes log the error object only; no request body is logged.
- The dashboard panel receives `endpoint`, `status`, `lastVerifiedAt`, `hasSecret`, draft text and
  checksums — no credential material (browser test asserts the DOM has none).

## 6. Rotation and revocation

- **Rotate**: `POST /api/company/integrations` with the same `integrationType` + `name` and a new
  `secret` updates the row, resets `status` to `configured`, and requires a fresh verification. The
  fingerprint changes so operators can distinguish keys.
- **Revoke**: delete the row, or revoke the key at the CRM. The next verification fails with
  `authentication_failed` and the panel shows it; `lastVerifiedAt` remains the last known good time
  so stale "healthy" claims are visible.
- **AI key rotation**: provider admin API re-encrypts and re-syncs the router.
- Encryption-key rotation is **not** automated; the `v1:` prefix allows a future dual-read migration.

## 7. Residual risks (not solved here)

1. **No KMS/HSM.** The master key sits in the process environment; anyone with shell access to the
   production host can derive it. This is the existing platform design, unchanged.
2. **No DNS-rebinding pinning.** The host is validated by name, then resolved by `fetch`; a hostile
   DNS zone could return a private address. Mitigation is an outbound allow-list / proxy at the network
   layer — not implemented.
3. **No outbound destination allow-list.** Any approved public HTTPS host can be configured by an
   admin. A production deployment should restrict egress to the CRM's host.
4. **`ALO_ALLOW_INSECURE_INTEGRATION_TARGETS`** disables the private-network block entirely. It must
   stay unset in production; the tests set it only while running against a loopback stub.
5. **Secret in memory** during the request; not zeroed (Node strings are immutable).
6. **No per-credential verification history** beyond append-only `AuditEvent` rows; there is no
   "verified by" UI beyond the actor recorded in the audit action.

## 8. Never do this

Do not paste a CRM or AI key into chat, an issue, a document or source code. Keys are entered through
`/api/company/integrations` (admin session) or provider configuration; they are encrypted at rest and
returned only as a fingerprint.
