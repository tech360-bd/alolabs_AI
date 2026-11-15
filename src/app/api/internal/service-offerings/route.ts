import { db } from '@/lib/db';
import { CLIENT_SERVICE_ROLES, InternalError, PLATFORM_ADMIN_ROLES, internalRoute, readJsonBody } from '@/lib/internal/auth';
import { ensureServiceCatalogue } from '@/lib/client-services/operations';
import { findInternalDetail } from '@/lib/client-services/client-safe';

/** GET /api/internal/service-offerings — the catalogue, including internal fulfilment hints. */
export const GET = internalRoute(CLIENT_SERVICE_ROLES, async () => {
  await ensureServiceCatalogue();
  return { offerings: await db.serviceOffering.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }) };
});

const TEXT = ['name', 'category', 'summary', 'description', 'scope', 'deliveryTimeframe', 'terms'] as const;

/**
 * PATCH /api/internal/service-offerings — edit a catalogue entry. Body: { slug, ...fields }.
 * Client-facing copy is checked so the catalogue can never advertise internal detail.
 */
export const PATCH = internalRoute(PLATFORM_ADMIN_ROLES, async (ctx) => {
  const body = await readJsonBody(ctx.request);
  if (typeof body.slug !== 'string') throw new InternalError(400, 'slug is required.');
  const data: Record<string, unknown> = {};
  for (const field of TEXT) if (typeof body[field] === 'string') data[field] = (body[field] as string).trim().slice(0, 4000);
  for (const field of ['benefits', 'deliverables'] as const) {
    if (Array.isArray(body[field])) data[field] = JSON.stringify((body[field] as unknown[]).filter((v) => typeof v === 'string').slice(0, 20));
  }
  const findings = findInternalDetail(Object.values(data).join('\n'));
  if (findings.length) throw new InternalError(422, `Catalogue copy must not refer to internal systems (${findings.map((f) => `${f.label}: "${f.excerpt}"`).join('; ')}).`);

  if (body.pricingModel !== undefined) {
    if (!['fixed', 'starting_at', 'quote', 'subscription'].includes(String(body.pricingModel))) throw new InternalError(400, 'Invalid pricingModel.');
    data.pricingModel = body.pricingModel;
  }
  if (body.priceAmount !== undefined) {
    const amount = body.priceAmount === null ? null : Number(body.priceAmount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new InternalError(400, 'Invalid priceAmount.');
    data.priceAmount = amount;
  }
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  if (typeof body.internalFulfilment === 'object' && body.internalFulfilment) data.internalFulfilment = JSON.stringify(body.internalFulfilment);
  if (!Object.keys(data).length) throw new InternalError(400, 'Nothing to update.');

  const existing = await db.serviceOffering.findUnique({ where: { slug: body.slug }, select: { id: true } });
  if (!existing) throw new InternalError(404, 'Service not found.');
  return { offering: await db.serviceOffering.update({ where: { slug: body.slug }, data }) };
});
