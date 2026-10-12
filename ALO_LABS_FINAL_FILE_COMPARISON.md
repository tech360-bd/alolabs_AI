# Current-baseline to final source comparison

Capture: 2026-10-08T19:21:48.825625+00:00 UTC. Historical pre-implementation Phase 0 remains **NOT VERIFIED**. This compares the **1,141 hashed pre-repair CURRENT baseline files** with the current working tree. Generated final inventory/hash manifests and this report are included in the path list but excluded from the hash list to avoid recursive self-hashing. Ignored `.env`, private backups, uploaded files, caches, `node_modules` and build outputs are not source artifacts.

Baseline: **1141**; final paths: **1171**; modified baseline: **17**; added/generated: **30**; deleted/missing: **0**; baseline renames/moves: **0 observed**.

## Modified baseline paths

| Path | Classification | Before SHA-256 | After SHA-256 |
|---|---|---|---|
| `.github/workflows/ci.yml` | MODIFIED | `9ba032d92c7a7e240c2ab871618bb8c23928cda7b866f2bfd15f515a3d6e2958` | `d67844ca50ee1fa67951ad1bf5c87c15b98ab5f5afd5e20eab36d03b2c9832a6` |
| `.github/workflows/deploy.yml` | MODIFIED | `0b53782c781fb5fafc6e9599261f3630829ac8b5b65436de601286d23d4f415e` | `7da10345e7826822df5bc70a943480dc78c45c0000571140170598ead8c29b75` |
| `ALO_LABS_AGENTOS_FINAL_AUDIT.md` | MODIFIED | `6d17a2a2ecda6164349430dbb0cbe8ef208676632fd32752f962c4c7da94914a` | `a81ff1501aa5ce632936ad4b33ddf868590e3714042f96ffab1535ffbb329fb8` |
| `ALO_LABS_DATABASE_VERIFICATION.md` | MODIFIED | `4f043fbc2a255deb28a73b6e16b493d8ed1d6dd38b14a1d067e253763d266874` | `c90836e3e66a8a9f270bd544790c13d30ddbf1b1a76ea103b3b3479046c6f9c7` |
| `ALO_LABS_SECURITY_AUDIT.md` | MODIFIED | `877a4fd32ec754a19692bfce3513b9ec49a48941d47bb6ed055436bf7bba288e` | `b1ff404070cf89f9b7c63f520bebd5c98842677e1871a1a85f0db541d45d94d8` |
| `BACKUP_RECOVERY.md` | MODIFIED | `1a522883646394a6cdcbff0a98913d9a1a2674a51d2106a13c74bc920318e254` | `f9c38820a099357e2a965f6acd19af498aea17a210536110227eaf6e750df1ba` |
| `__tests__/api/storage.test.ts` | MODIFIED | `ab0d67db46575bad2f5c05aea9e6fa1afd465f9e34db1e6a20f32101177e9591` | `95d71dfb8612520e8c6de8220a0ed7f88090ee038eae513ce4684cbcbb7e671f` |
| `__tests__/unit/lib/storage.test.ts` | MODIFIED | `20a6f07a9d78d38476c77fd609fa8bf29e2cdbe679d0b98867c0afc9a2c6dd53` | `4ebfe2a47e2ce3c7d716bac8c1952fd81e24ebd092239058149d9588dd65eef9` |
| `bun.lock` | MODIFIED | `cb3100ed8bb7269944ffb478c8128617b87b388ddf294a579fdb411e48081a93` | `af500ec118f33127b17326d1796c9ea83a4dde1c95409562d5c26056892ec42b` |
| `deploy/scripts/backup.sh` | MODIFIED | `b96e880bf5917b7c8c8b71d40cfcf7f94e990f6548451b027ff1c8c3ffbfb0f6` | `f0367ccaeb0b9e072f40ef066dcbdd30aca833e16d3c65db0ea56a847b9b720e` |
| `package-lock.json` | MODIFIED | `9df8192d0d52eea2a503033e2d9865bd7ec851e7d4a42d7e7784740060316077` | `f158e6799ce3f207a74f0af89b63484be60bb1361d65b96be2263210b0c8c2b6` |
| `package.json` | MODIFIED | `852bec46240f043dbf98d31b08fc680a28517debf764376f6e9eb99bd034a2f0` | `273c194c3c39d748745f88b94dd5ecdc9bafad9e2f565bbbbdde9cb68622f7e0` |
| `scripts/sqlite-push.ts` | MODIFIED | `80aa7d6027af0f163e38dfbd9f96ec542dee10c798424cdf7c9894e536445c7c` | `86f3c10fc1ce7a9b8333f88d549d71e44340c8b1d36ff8232972c6200efb48da` |
| `src/app/api/storage/files/[id]/route.ts` | MODIFIED | `c54bf0b69f3eab9c3c92232b750d9785fba0eee10cbb988231cbc26dc7cf6954` | `dcd060541a8e9fb89f8cdf121db047d7134b78ff927576d84009134c29ca248b` |
| `src/app/api/storage/files/route.ts` | MODIFIED | `da4f6af585ef8ea7fbd8fa8b3d459125b20add75dc7c48e0ca5e8095f34c1dbc` | `e831cb46f10b77ad67ac567623a5423003c9ee698f6d828a0dc162144252d487` |
| `src/app/api/v1/health/route.ts` | MODIFIED | `ad46ac3691a88dd8fc00e6d59fc1b24d15f7f48244ab06f9ef6c5272fd85c075` | `0b5f480ba243063e1cbf48c63cbc38c93923435668b05b84e37363f0140f3aa4` |
| `src/lib/storage/index.ts` | MODIFIED | `a6ddbe46fea31d24de88352236154702606b4b69e2f50ff75113a5ff077b238b` | `ffc2c3a1b83f4d60b67b7558ba0d245bc2ab8241b65f6c26ea024054a81cc9b6` |

