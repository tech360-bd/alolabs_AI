import { db } from '@/lib/db';
import { clientRoute } from '@/lib/portal/auth';
import { serviceDto } from '@/lib/portal/dto';
import { ensureServiceCatalogue } from '@/lib/client-services/operations';

/** GET /api/portal/services — the services ALO Labs offers. */
export const GET = clientRoute(async () => {
  await ensureServiceCatalogue();
  const offerings = await db.serviceOffering.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return { services: offerings.map(serviceDto) };
});
