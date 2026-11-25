/**
 * Site content blocks — typed read access to the DB-backed website content.
 *
 * Public site pages call `readSiteContentBlock` with a code default: a missing
 * row, a malformed payload or a DB failure always falls back to the shipped
 * default, so the site can never be broken by console edits. Writes happen
 * exclusively through the audited supervisor tool `set_site_content`
 * (see src/lib/command-agent/supervisor-tools.ts).
 */

import { db } from '@/lib/db';

export interface SiteContentResult<T> {
  value: T;
  /** Where the value came from: database override or code default. */
  source: 'database' | 'default';
  version: number | null;
}

export async function readSiteContentBlock<T>(options: {
  page: string;
  blockKey: string;
  fallback: T;
  companyId?: string | null;
}): Promise<SiteContentResult<T>> {
  const { page, blockKey, fallback } = options;
  const companyId = options.companyId ?? null;
  try {
    // `companyId` is nullable, and Prisma's compound-unique lookup does not
    // accept null, so the read is a findFirst with an explicit null match.
    const row = await db.siteContentBlock.findFirst({
      where: { companyId, page, blockKey },
      orderBy: { version: 'desc' },
    });
    if (!row) return { value: fallback, source: 'default', version: null };
    try {
      const parsed = JSON.parse(row.content) as T;
      return { value: parsed, source: 'database', version: row.version };
    } catch {
      // Malformed payload: serve the default, never the raw string.
      return { value: fallback, source: 'default', version: null };
    }
  } catch (error) {
    console.error('[SiteContent] read failed, serving default:', error);
    return { value: fallback, source: 'default', version: null };
  }
}

export async function listSiteContentBlocks(page?: string, companyId?: string | null): Promise<
  Array<{ page: string; blockKey: string; content: string; version: number; updatedAt: Date }>
> {
  return db.siteContentBlock.findMany({
    where: {
      companyId: companyId ?? null,
      ...(page ? { page } : {}),
    },
    orderBy: [{ page: 'asc' }, { blockKey: 'asc' }],
    select: { page: true, blockKey: true, content: true, version: true, updatedAt: true },
  });
}
