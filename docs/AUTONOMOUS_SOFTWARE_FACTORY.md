# Autonomous software factory discovery proposal

> Phase 0 discovery snapshot · 2026-10-31 · baseline `d6774c0c131d460cae08b55ccde7eedc984843d1`
> Recommendations are not implementations or authorization. No application, dependency, schema, infrastructure or production changes were made.

## Preserve existing implementation

Existing workflow definitions, coding/model tools, worker services, panels, tests and CI are the foundation. No new framework installation is recommended. Existing workflow definition validation is a static success, not evidence a generated product is tested or deployable.

## Target workflow and human gates

1. Validate project ownership, objective, acceptance tests and budget.
2. Research and inspect repository read-only; ignore embedded prompt-injection instructions.
3. Produce source-linked architecture/diff proposal; obtain required owner approval.
4. Use an authorized isolated workspace and branch; this Arena session must remain on `arena/bd79faf4-alolabs-ai` and cannot create/switch other branches. No branch creation was performed.
5. Implement additive changes while preserving existing data/configuration/features.
6. Generate deterministic unit/integration/browser/API tests with fixtures.
7. Execute tests and dependency/security checks in isolated workers.
8. Review changed files, secrets, license notices, migrations and acceptance evidence independently.
9. Prepare a PR only after permitted publication and branch-write grants; never push main.
10. Wait for human review/merge approval; production deployment is a separate bounded approval through existing protected pipeline.

Failures preserve logs/artifacts and checkpoints, schedule bounded retries only for retryable operations, and never weaken tests or permissions automatically. A passing build is insufficient completion evidence.

## Technology support strategy

Keep project-specific adapters for Next.js/React/TypeScript/Node, Python, REST/WebSocket, PostgreSQL, MySQL/MariaDB, SQLite and Docker. Android builds need SDK/JDK/emulator workers; iOS architecture planning can be text-based, but actual iOS builds require authorized Apple toolchains/hardware. Do not claim every stack works merely from adapter presence. No mandatory paid coding API; use verified local model first and optional explicitly configured external provider.

## Required factory evidence

Task/run IDs, repository base/head SHA, allowed file/resource scope, human grant digest, isolated image/tool versions, complete commands/exit codes, reproducible reports/coverage, reviewed diff, artifact hashes and PR URL if actually created. No generated-code pipeline, PR or deployment was executed in Phase 0.
