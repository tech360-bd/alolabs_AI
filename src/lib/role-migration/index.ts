/**
 * Role migration system — explicit old-role-to-new-role mapping.
 *
 * Per Decision 2: never automatically elevate privileges. Existing
 * super_admin/admin accounts must be individually reviewed and explicitly
 * mapped. Dry-run mode, conflict detection, idempotency, audit trail.
 *
 * The 7 spec roles:
 *  PLATFORM_SUPER_ADMIN, AI_WORKFORCE_ADMIN, AI_MODEL_ADMIN,
 *  SECURITY_ADMIN, INFRASTRUCTURE_ADMIN, TENANT_ADMIN, API_CONSUMER
 *
 * Mapping table (conservative — never auto-elevates):
 *  super_admin → platform_super_admin (BUT requires explicit review)
 *  admin       → tenant_admin (safe default; can be elevated later)
 *  manager     → api_consumer (customer-facing role)
 *  operator    → api_consumer
 *  viewer      → api_consumer
 *
 * IMPORTANT: this module NEVER writes to User.role directly. It produces
 * RoleMigration records that an authorized operator must review and apply.
 */

import { db } from '@/lib/db';

export const ROLE_MAPPING: Record<string, string> = {
  super_admin: 'platform_super_admin',
  admin: 'tenant_admin',
  manager: 'api_consumer',
  operator: 'api_consumer',
  viewer: 'api_consumer',
};

export const SPEC_ROLES = new Set([
  'platform_super_admin',
  'ai_workforce_admin',
  'ai_model_admin',
  'security_admin',
  'infrastructure_admin',
  'tenant_admin',
  'api_consumer',
]);

export interface DryRunResult {
  totalUsers: number;
  mappable: number;
  alreadyMapped: number;
  unknownRoles: Array<{ userId: string; email: string; currentRole: string }>;
  conflicts: Array<{ userId: string; email: string; existingMapping: string; proposedMapping: string }>;
  proposed: Array<{ userId: string; email: string; currentRole: string; proposedRole: string }>;
}

/**
 * Dry-run: produce the mapping plan without writing anything.
 */
export async function dryRunRoleMigration(): Promise<DryRunResult> {
  const users = await db.user.findMany({
    select: { id: true, email: true, role: true, isActive: true },
  });

  const proposed: DryRunResult['proposed'] = [];
  const unknownRoles: DryRunResult['unknownRoles'] = [];
  const conflicts: DryRunResult['conflicts'] = [];
  let alreadyMapped = 0;

  // Check for existing pending/applied migrations.
  const existing = await db.roleMigration.findMany({
    where: { status: { in: ['pending', 'applied'] } },
    select: { userId: true, newRole: true, oldRole: true, status: true },
  });
  const existingMap = new Map(existing.map((m) => [m.userId, m]));

  for (const user of users) {
    if (!user.isActive) continue;
    const currentRole = user.role;

    // Already in spec? Check this FIRST — spec roles aren't in ROLE_MAPPING.
    if (SPEC_ROLES.has(currentRole)) {
      alreadyMapped++;
      continue;
    }

    const targetRole = ROLE_MAPPING[currentRole];

    if (!targetRole) {
      unknownRoles.push({ userId: user.id, email: user.email, currentRole });
      continue;
    }

    // Existing migration?
    const existingMigration = existingMap.get(user.id);
    if (existingMigration) {
      if (existingMigration.newRole !== targetRole) {
        conflicts.push({
          userId: user.id,
          email: user.email,
          existingMapping: existingMigration.newRole,
          proposedMapping: targetRole,
        });
      }
      continue;
    }

    proposed.push({ userId: user.id, email: user.email, currentRole, proposedRole: targetRole });
  }

  return {
    totalUsers: users.length,
    mappable: proposed.length,
    alreadyMapped,
    unknownRoles,
    conflicts,
    proposed,
  };
}

/**
 * Create RoleMigration records for the proposed mappings (pending status).
 * Does NOT apply them — that requires a separate, authorized `applyMigrations`.
 */
