# Environment & API-key Manager

**Status:** IMPLEMENTED, NOT RUNTIME-VERIFIED (no host-side apply has run against a
real deployment). Secrets, versions, approvals and idempotency are exercised against
a real database by `npm run verify:environments` (16/16).

---

## 1. What it is, and what it deliberately is not

A project-scoped configuration surface for an operator: variables and provider API
keys per environment (development / staging / production), immutable version
snapshots, approval for production, an apply request that a host performs, and a
rollback that creates a new version rather than rewriting history.

It is **not** a second provider registry. Provider identity stays where it already
lives (`/api/super-admin/ai/providers`); this stores the credential that provider
needs, under the project it belongs to.

It is **not** a way to change a running process from a web request. Saving writes a
database row; a host-side agent performs the apply and reports back. A row is an
instruction, never a result.

## 2. Credential architecture

```
value ──AES-256-GCM(per-secret data key)──▶ ciphertext + tag
data key ──AES-256-GCM(KEK)───────────────▶ wrapped data key
KEK ──process environment (ALO_KEK_KEYS)──▶ never in the database
```

- **Authenticated encryption**, AES-256-GCM, 96-bit random IV per encryption, 128-bit
  tag. A modified ciphertext, tag, IV or context fails closed.
- **A data key per secret**, so one compromised row does not expose the rest.
- **Bound context.** The associated data is a length-prefixed encoding of
  `companyId | projectSlug | environment | key`. A ciphertext copied to another row
  will not decrypt — the first version of this used separator-joined fields, which
  allowed `("a|b","c")` and `("a","b|c")` to collide; a test caught it and the
  encoding is now length-prefixed.
- **Key versioning.** Every row records `kekId`. Adding `KEK 2` and setting
  `ALO_KEK_ACTIVE=2` leaves old rows readable; `needsRewrap()` lists what still uses
  the previous key. Dropping a key before re-wrapping makes its rows unreadable *on
  purpose* — the error names the missing key.
- **Masks only.** `EnvironmentSecret.masked` is the only representation any route
  returns. `maskValue()` shows the last four characters only when the value is longer
  than eight characters; a 6-character value would otherwise be mostly revealed.
- **One decryption point.** `buildApplyPayload()` is the only function that opens a
  secret. It is not reachable from a JSON route; its caller audits the operation.

### Configuration

```bash
# one key (first deployment)
ALO_KEK=$(openssl rand -base64 32)

# key ring, with rotation
ALO_KEK_KEYS='{"1":"<base64 32 bytes>","2":"<base64 32 bytes>"}'
ALO_KEK_ACTIVE=2
```

Missing configuration throws; the API answers `503 secret-store-unavailable` rather
than storing anything. A default key would be a public key, so there is none.

## 3. Data model

| Table | Purpose | Notable rules |
| --- | --- | --- |
| `ProjectEnvironment` | one environment of one project | unique on `(companyId, projectSlug, name)`; `companyId` is the canonical Company id, never `AiWorkspace.organisationId` |
| `EnvironmentVariable` | non-secret values | a key is either plain or sealed, never both — switching type deletes the other copy |
| `EnvironmentSecret` | sealed secrets | `masked`, `kekId`, wrapped data key, ciphertext, tag, `version` |
| `EnvironmentConfigVersion` | immutable snapshot | `status`: draft → pending_approval → approved → applied; `checksum`; `rollbackOf` |
| `EnvironmentApply` | durable apply instruction | unique `idempotencyKey`, `stage`, `healthCheck`, requested/approved identities |

## 4. API

All routes are `super_admin` and company-scoped; there is no cross-tenant parameter.

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/super-admin/environments` | `GET`, `POST` | list / create; `?project=slug` filters |
| `/api/super-admin/environments/[id]/variables` | `GET`, `PUT`, `DELETE` | `PUT` takes `{key, value, secret}`; responses carry masks only; audit records the key and whether it was secret, never the value |
| `/api/super-admin/environments/[id]/versions` | `GET`, `POST` | publish a snapshot; `rollbackOf` copies an old version as a new one |
| `/api/super-admin/environments/[id]/apply` | `GET`, `POST` | request an apply (202, `queued`) and list applies |

Rule enforcement worth knowing:

- **Production needs two people.** A production version is created
  `pending_approval`; applying it requires `approve: true` **and** an actor different
  from the author (`409 same-user-approval` otherwise).
- **Idempotency.** The same `idempotencyKey` returns the original apply row with
  `replayed: true`; a queue retry cannot apply a configuration twice.
- **Locked environments refuse writes** (`409`), so a deliberate freeze is real.
- **Apply never reports success.** It returns `202` with `status: "queued"`.

## 5. Evidence

`npm run verify:environments` (real database, cleans up after itself) — 16/16:

```
ok  secret is returned masked — ••••••••074f
ok  no plaintext in the stored row — kekId=1
ok  another tenant cannot read the environment — not found
ok  production version waits for approval — pending_approval
ok  applying an unapproved production version is refused — 409 approval-required
ok  the author cannot approve their own production change — 409 same-user-approval
ok  apply is idempotent — queued / replayed=true
ok  apply is queued, never claimed successful — queued
ok  apply payload round-trips the real secret — 1 keys, SENTRY_DSN
ok  rollback creates a new version instead of rewriting history — v3 rolls back v1
ok  a key that stops being secret loses its sealed copy — 1 -> 0
```

`__tests__/unit/lib/envelope-secrets.test.ts` — 15 cases over the crypto boundary
(no key → refuse, tampering, cross-tenant address binding, rotation, orphaned keys,
masking).

## 6. What is not done yet

1. **Host-side apply agent.** `EnvironmentApply` rows are instructions with no
   executor in this deployment. The intended path reuses the existing deployment
   mechanism — a workflow over the same audited SSH bridge running a fixed
   `deploy/scripts/apply-environment.sh` — rather than opening a shell from the web
   API. Until that exists, an apply stays `queued` and the dashboard must not imply
   otherwise.
2. **Dashboard panel.** The APIs and the panel registration are not yet wired; the
   operator surface is still to be built.
3. **Provider validation.** "Validate this API key" against each provider is not
   implemented; a saved key is stored, not proven.
4. No apply has been run against a real service, so the end-to-end claim remains
   IMPLEMENTED, NOT RUNTIME-VERIFIED.
