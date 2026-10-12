# File tenant ACL: real two-tenant HTTP test

**2026-10-09 (Asia/Dhaka). Scope:** isolated sandbox SQLite *copy*, isolated local file root, standalone Next.js server on loopback port 3012, real bcrypt login/session creation, two newly created companies/users/memberships and two private artifacts. No auth/DB/storage mocks in the HTTP test. The original DB and production services were not modified. Temporary credentials, tokens and test DB are private in the Git-ignored `backups/agentos-local-restore-20261008T184511Z-4b5727fb/` directory; their values are not printed or committed. The isolated server was stopped after each run.

## Baseline exploit (before repair)

| Operation | Expected | Actual |
|---|---|---|
| Anonymous download B file | 401 | 401 |
| Tenant A download tenant B file by key | 403/404 | **200, B bytes disclosed** |
| Tenant A list folder containing B file | B entry absent | **200, B entry present** |
| Tenant A delete B file by key | 403/404 | **200, B file deleted** |
| Tenant B download own file after A deletion | 200 | **404** |
| Tenant A get B Artifact DB record | 403/404 | 403 |

**Finding: CONFIRMED cross-tenant read/list/delete vulnerability in local storage routes.** Prior audit's storage gap was a real exploit, not merely an unverified possibility.

## Repair and retest

`src/lib/storage/local-storage.ts` now persists private ownership metadata with file checksum, MIME, size, owner, company, key and timestamp; the provider hides metadata-less legacy entries. Routes resolve the actual company membership with `requireCompanyAuth`, bind upload owner/tenant server-side, filter list results and require a matching persisted company before download/delete. Unknown/cross-tenant metadata returns 404. Sidecar metadata is mode 0600 in a private directory. Existing files are not removed; ownership of old files must be reconciled before they become accessible again. The [pre-change impact/rollback record](ALO_LABS_STORAGE_CHANGE_PLAN.md) was created before source edits.

A fresh production-mode standalone build against the *isolated* DB passed `scripts/verify-file-acl.mjs`:

| Real HTTP observation | Result |
|---|---|
| Login A + B via real sessions | 200 / 200 |
| Upload A + B, returned company/owner match membership | 201 / 201, both match |
| Anonymous B download | 401 |
| A download B | 404 |
| B download B | 200, expected bytes |
| A list folder | 200, A present and B absent |
| A retrieve B artifact | 403 |
| A delete B | 404 |
| B file after A denial | 200, expected bytes |

**11/11 script assertions passed.** A focused filesystem test and legacy route unit tests also passed (36/36); entire suite 725/725. This is evidence for the local-storage HTTP boundary, **not** a certificate for every document, knowledge, temporary resource, signed URL, S3, historical uploaded file or legacy endpoint. Provider-internal calls still rely on trusted service boundaries. Existing unowned objects are fail-closed but need a reviewed ownership backfill. Full file tenant isolation release gate remains **PARTIAL** pending those tests, migration, and production storage review. Do not mark the entire system PASS.
