# ALO Labs verified CURRENT baseline (not a production certificate)

**Captured:** 2026-10-08T18:44:35.413492+00:00 UTC. **Branch:** `arena/b86c5c11-alolabs-net-ai`. **HEAD:** `07668db093c415d5f805aeb93b8952be5dbf9628`. The checkout is dirty; HEAD does NOT contain the previous AgentOS edits. This is a source-content baseline of the 1141 nonignored files *before changes in this repair phase*, including 1,056 tracked HEAD files and 85 pre-existing untracked files. `ALO_LABS_VERIFIED_BASELINE*.md/.txt` are generated **after** this capture and are excluded from the baseline hash list to avoid recursive/self hashes. Do not call this a pre-implementation inventory. Historical Phase 0 gate: **NOT VERIFIED**.

- [Exact path list](ALO_LABS_VERIFIED_BASELINE_FILES.txt) (one path per line)
- [SHA-256 checksums](ALO_LABS_VERIFIED_BASELINE_HASHES.txt) (one hash/path per line, binary files included)
- [Route membership](ALO_LABS_VERIFIED_BASELINE_ROUTES.md) / [per-route static audit](ALO_LABS_API_VERIFICATION.md)
- [Local DB schema and table counts](ALO_LABS_VERIFIED_BASELINE_DATABASE.md)
- [Environment variable names only](ALO_LABS_VERIFIED_BASELINE_ENV.md)

**Lockfiles and versions:** `package.json`, `package-lock.json`, `bun.lock` are in the hash list. Node `v22.22.3`, npm `10.9.8`; package `1.0.0`. The generated Prisma client in this sandbox is NOT proof of production binary compatibility. Server runtime is development preview, not a production deployment. Running service discovery is recorded in the Git integrity report. Worker configuration: `instrumentation.node.ts` (3-second poll, 10-minute stale-job startup recovery), queue name `agentos`; see database baseline for its actual row count.

**Scope:** Ignored `.env`, SQLite/WAL, uploads, storage, build outputs, caches, backup data, private objects and `node_modules` are deliberately excluded from this SOURCE hash set. They require independent protected data inventory/backup. Hashes are useful only if the manifest itself is preserved and verified; no signed release or offsite anchor exists here.
