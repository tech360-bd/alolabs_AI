import { db } from '@/lib/db';

export function filterByField(
  items: Record<string, unknown>[],
  field: string,
  value: string | null,
): Record<string, unknown>[] {
  if (!value || !field) return items;
  return items.filter((item) => {
    const v = item[field];
    if (Array.isArray(v)) return v.includes(value);
    if (typeof v === 'string') return v === value;
    return false;
  });
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  return {
    data: items.slice(offset, offset + limit),
    pagination: { page, limit, total, pages },
  };
}

export function filterBySearch(
  items: Record<string, unknown>[],
  search: string | null,
  fields: string[],
): Record<string, unknown>[] {
  if (!search) return items;
  const q = search.toLowerCase();
  return items.filter((item) =>
    fields.some((f) => {
      const v = item[f];
      return typeof v === 'string' && v.toLowerCase().includes(q);
    }),
  );
}

export function filterByStatus(
  items: Record<string, unknown>[],
  status?: string | null,
): Record<string, unknown>[] {
  if (!status) return items;
  return items.filter((item) => item.status === status);
}

export async function loadRecords(prefix: string) {
  const records = await db.settings.findMany({
    where: { key: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
  });
  const results: Record<string, unknown>[] = [];
  for (const rec of records) {
    try {
      const parsed = JSON.parse(rec.value);
      results.push({ ...parsed, dbId: rec.id });
    } catch {
      // skip malformed records
    }
  }
  return results;
}
