# AgentOS — CRM Connector Operations (`crm.alo-lead-api`)

Date: 2026-11-19 · Branch `arena/304ea66d-alolabs-ai` · Applies to the read-only ALO Lead API v1
connector.
Evidence level: **implemented + locally verified (stub CRM over HTTP) + simulated end-to-end**.
**No real staging CRM has been contacted** — every statement marked REAL is pending
(`BLOCKED_EXTERNAL_DEPENDENCY`).

Companion documents: `ALO_LEAD_API_V1_CONTRACT.md` (wire contract),
`AGENTOS_STAGING_ACTIVATION_RUNBOOK.md` (bring-up), `AGENTOS_SECURITY_AUDIT.md` (SA-01…SA-04).

---

## 1. What the connector is

| Property | Value |
|---|---|
| Adapter id | `crm.alo-lead-api` (`CRM_INTEGRATION_TYPE`) |
| Direction | Read-only. GET only. No create/update/delete/send path exists. |
| Auth | `Authorization: Bearer <api key>`, key stored AES-256-GCM encrypted per company |
| Endpoints | `GET {baseUrl}/api/v1/capabilities`, `GET {baseUrl}/api/v1/leads?limit=N&sort=-createdAt` |
| Required scope | `leads:read` in the capabilities response |
| Timeouts | capabilities 10 s, leads 15 s |
| Body cap | 1 MiB (declared `Content-Length` and actual bytes both checked) |
| Leads per call | default 5, hard max 50 (`MAX_LEADS_PER_CALL`); the five-lead workflow requests 5 |
| Transports | HTTPS only; HTTP requires the explicit insecure flag; loopback/private/link-local/metadata/IPv6-literal/`*.local`/`*.internal` blocked; redirects refused |

Two endpoints only. A CRM that speaks Twenty, Frappe, Zoho or HubSpot natively is **not**
compatible until a dedicated adapter exists — this is a contract, not a vendor spec.

## 2. Lifecycle of a connection

1. **Create** — a company admin saves `baseUrl` + API key via the connections API. The key is
   encrypted before insert; the response returns metadata only (`hasCredential`, masked hint),
   never the key.
2. **Verify** — `POST /api/v1/crm/connections/verify` (or preflight with `verify=1`) decrypts
   the key in memory, calls `/api/v1/capabilities` and records the outcome. Only with
   `verify=1` is the CRM actually contacted; `verify=0` reports configuration state without
   egress.
3. **Use** — a run requests preflight, dispatches `lead-followup`, which re-reads the
   connection, fetches the five newest leads, and generates one draft per lead.
4. **Rotate** — overwrite the key; verification state resets to `unverified` until the next
   successful check.
5. **Disable/delete** — the row is soft-disabled/deleted; runs then fail closed with
   `not_configured`/`not_found`.

## 3. State machine (exact strings)

`CrmConnectionState` = `connected` | `authentication_failed` | `permission_denied` |
`unreachable` | `sync_failed` | `not_configured` | `not_found`.

| State | Meaning | Sets `lastVerifiedAt`? |
|---|---|---|
| `connected` | capabilities 200 + valid shape + `leads:read` present | **yes** — only success advances it |
| `authentication_failed` | HTTP 401 | no |
| `permission_denied` | HTTP 403, or 200 without `leads:read` | no |
| `unreachable` | DNS/TCP/TLS/timeout, or the egress guard refused the target | no |
| `sync_failed` | 404/429/5xx, malformed JSON, unexpected shape, oversized body, decrypt failure, missing `ENCRYPTION_KEY` | no |
| `not_configured` | no base URL or no stored credential | no |
| `not_found` | credential id does not belong to this tenant (never leaks whether it exists elsewhere) | no |

A failed check **never** preserves a green state: `state` always reflects the latest attempt,
and `lastVerifiedAt` keeps the last *successful* time so the UI can show "connected, last
verified 3 days ago" honestly.

## 4. Error taxonomy and operator action

| Symptom | State / message | Likely cause | Action |
|---|---|---|---|
| 401 | `authentication_failed` | key revoked/wrong | rotate key, re-verify |
| 403 | `permission_denied` | key lacks `leads:read` | fix scope on the CRM side |
| 200 but no `leads:read` | `permission_denied` | read-only key misconfigured | grant `leads:read` |
| 404 | `sync_failed` "endpoint not found — is the ALO Lead API contract exposed?" | base URL points at a CRM that does not implement this contract | correct base URL or write an adapter |
| 429 | `sync_failed` (retryable) | plan limit | lower run frequency |
| 5xx | `sync_failed` (retryable) | CRM outage | retry later; run will fail closed |
| Immediate refusal, no socket | `unreachable` "refused by egress policy" | private/loopback/metadata target | use a public DNS name |
| `ENCRYPTION_KEY is not configured` | `sync_failed` | env missing | configure before use |
| Body > 1 MiB | `sync_failed` | CRM returning bulk data | restrict the CRM query/contract |

## 5. Workflow: five-lead Bengali follow-up

`lead-followup` (in `src/lib/integrations/workflows/lead-followup.ts`):

1. load connection + decrypt credential (tenant-scoped);
2. `GET /api/v1/capabilities`, assert `leads:read`;
3. `GET /api/v1/leads?limit=5&sort=-createdAt` — newest five, source `id`s preserved verbatim;
4. reject a response with a missing/duplicate source id, or more rows than requested;
5. per lead: one model call → strict JSON (`subject`, `body`) → schema validation, unknown keys
   dropped, Bengali script and length checks;
6. store one `Artifact` per draft with `sha256` checksum of the exact stored content;
7. emit `ai.generation.completed` and `draft.validated` per draft, then `run.completed`;
8. **no delivery**: nothing is emailed or written to the CRM. The drafts are artifacts for a
   human to review.

Draft content is generated by the configured provider. When no provider is ready, the run is
blocked at preflight — the connector never substitutes canned text.

## 6. Verification commands

```bash
# contract + connector + workflow (local stub CRM, no external network)
npx vitest run __tests__/integration/crm-lead-followup.test.ts --maxWorkers=1
# end-to-end staging simulation through the real routes
npx vitest run __tests__/integration/crm-staging-simulation.test.ts --maxWorkers=1
# SSRF/egress guard
npx vitest run __tests__/unit/integration-url-guard.test.ts --maxWorkers=1
# dashboard/API contract
npx vitest run __tests__/api/company-integrations.test.ts --maxWorkers=1
```

Real staging acceptance (needs a CRM URL + key) is enumerated in
`AGENTOS_REAL_STAGING_ACCEPTANCE_CHECKLIST.md` §CRM.

## 7. Known limits

- Only the ALO Lead API v1 contract is supported.
- Newest-five only; no pagination, no backfill, no write-back.
- No webhook/poll scheduler: a draft run is operator/agent triggered.
- HTTP is refused by default; the insecure flag is for trusted private networks/tests and must
  not be set on a public deployment.
- A real CRM's rate limits, TLS chain and error semantics are unvalidated until staging
  access exists.
