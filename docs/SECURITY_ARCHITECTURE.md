# Security architecture and discovery gaps

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## Observed versus required

Existing auth helpers, tenant checks, tool allowlists, rate-limit/CSRF/secret utilities and database safety scripts must be retained. Static route coverage passes but cannot prove actual denial behavior. Existing tool policy checks an approval reference’s presence; the executor can omit permissions and catches ToolRun write failures. The in-memory approval engine loses state on restart. `writeAuditEvent` persists redacted events but does not sign them. These are priority review findings, not proof every route is exploitable.

## Proposed permission boundary

Default grant is read-only, per project and resource. Distinct capabilities: repository analysis, sandbox execution, branch write, PR creation, database read, database write, infrastructure admin and production deploy. Do not infer one grant from another. Separate requesting agent, approving human and executing worker identities.

Production deploy, production DB changes/migrations, deletion, infrastructure destruction, secret rotation, privileged commands, external communication/publication and untrusted installation require explicit human approval. Grant binds actor/project/task, canonical action digest, target, constraints, expiry and nonce. Validate reviewer authorization, unchanged input and unused status at execution; consume atomically with operation record. Denial, expiry, revocation or audit outage must fail closed. Duplicate delivery must not repeat an external side effect.

## Isolation and egress target

Use disposable rootless sandboxes on non-production hosts; no production credentials, host filesystem mounts or Docker socket; non-root UID, read-only root filesystem, dedicated scratch, dropped capabilities, seccomp/AppArmor, no-new-privileges, CPU/PID/memory/disk/time quotas. For higher-risk native code, assess microVM isolation rather than assuming containers suffice. Default-deny egress and block host/metadata/private-network access; allow specific approved destinations through brokered requests. Destroy/quarantine after use; persistent developer workspaces are not equivalent to disposable binary analysis.

## Audit, secrets and artifacts target

Write append-only canonical events with correlation/project/actor/action/input digest/policy decision/result/artifact references. Sign with server-held keys outside agent access; rotation/key IDs and external immutable checkpoints detect tampering and truncation. Do not log prompts, credentials or entire raw tool arguments by default. Deep redaction must handle nested arrays and secrets embedded in values. Current helper’s key-name redaction is insufficient assurance.

Artifact ingress uses size/type/archive-bomb/path-traversal validation, quarantine and malware/dependency scanning before download or tool execution. Signed webhook requests need timestamp/skew checks, nonce/event-ID deduplication and constant-time signature checks. Enforce per-tenant request/model/job budgets and concurrency; cancellation must terminate actual subprocesses, not just a Promise timer.

## Threat and test priorities

Prompt-injected repository files/skills and web pages are untrusted data, not policy instructions. Test invented approval IDs, another tenant’s approval, stale grants, replay, changed payloads, absent permissions, audit DB failure, SSRF/redirect/DNS rebinding, malicious archives, resource exhaustion and secret exfiltration. No untrusted runtime is approved until isolation and negative tests pass. See [risk register](RISK_REGISTER.md).