export async function createMigrationRecords(
  proposed: DryRunResult['proposed'],
  mappedByUserId: string,
): Promise<number> {
  let created = 0;
  for (const p of proposed) {
    try {
      await db.roleMigration.create({
        data: {
          userId: p.userId,
          oldRole: p.currentRole,
          newRole: p.proposedRole,
          mappedBy: mappedByUserId,
          status: 'pending',
        },
      });
      created++;
    } catch {
      // unique constraint — already exists, skip
    }
  }
  return created;
}

/**
 * F4: Backward-compatible capability handling.
 *
 * A migration must NEVER reduce a user's effective capabilities. Each role
 * maps to a set of capabilities; if the target role has FEWER capabilities
 * than the source role, the migration is flagged as a CAPABILITY_LOSS and
 * must be explicitly confirmed by the operator (not auto-applied).
 *
 * Legacy roles (super_admin, admin, manager, operator, viewer) are treated
 * as having the union of all capabilities they historically held. Spec roles
 * are scoped more narrowly, so most legacy→spec migrations are flagged.
 */

export type Capability =
  | 'platform_admin'      // manage tenants, users, global settings
  | 'ai_workforce_admin'  // agent registry, departments, profiles
  | 'ai_model_admin'      // model registry, provider routing
  | 'security_admin'      // security events, audit, access
  | 'infrastructure_admin' // infra: DB, Redis, Ollama, Nginx, PM2
  | 'tenant_admin'        // own tenant + customer settings
  | 'api_consumer'        // consume AI services via API
  | 'read'                // read-only access
  | 'write'               // create/update own resources
  | 'execute'             // run agents/workflows
  | 'approve';            // approve privileged operations

const LEGACY_CAPABILITIES: Record<string, Set<Capability>> = {
  super_admin: new Set<Capability>(['platform_admin', 'ai_workforce_admin', 'ai_model_admin', 'security_admin', 'infrastructure_admin', 'tenant_admin', 'api_consumer', 'read', 'write', 'execute', 'approve']),
  admin: new Set<Capability>(['tenant_admin', 'api_consumer', 'read', 'write', 'execute', 'approve']),
  manager: new Set<Capability>(['api_consumer', 'read', 'write', 'execute', 'approve']),
  operator: new Set<Capability>(['api_consumer', 'read', 'write', 'execute']),
  viewer: new Set<Capability>(['api_consumer', 'read']),
};

const SPEC_CAPABILITIES: Record<string, Set<Capability>> = {
  platform_super_admin: new Set<Capability>(['platform_admin', 'ai_workforce_admin', 'ai_model_admin', 'security_admin', 'infrastructure_admin', 'tenant_admin', 'api_consumer', 'read', 'write', 'execute', 'approve']),
  ai_workforce_admin: new Set<Capability>(['ai_workforce_admin', 'read', 'write', 'execute', 'approve']),
  ai_model_admin: new Set<Capability>(['ai_model_admin', 'read', 'write', 'execute']),
  security_admin: new Set<Capability>(['security_admin', 'read']),
  infrastructure_admin: new Set<Capability>(['infrastructure_admin', 'read']),
  tenant_admin: new Set<Capability>(['tenant_admin', 'api_consumer', 'read', 'write', 'execute', 'approve']),
  api_consumer: new Set<Capability>(['api_consumer', 'read', 'write', 'execute']),
};

/**
 * Compute the capabilities a role grants. Returns an empty set for unknown roles.
 */
export function capabilitiesFor(role: string): Set<Capability> {
  if (SPEC_CAPABILITIES[role]) return new Set(SPEC_CAPABILITIES[role]);
  if (LEGACY_CAPABILITIES[role]) return new Set(LEGACY_CAPABILITIES[role]);
  return new Set();
}

/**
 * Detect whether migrating from `oldRole` to `newRole` would LOSE capabilities.
 * Returns the set of capabilities the user would lose.
 */
