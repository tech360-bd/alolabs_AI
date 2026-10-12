# Backup/restore cross-platform repair — 2026-10-11

**Scope: repository tooling only.** No production host, database, VPS or
credential was touched. This pass removes the GNU-only constructs that made
`deploy/scripts/backup.sh` fail on macOS
(`realpath: illegal option -- m`) and re-runs the backup/restore
integration test on a BSD-style userland. Production backup/restore is still
**NOT VERIFIED** — see [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).

## 1. Failure

`__tests__/integration/backup-restore.test.ts` runs the real
`deploy/scripts/backup.sh` against a throw-away SQLite database and storage
directory. On macOS it aborted with:

```
realpath: illegal option -- m
usage: realpath [-q] [path ...]
```

`deploy/scripts/backup.sh:78` called `realpath -m`, which exists only in GNU
coreutils. The same script contained four further GNU-only constructs that
break on a stock macOS/BSD userland:

| # | Line (before) | GNU-only construct | Behaviour on macOS |
|---|---|---|---|
| 1 | `db="$(readlink -f "${db}")"` | `readlink -f` | `readlink: illegal option -- f` (stock macOS ships BSD `readlink`) |
| 2 | `realpath -m "${configured}"` | `realpath -m` | fatal, aborts the backup before any manifest is written |
| 3 | `realpath --relative-to=...` | `realpath --relative-to` | fatal; also calculates the storage-vs-app-dir relationship |
| 4 | `find ... -printf '%T@ %p\n'` | `find -printf` | unsupported primary; retention silently pruned **nothing** |
| 5 | `sha256sum` / `sha256sum -c` | GNU coreutils | `sha256sum: command not found` (macOS has `shasum -a 256`) |
| 6 | `mapfile -t ... < <(...)` | bash 4+ builtin | `mapfile: command not found` on the bash 3.2 that macOS ships |
| 7 | `rm -rf --one-file-system` | GNU `rm` | `rm: illegal option -- -` |

## 2. Fix

### New: `deploy/scripts/lib/portable-coreutils.sh` (sourced, never executed)

Reimplements the GNU behaviour with shell built-ins plus tools that exist on
both platforms. Every helper keeps the semantics — including the traversal
protections — of the command it replaces:

| Helper | GNU equivalent | Notes |
|---|---|---|
| `alo_canonical_path PATH [BASE]` | `realpath -m` / `readlink -f` | resolves symlinks physically (`cd -P` + `pwd -P`) on the longest existing prefix, then collapses `.`/`..` lexically. Makes `/tmp` (a symlink to `/private/tmp` on macOS) compare equal to the real directory. |
| `alo_relative_path BASE TARGET` | `realpath --relative-to=BASE TARGET` | both sides must be canonical; returns `.` or a `../`-prefixed path, exactly what the external-storage decision relies on |
| `alo_sha256 FILE…` | `sha256sum FILE…` | picks `sha256sum`, else `shasum -a 256`; **probes** the tool against a known digest so a stub can never be trusted with a manifest |
| `alo_sha256_verify DIR [SUMS]` | `(cd DIR && sha256sum -c SUMS)` | same `"<hex>  <file>"` line format on both tools |
| `alo_file_mtime PATH` | `stat -c %Y PATH` | falls back to BSD `stat -f %m` |
| `alo_remove_tree PATH [MUST_BE_INSIDE]` | `rm -rf --one-file-system PATH` | `find -xdev` never descends into another filesystem; optional containment guard refuses anything outside the backup directory |

### Changed: `deploy/scripts/backup.sh`

* Sources the helper library and canonicalizes `APP_DIR`, `BACKUP_DIR` and
  `ENV_FILE` before any comparison.
* `readlink -f` → `alo_canonical_path`; `realpath -m` → `alo_canonical_path`;
  `realpath --relative-to` → `alo_relative_path`.
* `sha256sum` → `alo_sha256`, `sha256sum -c` → `alo_sha256_verify`.
* Retention: `find -printf` → `find` + `alo_file_mtime` sorted with
  `sort -rn | cut -f2-`; `mapfile` → a `while IFS= read -r` loop (bash 3.2);
  `rm -rf --one-file-system` → `alo_remove_tree` with a containment check.
* **Unchanged on purpose:** the storage-in-backup-directory refusal
  (`ERROR: storage points into backup directory`), the SQLite online-backup
  + integrity checks, the MySQL branch, the manifest fields and the
  `chmod -R go-rwx` hardening.

### New: `deploy/scripts/verify-backup-checksums.sh`

Portable `sha256sum -c` wrapper (`<snapshot-dir> [sums-file]`) so the
integration test and operators can verify a snapshot on either platform.

### Changed: `__tests__/integration/backup-restore.test.ts`

The original test called `sha256sum` directly, which cannot work on macOS. It
now calls the portable verifier and covers the acceptance criteria:

1. SQLite rows, private file bytes and tenant ownership metadata survive an
   isolated backup → extract → read cycle (unchanged assertions).
