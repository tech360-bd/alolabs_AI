# Connector and Integration Marketplace

Status: partial · 2026-11-25

## 1. Current state

| Piece | State | Evidence |
| --- | --- | --- |
| Integration registry | Implemented | `src/lib/integrations/registry.ts` (`integrationRegistry`), `types.ts`, `connections.ts`, `preflight.ts` |
| Connector families | Partial | `src/lib/integrations/connectors/{content,crm,media,messaging}` — RSSHub, ALO Lead API, Frappe, Twenty, video generation, HTTPSMS |
| Credential storage | Implemented | `IntegrationCredential` (`encryptedSecret`, `secretFingerprint`, `status`, `lastVerifiedAt`) + `src/lib/security/field-encryption.ts` |
| Credential API | Implemented | `/api/integrations`, `/api/company/integrations`, `/api/crm-connections`, `/api/enterprise/integrations` |
| Marketplace listing / install | Partial | `MarketplaceListing`, `MarketplaceReview`, `MarketplaceTemplate`, `TemplateInstall`; `/api/marketplace` |
| OAuth broker | **Missing** | No generic OAuth 2.0 authorize/callback/token-refresh service |
| Webhook validation | Partial | `WebhookConfig`, `WebhookDelivery`, signature tests (`__tests__/api/f6-*`) |
| Health/revocation UX | Partial | status + `lastVerifiedAt` fields; no scheduled health check or one-click revoke flow verified |
| Social connectors | Partial | `src/lib/social/` clients for many platforms; certification absent |
| MCP servers | Partial | `McpServer` model + `/api/mcp-servers` |

## 2. Connector contract

Every connector must declare, and the registry should reject it otherwise:

- identity: id, provider, version, licence, terms URL;
- actions and triggers (typed), each mapped to a governance `ActionClass`;
- auth method and required scopes;
- data touched, retention and whether it leaves the platform;
- rate limits and retry/backoff behaviour;
- health check and last verification;
- pricing model (free tier vs paid) and whether a paid plan is required;
- disconnect/revocation behaviour.

None of these may be inferred at call time. A connector that is "available" but not
"connected" must never be presented as operational.

## 3. State vocabulary (must be shown to users)

`available` → `connected` → `authorized` → `partially_configured` →
`unavailable` / `requires_paid_account` / `requires_additional_permission`.

`IntegrationCredential.status` currently stores a free-form string
(`"configured"` default). Promoting this to the vocabulary above is a small,
high-value change; it lets the UI stop advertising unconfigured tools.

## 4. Governance integration

| Concern | Rule |
| --- | --- |
| Outbound call | `external.call` (normal risk) — allowed, subject to the emergency communication stop |
| Outbound message | `external.communicate` (high) — approval |
| Publishing | `content.publish` (high) — approval |
| Payment | `financial.transact` (critical) — approval + `costAuthorized` |
| Paid connector with no authorisation | denied by `GLOB-PAID-001` |
| Credential read | `secret.access` — denied; connectors use credentials internally, agents never see them |
| Disconnect | delete credential + audit event + fail-closed cache invalidation |

## 5. OAuth design (planned)

1. `GET /api/oauth/[provider]/start` — state + PKCE, tenant-bound, short TTL.
2. `GET /api/oauth/[provider]/callback` — validate state, exchange code server-side,
   encrypt tokens, store scopes actually granted (not requested).
3. Refresh on demand with a single-flight lock; never refresh per request.
4. Revocation endpoint that calls the provider's revoke and clears local state.
5. Audit every connect, refresh failure and revoke.

## 6. Acceptance tests

1. A token is never returned by any API route (only `status` and fingerprint).
2. Revocation makes the next action fail closed (Scenario 9).
3. Signature-invalid webhooks are rejected and audited.
4. A paid connector cannot be used without authorisation.
5. Unconfigured connectors are not listed as operational.

## 7. Gaps

- Generic OAuth broker (GAP-014).
- Scheduled connector health checks.
- Scope-diff detection on re-authorisation.
- Per-connector usage metering surfaced in billing.
