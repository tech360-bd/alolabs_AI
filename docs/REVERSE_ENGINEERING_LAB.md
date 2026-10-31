# Reverse engineering laboratory discovery plan

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## Authorization first

Accept only owner-authorized applications, repositories, devices, APKs, libraries, databases, protocols and binaries. Record authorization owner, allowed targets/actions/time and sample hash; reject missing/out-of-scope jobs. No DRM/license/authentication/access-control bypass. Never execute unknown binaries on production infrastructure.

## Candidate adapters and boundaries

| Job | Proposed tooling/interface | Output and verification gate |
|---|---|---|
| Web UI/workflows | Isolated browser automation; REA where justified | Screenshots, navigation graph, interaction trace, environment and viewport; redact tokens/PII. |
| API mapping | Authorized request replay against disposable fixture | OpenAPI-like observed contract, request/response examples, negative cases; avoid writes to live targets. |
| Repository/dependencies | Read-only checkout parsing and manifest inventory | Source-linked architecture facts, SBOM and confidence; no package scripts during inspection. |
| Android | Authorized APK, emulator snapshots and ADB | Manifest/components, screens/workflows and reproducible test; no production phone/account. |
| Native binaries | Ghidra headless worker, optional REA bridge | Imports/strings/functions/decompilation references; clearly distinguish inference from verified behavior. |
| Desktop/protocols | Dedicated VM, approved debugger/capture | Scoped traces and workflow/specification; no capture of unrelated communications. |
| Database schema | Approved read-only metadata export | Engine/version/DDL/relationships; no production mutation or unapproved data extraction. |

Ghidra Apache root terms verified; REA MIT root terms verified, but bundled/native/backend terms remain a separate gate. AnyPS5 is not recommended for this general-purpose lab. Browser/Android/debugger installations and containment tests have not been performed.

## Reproducibility and containment

Worker image/tool versions pinned, sample hash and authorization recorded, default-deny network, ephemeral scratch, job quotas and immutable artifact manifest. Static analysis before dynamic execution. Dynamic runs use disposable VM/container with snapshots and no production connectivity. Correlate observations with exact tool output and UI states, not guessed internal implementation. Reports separate observed facts, hypotheses, limitations and independently designed feature specifications.

Acceptance requires denied unauthorized jobs, isolated filesystem/network/secret tests, quota termination, clean disposal, malicious-input handling, repeatable analysis and auditable approval. All remain unverified in this snapshot.