2. Tampering with a captured artifact is detected by the checksum manifest.
3. Storage configured **outside** the application directory is archived
   separately, and no archive entry is absolute or contains `..`.
4. A storage path pointing **into** the backup directory is refused, and no
   manifest is produced.
5. A missing database file fails the backup (no manifest, no
   `database.sqlite`).
6. `deploy/scripts/restore.sh` stays blocked and leaves the database byte
   identical.
7. The whole backup runs under an emulated **BSD/macOS userland** — shims
   reject `realpath -m`, `realpath --relative-to`, `readlink -f`,
   `find -printf`, `stat -c`, `rm --one-file-system` and remove `sha256sum`
   — so the macOS path is proven on Linux CI as well.
8. A static guard fails if any of those GNU-only constructs reappears in the
   backup/restore/verify scripts.

The test also strips every `DATABASE_URL`, password, secret and `STORAGE_*`
variable from the environment it hands to the scripts, so a production
credential can never reach a backup run from the test suite.

### New: `.github/workflows/backup-portability.yml`

Runs the backup/restore integration test on **both** `ubuntu-latest` and
`macos-latest` (no secrets, no `environment:`, no `DATABASE_URL`).

## 3. Evidence

### 3.1 Backup/restore and storage (this sandbox, Linux)

```
npx vitest run __tests__/integration/backup-restore.test.ts
 ✓ __tests__/integration/backup-restore.test.ts (8 tests) 8 passed
   · isolated backup → restore (rows, bytes, tenant metadata)
   · checksum manifest detects a tampered artifact
   · storage outside APP_DIR archived without absolute or `..` entries
   · storage pointing into BACKUP_DIR refused (no manifest written)
   · missing database file fails the backup (no manifest, no database.sqlite)
   · restore.sh stays blocked and leaves the database byte-identical
   · full backup under an emulated BSD/macOS userland
   · static guard against GNU-only coreutils flags

npx vitest run __tests__/unit/lib/storage.test.ts __tests__/api/storage.test.ts
 ✓ 27 + 8 = 35 tests passed            (no storage regression)
```

### 3.2 The reported failure, reproduced and fixed

```
# deploy/scripts/backup.sh as of f225b98, with stock-macOS coreutils
realpath: illegal option -- m
usage: realpath [-q] [path ...]        → exit 1, no manifest written

# the repaired script, same emulated userland (no sha256sum, BSD realpath,
# BSD readlink, find without -printf, stat without -c, rm without
# --one-file-system):
BACKUP_VERIFIED=/tmp/alo-repro-XXXX/snapshots/20261011T223925Z   → exit 0
```

### 3.3 Repository gates

| Gate | Result in this sandbox | Note |
|---|---|---|
| Full test suite `vitest run` | 56 files passed / 5 blocked, **793 passed, 28 skipped, 0 failed** | the 5 blocked suites are Prisma-client suites (see §4) |
| `tsc --noEmit` | 414 errors — **byte-identical to the unmodified baseline** | see §4 |
| `eslint .` | **0 errors**, 2 pre-existing warnings | — |
| `next build` | blocked by the same pre-existing type-check failure | see §4 |

### 3.4 Sandbox limitation (not a code failure)

`prisma generate` cannot run here: the Prisma engine binaries are fetched from
`binaries.prisma.sh`, which this sandbox's egress policy blocks, so
`.prisma/client` does not exist. Consequences, all pre-existing and identical
before and after this change:

* Five integration suites (`agent-health-integrity`, `ai-provider-config`,
  `job-queue-durability`, `prisma-foreign-keys`, `run-resume`) cannot load:
  `Cannot find module '.prisma/client/default'`. None of them touches
  backup/restore.
* `tsc --noEmit` reports 414 errors, all downstream of
  `Module '"@prisma/client"' has no exported member 'Prisma'`. The baseline
  run on the stashed, unmodified tree produces the identical error profile,
  and none of the errors is in a file this change touches
  (`__tests__/**` is excluded from `tsconfig.json`; `deploy/**` too).
* `next build` stops at `Failed to type check.` for the same reason.

CI (`ubuntu-latest`, plus `macos-latest` for the backup test) has network
access, runs `prisma generate`, and therefore exercises all of these gates.

## 4. Not changed / not verified

* `deploy/scripts/restore.sh` remains **intentionally blocked** — automated
  production database restore stays disabled. The test asserts it exits
  non-zero and leaves the database untouched.
* `scripts/restore.sh` (legacy, hard-coded `/opt/alo-labs-ai-eos`) and
  `deploy/scripts/deploy.sh` still contain GNU-only constructs
  (`realpath --relative-to`, `readlink -f`, `stat -c %U`). They are Linux
  production deploy paths, outside the scope of this repair, and are listed
  here as a follow-up.
* Production backup/restore, encryption, off-site retention and RPO/RTO
  remain **NOT VERIFIED**. A passing isolated test is not a restore drill.
