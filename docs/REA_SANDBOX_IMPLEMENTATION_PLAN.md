# REA sandbox workflow — implementation plan

Status: **not implemented**. Requested direction: REA-backed analysis of authorized open-source projects, with automatic editing and testing confined to an isolated workspace; human approval before changes reach the main repository or production.

## Intended workflow

1. An authenticated operator submits the source repository and immutable revision, the feature/task, evidence of permission and the intended use. Review the source license and applicable third-party dependencies before copying or distributing code. Open source is not a blanket license to use every project in every way.
2. A trusted worker creates an ephemeral, tenant-isolated workspace from the specified revision. The agent treats repository files, tool results and REA output as untrusted data, not instructions overriding policy.
3. In the isolated worker, use a pinned, reviewed REA version and its documented MCP contract for analysis. Source inspection should be preferred when source is available; REA's binary-analysis backends such as Ghidra require separate installation and verification.
4. The coding agent proposes and applies changes **only within that workspace**, runs bounded tests, and produces a patch, source/revision provenance, test output, and limitations. Record tool calls and results in a tenant-scoped audit trail. Do not silently claim tests or analysis succeeded.
5. A human reviews the patch, license obligations, security findings and test results before a separate authorized operation applies it to the main repository. No automatic push, merge, deployment, or production access.
6. Self-learning should initially mean reviewable lessons and feedback tied to evidence, not automatic changes to agent policy, permissions, model weights, or cross-tenant memory. Only approved, tenant-scoped knowledge should be retained.

## Required engineering gates

- Establish a real worker isolation boundary before executing untrusted code: non-root execution, no host Docker socket or production credentials, restricted filesystem, network denied by default, resource/time/output limits, cancellation and cleanup. Containers alone are not a complete security boundary for hostile code; choose and validate an isolation technology appropriate to the threat model.
- Pin and review REA and its dependencies; verify tool schemas, transport, lifecycle and failure handling against that version. Never run upstream setup scripts on the application host or give the agent unrestricted host shell access.
- Bind authenticated company/user and authorization to each run, workspace and artifact. Verify approvals server-side and protect against cross-tenant access and replay; a model-supplied approval identifier is not sufficient.
- Validate repository acquisition and redirects, block internal network access and credential leakage, and prevent symlink/path traversal and workspace escape. Keep secrets out of prompts, logs and artifacts.
- Exercise actual REA, edits, tests and patch export in the intended isolated runtime, including escape attempts, timeout, cancellation, resource exhaustion and tenant separation. Configure a real model provider and report missing prerequisites rather than returning simulated success.
- Define retention, quotas, audit access and data deletion before enabling this for users. Keep REA skill documents quarantined until the corresponding runtime and controls have been reviewed.

## Current checkout

The Command Agent's tool loop is read-only (`src/lib/command-agent/agent.ts`), and REA skill documents are quarantined (`src/lib/agent-skills`). The existing tool policy alone does not establish a sandbox or verify approvals for this workflow. No REA MCP integration, isolated coding worker or end-to-end REA test was added by this plan. The current development environment did not expose Docker, so container isolation could not be tested here.
