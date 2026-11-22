# ALO Lead API v1 — Contract Confirmation

Date: 2026-11-19 · Status: **CONFIRMED as AgentOS's integration contract**; confirmed against a local
reference server. A real staging CRM implementing this contract has **not** been contacted (BLOCKED).

This document is the authoritative contract the `crm.alo-lead-api` adapter speaks. It is **not** a
vendor specification and does not describe Twenty/Frappe/Zoho APIs — those need their own adapter.
A CRM is compatible only if it exposes exactly these two read-only endpoints over HTTPS.

## 1. Transport and authentication

- HTTPS only. Plain HTTP is refused unless `ALO_ALLOW_INSECURE_INTEGRATION_TARGETS=true` (trusted
  private network / tests). Loopback, private, link-local and cloud-metadata hosts are refused.
- Redirects are refused (`redirect: 'error'`).
- `Authorization: Bearer <api key>` on every request. The key must be read-only.
- Timeouts: capabilities 10 s, leads 15 s. Response body cap: 1 MiB.
- AgentOS sends **GET only**. There is no create/update/delete/send operation in this contract.

## 2. `GET /api/v1/capabilities`

Request: no body, no query parameters.

Success — HTTP 200, `application/json`:

```json
{
  "service": "alo-education-staging",
  "apiVersion": "1",
  "permissions": ["leads:read"]
}
```

Validation performed by AgentOS:

| Field | Rule | On violation |
|---|---|---|
| `service` | non-empty string | `sync_failed` — "unexpected shape" |
| `apiVersion` | string (AgentOS currently records it; `"1"` is expected) | `sync_failed` |
| `permissions` | array of strings | `sync_failed` |
| `permissions` | must contain `leads:read` | `permission_denied` (even with HTTP 200) |

## 3. `GET /api/v1/leads?limit=5&sort=-createdAt`

- `limit`: integer 1–50 (AgentOS asks for **5**); the CRM must not return more than requested.
- `sort=-createdAt`: newest first. The five most recent **test** leads are expected in the staging
  dataset.

Success — HTTP 200:

```json
{
  "data": [
    {
      "id": "lead-0001",
      "name": "Rahim Uddin",
      "email": "rahim@example.test",
      "phone": "+8801700000000",
      "stage": "new",
      "notes": "Interested in IELTS evening batch",
      "createdAt": "2026-11-18T09:30:00Z"
    }
  ]
}
```

Rules:

| Rule | Result |
|---|---|
| `data` must be an array | `sync_failed` — "missing a data array" |
| every row needs a non-empty string `id` | `sync_failed` — "lead without a source id" |
| ids must be unique within the response | `sync_failed` — "duplicate lead id" |
| at most `limit` rows | `sync_failed` — "more than the requested N leads" |
| optional `name/email/phone/stage/notes/createdAt` must be strings if present | ignored otherwise (dropped, not coerced) |
| ids are preserved verbatim into AgentOS evidence (`summary.leadIds`, artifact metadata) | — |

## 4. HTTP status semantics

| Status | AgentOS state | Retry in workflow |
|---|---|---|
| 200 + valid body | `connected` | — |
| 401 | `authentication_failed` | no |
| 403 | `permission_denied` | no |
| 404 | `sync_failed` — "endpoint not found … is the ALO Lead API contract exposed?" | no |
| 429 | `sync_failed` (`retryable`) | yes, 2 attempts, 0.5 s/1 s |
| 5xx | `sync_failed` (`retryable`) | yes, 2 attempts |
| invalid JSON / oversized body | `sync_failed` | no |
| DNS failure, refused connection, TLS failure, timeout | `unreachable` | yes, 2 attempts |
| private/metadata target, redirect, non-HTTPS | `unreachable` — "refused by egress policy" | no |

## 5. Reference implementation status

- The contract is exercised by `__tests__/integration/crm-lead-followup.test.ts` against a local
  `node:http` server that implements it (5-lead success, 4-lead, 401, 403, no-permission, 500,
  HTML 404, duplicate id, missing id, refused port, redirect-free GET-only).
- A compliant **staging** server, its HTTPS certificate and its read-only credential do not exist in
  this environment: external confirmation is **BLOCKED**.
- Any change to this contract (paths, auth scheme, field names, pagination) is a breaking change and
  requires updating the adapter, its tests and this document together.
