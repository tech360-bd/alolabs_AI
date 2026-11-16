# Model discovery issue and PR history audit — 2026-11-16

## Issue #45

The issue is an intentionally created human-review report, not a failed job. The scheduled [run 43899920459](https://github.com/tech360-bd/alolabs_AI/actions/runs/43899920459) completed successfully and the workflow created the issue as configured. It does not authorize or deploy any model. Review of licences, pricing, privacy, behaviour, hardware and Super Admin approval remains necessary.

The PR's CI also exposed a pre-existing failure on `main`: the Prisma delegate checker matched `db.client*` in a documentation comment as if it were a real delegate. Rewording that comment preserves the check and application behavior; it does not weaken the gate.

The report generator nevertheless had a real classification defect: `Number(null)`, `Number('')` and similar values are zero, and a sufficiently tiny non-zero numeric string can underflow to zero. Consequently absent or non-zero pricing could be reported as explicit zero. A `:free` suffix also bypassed price checks, even when prices contradicted it. The correction requires explicit zero values for both prompt and completion, including for `:free` identifiers. It excludes unverified rows rather than asserting their prices. The report also clarifies that neither zero token prices nor a catalogue listing proves an open-source licence, or that other modalities and fees are free. The original issue is a historical snapshot and should not be treated as verified model or pricing evidence.

## Pull request audit

GitHub's complete PR listing on 2026-11-16 contained 45 PRs: #1–#44 and #46. #45 is an issue, not a PR. All 45 were reported merged into `main`. At the audit snapshot, `main` was `4560aab76b993a7b2eccb9640ee4445a1f1a7c52`; Git `merge-base --is-ancestor` confirmed that every GitHub-reported merge commit is an ancestor of that exact commit. There were no open or closed-unmerged PRs in the listing.

A net path comparison of each PR merge against its first parent found 1,277 distinct added or modified paths, seven of which no longer exist at the same paths in that `main` snapshot:

- `src/app/portal/api-keys/page.tsx`, `src/app/portal/tasks/page.tsx`, `src/app/portal/usage/page.tsx`, `src/app/portal/webhooks/page.tsx`: explicitly removed in PR #42's client/internal surface separation.
- `src/components/agent-hub-shell.tsx`, `src/components/enterprise/company-switcher.tsx`, `src/components/enterprise/enterprise-shell.tsx`: removed in PR #15's authenticated shell consolidation.

These are documented subsequent design/security changes, not evidence of failed merges. Restoring them indiscriminately would undo later work; the prior versions remain available in Git history. Ancestry and path checks do **not** establish that every historical word is still present or that all prior functionality is unchanged. Later PRs intentionally edit or delete earlier code, so a word-for-word restoration cannot be inferred to be safe or correct. No unmerged PR content was found to apply.

Reproduce ancestry checks after fetching full history: list all PRs with `gh pr list --state all --limit 500 --json number,state,baseRefName,mergeCommit`, then check each merge SHA with `git merge-base --is-ancestor <merge-sha> <main-snapshot>`. Re-run against a fresh snapshot if `main` advances.