## Added paths

| Path | Classification |
|---|---|
| `ALO_LABS_AI_ECOSYSTEM_MATRIX.md` | ADDED |
| `ALO_LABS_API_SECURITY_MATRIX.md` | ADDED |
| `ALO_LABS_BACKUP_RESTORE.md` | ADDED |
| `ALO_LABS_DATABASE_FORENSIC_REPORT.md` | ADDED |
| `ALO_LABS_DATABASE_RESTORE_TEST.md` | ADDED |
| `ALO_LABS_DEPENDENCY_SECURITY.md` | ADDED |
| `ALO_LABS_ENDPOINT_SECURITY_MATRIX.md` | ADDED |
| `ALO_LABS_FILE_TENANT_ACL_TEST.md` | ADDED |
| `ALO_LABS_FINAL_DATABASE_EVIDENCE.md` | ADDED |
| `ALO_LABS_FINAL_FILE_COMPARISON.md` | GENERATED |
| `ALO_LABS_FINAL_FILE_HASHES.txt` | GENERATED |
| `ALO_LABS_FINAL_FILE_INVENTORY.txt` | GENERATED |
| `ALO_LABS_GIT_INTEGRITY_REPORT.md` | ADDED |
| `ALO_LABS_HARDENING_CHANGE_PLAN.md` | ADDED |
| `ALO_LABS_MODEL_ROUTER_TEST.md` | ADDED |
| `ALO_LABS_MYSQL_RESTORE_TEST.md` | ADDED |
| `ALO_LABS_PRODUCTION_EVIDENCE_MATRIX.md` | ADDED |
| `ALO_LABS_QUEUE_RECOVERY_TEST.md` | ADDED |
| `ALO_LABS_ROLLBACK_TEST.md` | ADDED |
| `ALO_LABS_STORAGE_CHANGE_PLAN.md` | ADDED |
| `ALO_LABS_UNVERIFIED_CAPABILITIES.md` | ADDED |
| `ALO_LABS_VERIFIED_BASELINE.md` | ADDED |
| `ALO_LABS_VERIFIED_BASELINE_DATABASE.md` | ADDED |
| `ALO_LABS_VERIFIED_BASELINE_ENV.md` | ADDED |
| `ALO_LABS_VERIFIED_BASELINE_FILES.txt` | ADDED |
| `ALO_LABS_VERIFIED_BASELINE_HASHES.txt` | ADDED |
| `ALO_LABS_VERIFIED_BASELINE_ROUTES.md` | ADDED |
| `__tests__/integration/backup-restore.test.ts` | ADDED |
| `__tests__/integration/sqlite-foreign-keys.test.ts` | ADDED |
| `scripts/verify-file-acl.mjs` | ADDED |

No original path was silently deleted. Repo source membership/hash verification is not proof of production data preservation or a clean deployment. Changes and residual gates are recorded in [hardening plan](ALO_LABS_HARDENING_CHANGE_PLAN.md) and [production evidence matrix](ALO_LABS_PRODUCTION_EVIDENCE_MATRIX.md).