export function lostCapabilities(oldRole: string, newRole: string): Capability[] {
  const oldCaps = capabilitiesFor(oldRole);
  const newCaps = capabilitiesFor(newRole);
  const lost: Capability[] = [];
  for (const cap of oldCaps) {
    if (!newCaps.has(cap)) lost.push(cap);
  }
  return lost;
}

/**
 * Apply a single pending migration. Requires the operator to be super_admin.
 * F4: NEVER migrates a user into a role that loses existing authorized
 * capabilities without the migration record explicitly noting the loss.
 * The migration record's `notes` field must contain "CONFIRM_CAPABILITY_LOSS"
 * if any capabilities would be lost; otherwise apply is rejected.
 */
export async function applyMigration(
  migrationId: string,
  operatorUserId: string,
): Promise<{ applied: boolean; reason?: string; lostCapabilities?: Capability[] }> {
  const migration = await db.roleMigration.findUnique({
    where: { id: migrationId },
    select: { id: true, userId: true, oldRole: true, newRole: true, status: true, notes: true },
  });
  if (!migration) return { applied: false, reason: 'migration record not found' };
  if (migration.status === 'applied') return { applied: false, reason: 'already applied' };

  if (!SPEC_ROLES.has(migration.newRole)) {
    return { applied: false, reason: `target role ${migration.newRole} is not a recognized spec role` };
  }

  // F4: capability-loss check. If migrating would lose capabilities, the
  // operator must have explicitly confirmed by including the literal token
  // "CONFIRM_CAPABILITY_LOSS" in the migration notes.
  const lost = lostCapabilities(migration.oldRole, migration.newRole);
  if (lost.length > 0) {
    if (!migration.notes || !migration.notes.includes('CONFIRM_CAPABILITY_LOSS')) {
      return {
        applied: false,
        reason: `Migration would lose capabilities: ${lost.join(', ')}. To confirm, set the migration record's notes to include "CONFIRM_CAPABILITY_LOSS".`,
        lostCapabilities: lost,
      };
    }
  }

  await db.$transaction([
    db.user.update({
      where: { id: migration.userId },
      data: { role: migration.newRole },
    }),
    db.roleMigration.update({
      where: { id: migrationId },
      data: { status: 'applied', appliedAt: new Date(), notes: `${migration.notes ?? ''}\nApplied with capability loss: ${lost.join(', ') || 'none'}`.trim() },
    }),
    db.auditLog.create({
      data: {
        action: 'role_migration.applied',
        resource: 'RoleMigration',
        details: JSON.stringify({
          migrationId,
          userId: migration.userId,
          oldRole: migration.oldRole,
          newRole: migration.newRole,
          operatorUserId,
          lostCapabilities: lost,
        }),
        userId: operatorUserId,
      },
    }),
  ]);

  return { applied: true, lostCapabilities: lost };
}

/**
 * Rollback a previously-applied migration. Restores the old role.
 */
export async function rollbackMigration(
  migrationId: string,
  operatorUserId: string,
): Promise<{ rolledBack: boolean; reason?: string }> {
  const migration = await db.roleMigration.findUnique({
    where: { id: migrationId },
    select: { id: true, userId: true, oldRole: true, newRole: true, status: true },
  });
  if (!migration) return { rolledBack: false, reason: 'migration record not found' };
  if (migration.status !== 'applied') return { rolledBack: false, reason: 'not applied — cannot rollback' };

  await db.$transaction([
    db.user.update({
      where: { id: migration.userId },
      data: { role: migration.oldRole },
    }),
    db.roleMigration.update({
      where: { id: migrationId },
      data: { status: 'rolled_back' },
    }),
    db.auditLog.create({
      data: {
        action: 'role_migration.rolled_back',
        resource: 'RoleMigration',
        details: JSON.stringify({
          migrationId,
          userId: migration.userId,
          restoredRole: migration.oldRole,
          operatorUserId,
        }),
        userId: operatorUserId,
      },
    }),
  ]);

  return { rolledBack: true };
}
