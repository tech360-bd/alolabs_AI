# Autonomous Coding Engine

Status: **not implemented** — prerequisites, safety model and build plan · 2026-11-25

## 1. Current state (what is real)

| Component | State | Evidence |
| --- | --- | --- |
| Code generation by a model | Works inside chat/command agent | `src/lib/command-agent/`, `/api/chat` |
| Repository access | **Missing** | no GitHub/GitLab client in `src/` |
| Workspace checkout / file write | **Missing** | no sandbox, no volume per run |
| Command execution (lint/test/build) | **Missing** | `SEC-SHELL-001` denies `code.execute.untrusted` by design |
| Diff / pull request creation | **Missing** | no VCS integration |
| Browser verification of a preview | **Missing** | no application-level browser automation |
| CI monitoring | **Missing** | no CI provider client |
| Coding-quality policy | **Implemented** | `GLOB-DEPLOY-001`, `SEC-SHELL-001`, `PROJ-SCOPE-001`, `GLOB-PREVIEW-001` |

Therefore: any claim that AgentOS can currently modify a customer's repository or
open a pull request would be false. The tool registry deliberately contains only
read-only tools.

## 2. Safety model (already enforced where it applies)

```
request
  → governance: write.project (tenant + project boundary, emergency controls)
  → repository binding required (repository OAuth grant, not a URL)
  → sandbox: no production credentials, CPU/mem/time/network caps
  → implement on a feature branch
  → lint + typecheck + tests + build (evidence recorded)
  → preview environment (deploy.preview)
  → browser verification (console errors, network failures, screenshots)
  → diff + review summary
  → deploy.production: requires testsPassed + buildPassed + rollbackPlan + approval
  → PR / deployment only with a verified approval token
```

Rules that must not be relaxed for speed:

- Never suppress type or test failures to make CI green; a failing check is
  reported, never hidden (`docs/AUTONOMOUS_SOFTWARE_FACTORY.md` states the same).
- Never run untrusted code on a platform host.
- Never place production credentials in a build sandbox or in logs.
- Preserve a rollback point (branch + previous commit SHA + backup for data changes).

## 3. Required components

| Component | Responsibility | Proposed location |
| --- | --- | --- |
| Repository service | OAuth install, token refresh, clone, branch, commit, PR | `src/lib/vcs/` + `IntegrationCredential` |
| Sandbox runner | Ephemeral container per run, resource caps, no egress by default | separate service; invoked through a governed tool |
| Task workspace | Files, logs, artifacts bound to `AgentOSRun` | `Artifact`, `RunEvent` |
| Verification harness | lint/typecheck/test/build result capture | new `VerificationResult` model |
| Preview manager | Per-commit preview URL + TTL | `PreviewEnvironment` |
| Browser verifier | Playwright worker producing console/network/screenshot evidence | new worker service |
| PR publisher | Diff → PR → CI status polling | `src/lib/vcs/` |
| Evidence gate | Refuse "completed" without verification records | extends governance evidence |

## 4. Tool surface (proposed, all governed)

| Tool | Action class | Approval |
| --- | --- | --- |
| `repo_list_files`, `repo_read_file` | `read.public`-equivalent (tenant-scoped read) | none |
| `repo_create_branch`, `repo_write_file` | `write.project` | none within project quota |
| `sandbox_run_tests` | `code.execute.untrusted` → **only** allowed once a sandbox executor exists and the policy is amended with evidence `sandboxVerified` | approval until then |
| `preview_deploy` | `deploy.preview` | none (isolated) |
| `prod_deploy` | `deploy.production` | evidence + approval |
| `open_pull_request` | `write.project` + notification | none |

Until a sandbox exists, `SEC-SHELL-001` keeps `code.execute.untrusted` denied. That
is intentional: relaxing the policy before the capability exists would be the
worst possible ordering.

## 5. Delivery plan

| Step | Deliverable | Exit criteria |
| --- | --- | --- |
| F0 | `ProjectRepository` model + GitHub App connection + encrypted tokens | Revocation tested; no plaintext token anywhere |
| F1 | Read-only source analysis report for a connected repo | Report generated with real file citations |
| F2 | Sandbox runner + `VerificationResult` | A no-op branch runs lint/test/build with captured evidence |
| F3 | Implement → verify → diff on a test repository | Diff matches intent; tests recorded |
| F4 | Preview + browser verification | Console/network/screenshot evidence stored |
| F5 | PR creation + CI polling | PR URL recorded; CI status read from provider |
| F6 | Production deploy approval flow | `GLOB-DEPLOY-001` satisfied end to end |

Each step ships behind a feature flag and is independently revertible.

## 6. Non-goals for this phase

No repository code, no sandbox, no PR pipeline was written in this session. The
contribution here is the policy gate that will make those features safe to add, and
an honest inventory so the product does not advertise them before they exist.
