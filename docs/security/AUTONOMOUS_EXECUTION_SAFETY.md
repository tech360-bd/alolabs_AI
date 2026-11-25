# Autonomous Execution Safety

Status: implemented gates + explicit gaps · 2026-11-25

## 1. Safety tiers

| Tier | Example | Control | Implemented? |
| --- | --- | --- | --- |
| Low | read public docs, search tenant knowledge | automatic | Yes |
| Normal | draft content, generate an image | automatic within quota | Yes (governance allow) |
| Moderate | modify project files, run an agent, preview deploy | sandbox + project permission | **Partially** — no sandbox/repo yet, so the action cannot occur |
| High | publish content, send customer communication, export data | explicit approval | Yes (policy + approval binding) |
| Critical | delete data, deploy production, change DNS, privilege/policy change | authorised human approval + evidence | Yes (policy + evidence + approval) |

## 2. What blocks what

| Unsafe action | Blocking policy | Evidence test |
| --- | --- | --- |
| Cross-tenant read or write | `SEC-TENANT-001` | `tenant-boundary-deny` |
| Reading credentials | `SEC-SECRET-001` | `secret-access-deny` |
| Arbitrary code / shell | `SEC-SHELL-001` | `untrusted-code-deny` |
| Public chat reaching internal systems | `SEC-WEBCHAT-001` | `webchat-internal-boundary-deny` |
| Self-granting privilege | `SEC-PRIV-001` | `privilege-change-requires-super-admin` |
| Rewriting governance / registry | `SEC-POLICY-001` | `policy-change-requires-super-admin` |
| Destructive DB work without backup | `GLOB-DESTRUCT-001` | `destructive-missing-backup-deny` |
| Production deploy without tests/build/rollback | `GLOB-DEPLOY-001` | `deploy-requires-evidence` |
| DNS/infra change without rollback | `GLOB-DNS-001` | `dns-requires-rollback` |
| Unapproved payment | `GLOB-FIN-001` | `financial-requires-authorization` |
| Silent paid provider usage | `GLOB-PAID-001` | `paid-provider-without-authorization-deny` |
| Unapproved publish / outbound comms | `GLOB-COMMS-001` | `publish-requires-approval` |
| Unapproved data export | `LEGAL-DATA-001` | `data-export-requires-owner` |
| Voice/likeness misuse | `LEGAL-IP-001` | `media-consent-evidence` |
| Regulated advice without review | `LEGAL-ADVICE-001` | `regulated-content-human-review` |

## 3. Evidence, not claims

A step is `completed` only with records:

| Task type | Required evidence |
| --- | --- |
| Software change | lint/typecheck output, test results, build result, diff |
| UI change | browser console + network + screenshot evidence (Phase D/F) |
| External action | provider confirmation id or API response |
| Deployment | CI status + deploy log + rollback plan |
| Data operation | backup reference + affected-row count |

The governance engine already refuses deployment and destructive operations
without the corresponding booleans (`ActionEvidence`). The execution UI must not
invent the booleans: they are set by the component that actually observed the
result, and stored with the run.

## 4. Approval integrity

- An approval is valid only if: status `approved`, unexpired, same tenant, bound to
  the exact action class and payload digest, and granted by an allowed reviewer
  role (`src/lib/governance/approval-binding.ts`).
- A caller-supplied approval id is never accepted at face value.
- Replay of the same bound payload is currently possible; single-use consumption
  requires a persistence marker (GAP-004). Mitigation until then: approvals expire
  and are bound to one resource and payload.

## 5. Emergency stop

- Activation is explicit and privileged (Admin/Super Admin).
- Effects: deny all non-read actions, deny paid providers, stop external comms,
  stop queue dispatch (depending on which toggles are on).
- Audited: activation, deactivation and every denial.
- Evidence is preserved: nothing is deleted when the stop is engaged.
- Both historical key namespaces are honoured so no console can be silently ignored.

## 6. Sandbox requirements before enabling code execution

`SEC-SHELL-001` stays in place until all of these exist:

1. Ephemeral container per run, destroyed afterwards.
2. CPU, memory, wall-clock and disk limits.
3. Network egress disabled by default with an explicit allowlist.
4. Filesystem writable only inside the run workspace; no host mounts.
5. Secrets injected only as short-lived, scoped credentials — never production.
6. All stdout/stderr captured with secret redaction before persistence.
7. Verifiable exit codes; a timeout is a failure, never a success.

## 7. Incident response hooks

| Event | Record | Operator action |
| --- | --- | --- |
| Repeated governance denials | `AuditEvent` (`governance.deny`), `SecurityEvent` | Investigate agent or caller; optionally disable the agent |
| Approval anomaly (wrong role/payload) | `Approval` + audit | Revoke, re-review |
| Emergency stop | `ServerLog` + audit | Preserve logs, root-cause, document re-enable criteria |
| Connector compromise | `IntegrationCredential` revoke + audit | Rotate provider credentials |

## 8. Not claimed

- No sandbox, no isolated browser and no repository isolation exist yet.
- Route-level and queue-level governance coverage is incomplete (GAP-003).
- Production behaviour has not been verified from this environment.
