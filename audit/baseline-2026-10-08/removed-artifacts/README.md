# Stray tracked artifacts removed from the repository root (2026-10-08)

| Original path | What it was | Disposition |
|---|---|---|
| `--timeout` | A 34 KB PNG image accidentally committed under a CLI-flag filename | Moved here as `stray-png-named-dash-dash-timeout.png` for traceability; removed from repo root |
| `zi3wlUqn`, `ziC7a7L3`, `zirgKgT5` | Git LFS pointer files (134 bytes each) for 160–173 MB blobs that are not present in this repository (no `.gitattributes`, no LFS objects) | Pointers kept here as evidence; removed from repo root |
| `project-production.zip` | 2.4 MB stale "production" ZIP from a previous, unverified build | Removed from version control. Production ZIPs are release artifacts and must never be committed (see `docs/RELEASE.md`) |

No source code or configuration was lost: each file was unreferenced by any script, config or import (verified with `git grep`).

## Preserved LFS pointer contents

### zi3wlUqn
```
version https://git-lfs.github.com/spec/v1
oid sha256:0dca4e9c08f857b18fa9e0d4891d97510483483a7537532dc785305484816ef7
size 173490303
```
### ziC7a7L3
```
version https://git-lfs.github.com/spec/v1
oid sha256:87f3e857baabb8858cf7e61c8a87f2e7c758710e20cf7e28a54cc1440af426b0
size 160443684
```
### zirgKgT5
```
version https://git-lfs.github.com/spec/v1
oid sha256:c5ddc33638e0a017abde30ecb264e497543e5434092e98415ca27a3a9bd84ffc
size 173490303
```
