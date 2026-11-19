# Function preservation and duplicate review

**18 November 2026 · `arena/df553320-alolabs-ai` · working tree, not a release**

**No source file was deleted.** The review did find missing entrypoints in the integration changes: the queue handler registry, methods on `RealTimeServer`, and exports from the public-site header module. Those are available again. The checked export names, public class methods and API methods have no outstanding removals. This is **not** a claim that every historical behavior is identical: the intentional differences are listed below.

## What was compared

| Comparison | Finding |
|---|---|
| [Integration handoff](02-after.md) → this pass | All **2,175** previously inventoried files are still present. **2,024** have identical bytes; **151** changed. **36** code/test/helper files were added outside the audit directory. [Paths and hashes](preservation/changes.tsv). |
| Git base `4def42076c6e829cb5731f9f234be0e119fbff9c` → working tree | The only whole-file deletions are `.zscripts/dev.pid` and the two mini-service `bun.lock` files; dependencies now use the root workspace lock. In **263 changed JS/TS files** the comparison found all **674 explicit export names** and all **86 public class methods/accessors** that it checked at their original module paths, including named re-exports. |
| HTTP entrypoints | **504** API route files, **825** explicitly named HTTP methods, **no base method missing**. The separate auth validator passed: 804 non-public handlers, 19 allowlist entries and one documented exception. Method presence alone does not prove authorization or response equivalence. |

The public redesign already existed at the time of the first integration inventory. Using both the Git base and the handoff avoids mistaking a redesign, file move, or private rewrite for a duplicate removal. The dated inventories were not regenerated.

## What was actually consolidated

The initial scan flagged **53 groups / 169 declarations** with matching printed parameters and bodies. Those groups now use **51 implementations**. Three groups with different parameter names all format the same short US date. The [extraction map](preservation/extractions.tsv) identifies every former declaration and its destination; the seven additional `adjacent` rows document related helpers reviewed with them. All **176** mappings resolve.

- Hub filters and pagination share code; the research hub keeps its company-specific loader. Mail session checks, account config reads, platform token reads and session lifetimes have shared implementations. WhatsApp's requested-number outbound lookup and default inbox lookup remain separate.
- Error helpers share code **within** a response contract. A route that redacts a 500 does not acquire another route's error disclosure, 404 mapping or `success: false` field. JSON parsers that preserve literal `null` and those that substitute a fallback stay distinct. Provider-specific finish reasons stay distinct, too.
- The Node and TypeScript skills seeders retain both CLI paths and their respective database initialization. One catalog and batch writer now serves both. With fixed time/ID generation and an inert DB sink, both originals and both rewritten entrypoints generated **the same 20 SQL batches for 2,000 skills**, including the final count and disconnect. No production seed was run.
- Whole-file byte matches such as license notices, historical snapshots and icons at published URLs were **not** deleted. Equal bytes do not make their paths interchangeable.

The repeat scan found **zero remaining matches under this rule** across 1,284 JS/TS files. It checks named, module-level function declarations with bodies longer than 64 printed characters, excluding test and generated files as defined by the checker, vendored skills and these audit tools. It does not detect every similar algorithm, closure, method, data literal or cross-language implementation.

## Restored behavior and deliberate differences

