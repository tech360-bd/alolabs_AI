-- JWT-backed, revocable user sessions (2026-11-16).
--
-- The API returns a signed JWT, but verification still requires a matching
-- active row here. Only the SHA-256 digest of the complete token is persisted;
-- revoking this row invalidates the token before its exp claim.
--
-- The SQLite default schema is kept in prisma/schema.prisma and is applied by
-- the repository's `db:push:sqlite` workflow. This additive MySQL DDL is
-- idempotent and preserves existing opaque sessions during rollout.

CREATE TABLE IF NOT EXISTS `Session` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(64) NOT NULL,
  `audience` VARCHAR(32) NOT NULL DEFAULT 'internal',
  `method` VARCHAR(64) NOT NULL DEFAULT 'password',
  `deviceInfo` VARCHAR(191) NULL,
  `ipAddress` VARCHAR(191) NULL,
  `userAgent` VARCHAR(191) NULL,
  `isRefreshToken` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Session_tokenHash_key` (`tokenHash`),
  KEY `Session_userId_expiresAt_idx` (`userId`, `expiresAt`),
  KEY `Session_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `Session_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
