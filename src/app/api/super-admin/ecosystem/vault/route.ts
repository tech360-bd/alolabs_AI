import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';
import {
  SUPPLIED_SOURCES,
  VETTED_ECOSYSTEM_ASSETS,
  getPaginatedDiscoveryStats,
  pinNewIntegrationVersion,
  rollbackIntegrationVersion,
  syncAssetVaultToDb,
} from '@/lib/ecosystem/asset-vault';
import { hardwareSnapshot } from '@/lib/platform/hardware';
import { writeAuditEvent } from '@/lib/audit-events';
import { getOneRuntimeAdapterInventory } from '@/lib/ecosystem/adapters';

const VaultActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('sync_vault'),
  }),
  z.object({
    action: z.literal('pin_version'),
    integrationId: z.string().min(1),
    version: z.string().min(1),
    pinnedRef: z.string().min(1),
    changelog: z.string().default('Pinned via Super Admin Asset Vault'),
  }),
  z.object({
    action: z.literal('rollback_version'),
    integrationId: z.string().min(1),
    targetVersionId: z.string().min(1),
  }),
]);

export async function GET() {
  try {
    await requireRole('super_admin');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }

  const [sources, assets, integrations, licenses, securityReviews, versions, hardware, reconciledAdapters] = await Promise.all([
    db.externalSource.findMany({ orderBy: { slug: 'asc' } }),
    db.externalAsset.findMany({ orderBy: [{ stars: 'desc' }, { fullName: 'asc' }], take: 100 }),
    db.integration.findMany({ orderBy: { slug: 'asc' }, include: { versions: { orderBy: { createdAt: 'desc' } } } }),
    db.licenseRecord.findMany({ orderBy: { reviewedAt: 'desc' } }),
    db.securityReview.findMany({ orderBy: { reviewedAt: 'desc' }, take: 50 }),
    db.integrationVersion.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
    hardwareSnapshot(),
    getOneRuntimeAdapterInventory(),
  ]);

  return NextResponse.json({
    success: true,
    summary: getPaginatedDiscoveryStats(),
    suppliedSourcesCatalog: SUPPLIED_SOURCES,
    vettedAssetsCatalog: VETTED_ECOSYSTEM_ASSETS,
    dbCounts: {
      sources: sources.length,
      assets: assets.length,
      integrations: integrations.length,
      licenses: licenses.length,
      securityReviews: securityReviews.length,
      versions: versions.length,
      oneRuntimeAdapters: reconciledAdapters.length,
    },
    reconciledAdapters,
    sources,
    assets,
    integrations,
    licenses,
    securityReviews,
    versions,
    hardware,
  });
}

export async function POST(request: NextRequest) {
  let actor: Awaited<ReturnType<typeof requireRole>>;
  try {
    actor = await requireRole('super_admin');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = VaultActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  if (data.action === 'sync_vault') {
    const counts = await syncAssetVaultToDb(actor.userId);
    await writeAuditEvent({
      companyId: actor.companyId ?? 'system',
      actorUserId: actor.userId,
      action: 'ecosystem.vault_synced',
      resource: 'ExternalSource',
      resourceId: 'asset-vault',
      details: counts as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ success: true, counts });
  }

  if (data.action === 'pin_version') {
    try {
      const updated = await pinNewIntegrationVersion({
        integrationId: data.integrationId,
        version: data.version,
        pinnedRef: data.pinnedRef,
        changelog: data.changelog,
        actorUserId: actor.userId,
      });
      return NextResponse.json({ success: true, integration: updated });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Pin failed' }, { status: 404 });
    }
  }

  try {
    const rolledBack = await rollbackIntegrationVersion({
      integrationId: data.integrationId,
      targetVersionId: data.targetVersionId,
      actorUserId: actor.userId,
    });
    return NextResponse.json({ success: true, integration: rolledBack });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Rollback failed' }, { status: 404 });
  }
}
