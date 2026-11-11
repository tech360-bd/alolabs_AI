import { z } from 'zod';
import { db } from '@/lib/db';
import { secureCrud } from '@/lib/api/secure-crud';

/**
 * crm.lead-score — authenticated, authorised, tenant-scoped, audited.
 *
 * Replaces a hand-written POST-only route that verified a session token
 * inline but applied no role check and no tenant check on the referenced
 * contact: any authenticated user could score and touch every company's
 * contacts. The scoring rule engine is unchanged; the referenced contact is
 * now tenant-verified through secureCrud's ownership check, and the parent
 * contact's score is updated in afterCreate.
 */

const factorsSchema = z
  .object({
    websiteVisits: z.coerce.number().min(0).max(1e6).optional(),
    emailOpens: z.coerce.number().min(0).max(1e6).optional(),
    dealValue: z.coerce.number().min(0).max(1e12).optional(),
    lastContactDaysAgo: z.coerce.number().min(0).max(36500).optional(),
  })
  .optional();

/** Scoring rule engine (0–100), identical to the original implementation. */
function scoreFactors(factors: {
  websiteVisits: number;
  emailOpens: number;
  dealValue: number;
  lastContactDaysAgo: number;
}): number {
  let score = 0;
  if (factors.websiteVisits >= 20) score += 25;
  else if (factors.websiteVisits >= 10) score += 18;
  else if (factors.websiteVisits >= 5) score += 12;
  else if (factors.websiteVisits >= 1) score += 5;

  if (factors.emailOpens >= 10) score += 25;
  else if (factors.emailOpens >= 5) score += 18;
  else if (factors.emailOpens >= 2) score += 10;
  else if (factors.emailOpens >= 1) score += 4;

  if (factors.dealValue >= 50000) score += 25;
  else if (factors.dealValue >= 10000) score += 18;
  else if (factors.dealValue >= 5000) score += 12;
  else if (factors.dealValue >= 1000) score += 6;
  else if (factors.dealValue > 0) score += 3;

  if (factors.lastContactDaysAgo <= 7) score += 25;
  else if (factors.lastContactDaysAgo <= 14) score += 20;
  else if (factors.lastContactDaysAgo <= 30) score += 15;
  else if (factors.lastContactDaysAgo <= 60) score += 8;
  else if (factors.lastContactDaysAgo <= 90) score += 3;

  return Math.min(100, Math.max(0, score));
}

export const createSchema = z
  .object({
    contactId: z.string().min(1).max(128),
    factors: factorsSchema,
  })
  // Compute the score server-side so the request body never decides it.
  .transform(({ contactId, factors: input }) => {
    const factors = {
      websiteVisits: input?.websiteVisits ?? 0,
      emailOpens: input?.emailOpens ?? 0,
      dealValue: input?.dealValue ?? 0,
      lastContactDaysAgo: input?.lastContactDaysAgo ?? 90,
    };
    return {
      contactId,
      score: scoreFactors(factors),
      maxScore: 100,
      factors: JSON.stringify(factors),
      calculatedBy: 'rule-engine',
    };
  });

export const { GET, POST, PUT, DELETE } = secureCrud({
  resource: 'crm.lead-score',
  model: 'crmLeadScore',
  label: 'CrmLeadScore',
  tenantField: null,
  ownership: { delegate: 'crmContact', fk: 'contactId', relation: 'contact' },
  createSchema,
  searchFields: [],
  afterCreate: async (record) => {
    // Keep the parent contact's score in sync (original behaviour).
    await db.crmContact.update({
      where: { id: record.contactId as string },
      data: { score: record.score as number },
    });
  },
  writeRoles: ['super_admin', 'admin', 'manager', 'operator'],
});