| Area | What a caller can rely on now |
|---|---|
| Queue extensions | `mini-services/queue-service/index.ts` exports `registerHandler(jobType, handler)` again. The poller does no work without registrations. It uses durable claims, concurrency limits, lease recovery, retry/backoff and terminal failure for registered types only. Operators receive `job:assigned`, `job:completed` and queue updates. A failed monitor notification does not retry the underlying job. The poller does **not** complete unknown jobs or take over the app-owned `agentos` and `voice` queues. |
| Realtime server | `emit`, `emitToRoom`, `joinRoom`, `leaveRoom`, `updatePresence`, `getPresence`, `getOnlineUsers` and `getStats` are present. `connected` and `auth:success` are emitted after the verified handshake. Join/leave/list, presence, ping and privileged metrics work. Presence includes idle-away handling; stats use bounded time buckets. A legacy verifier returning a user ID grants only a personal room. The deployed path remains `/socket.io`; an embedded server and the hooks can explicitly use `/realtime`. |
| Realtime clients and producers | The three hooks still subscribe, refresh membership, reconnect and release the shared connection. The seven named business event channels also produce typed hook envelopes. `auth:verify` can acknowledge the **same** verified session; it cannot admit an anonymous socket or switch identity. Unaddressed broadcast, unrestricted room joins, a global client roster, and client publishing to other users/tenants were **not** restored. Producers must address a verified user's or company's room. The notification API publishes a scoped invalidation, not the private message body. Channel support is not proof of an external publisher for each channel. |
| Public site | `chrome.tsx` again exports `SiteHeader`, `NavItem`, `SITE_NAV` and `SITE_RESOURCE_NAV`. `active` remains optional. There is one header, not a second copy of the old site. The redesigned home retains the old section bookmarks, including `/#technology`, with the network exhibit and technology/delivery reference together. The layout and editorial copy are not the old layout and copy. |
| Mail | `SMTPEmailService.send`, `sendBulk`, `sendTemplate` and `verifyConnection` remain. Nodemailer replaces private raw socket, MIME, encoding and SMTP command code. The authenticated mailbox is the envelope sender even if `From` is an alias; blind recipients are in the envelope only. Implicit TLS or STARTTLS is required for SMTP; the IMAP reader requires implicit TLS. Plaintext credential transport is not a compatibility feature. |
| Learning and migration tools | `tsx scripts/seed-learning.ts --preview 8` emits eight labelled synthetic profiles, without a DB: knowledge, sessions, maturity, achievements and protection settings. `--demo-agent <id>` remains the idempotent local SQLite write path. Random official-looking history is not written across the fleet. The MySQL preview retains its callable name and accepts legacy option fields; its apply branch was **already gated off at the Git base**. Preview now reads source counts without opening a target; apply and overwrite stay refused. |
| Settings, workers and deploy | Both settings views use the same persisted six-preference editor. The unfiltered private settings table and local-only form controls are not exposed as configuration. Worker telemetry and pool preferences remain. The previous worker buttons edited a stored status, not a process. Worker lifecycle control belongs to the host supervisor; the deploy UI shows registry records rather than treating a 501 as a successful release. |
| Other large rewrites | Login failure counting lives in the login handler and shared limiter, not in parallel proxy counters. Prometheus labels, escaping and newest-series selection live in `gaugeLines`. `.zscripts` entrypoints delegate to workspace installs/builds, separately supervised services and explicit DB provisioning instead of auto-DDL or packaging a development DB. The old models-test request factory was unnecessary for a zero-argument handler; OAuth tests use actual Next responses rather than a fake cookie jar. Removed private implementation text in these areas is not evidence of text duplication or a promise of identical wire behavior. |

## Verification on this working tree

- **Full Vitest:** 190 files, 2,068 cases: **2,053 passed, 0 failed, 15 skipped**, exit 0. All skips are in `mysql-compatibility.test.ts` because no `MYSQL_TEST_URL` was supplied. This run used one worker, disposable SQLite and disabled paid traffic. The tests changed; comparing test counts is not a coverage percentage.
- **Focused evidence:** real SQLite extension dispatch/recovery; real Socket.IO clients for targeted delivery, room isolation, revocation and metrics permissions; React hook cleanup and token rotation; response shapes and parsing edge cases; actual MIME/envelope construction with no network send. An isolated smoke check loaded the **packaged queue CJS entrypoint**, registered a handler, enqueued over an authenticated socket, received queued → assigned → completed, and verified one durable attempt, the original payload, and the result.
- **Typecheck, lint and build:** product/mini-service/operator and fixture typechecks passed. ESLint: **1,493 files, 0 errors, 0 warnings**. Clean Next build: **367/367** static outputs; standalone app and both services packaged; **8,522 files** checked by the package guard. Compose validation, route-auth validation, `git diff --check`, and the handoff checksums passed.

[Machine-readable checks](preservation/checks.json) · [Mapping](preservation/extractions.tsv) · [Changed-file fingerprints](preservation/changes.tsv). To repeat the structural check from the repository root with its locked dependencies installed:

```sh
node docs/audit/integration-2026-11-18/tools/check-preservation.mjs
```

The checker reads source syntax, not runtime behavior or all inferred types. The tests do not certify unknown external consumers, live mail providers, MySQL/InnoDB, or a production deployment. No changes were pushed, merged or deployed during this review.
