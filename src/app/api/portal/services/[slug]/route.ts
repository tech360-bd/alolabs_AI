import { db } from '@/lib/db';
import { clientRoute, notFound } from '@/lib/portal/auth';
import { serviceDto } from '@/lib/portal/dto';
import { ensureServiceCatalogue } from '@/lib/client-services/operations';

/** GET /api/portal/services/:slug — one service in full. */
export const GET = clientRoute<{ slug: string }>(async (_ctx, { slug }) => {
  await ensureServiceCatalogue();
  const offering = await db.serviceOffering.findFirst({ where: { slug, isActive: true } });
  if (!offering) throw notFound();
  return { service: serviceDto(offering) };
});
