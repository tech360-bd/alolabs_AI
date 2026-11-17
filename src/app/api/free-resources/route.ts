import { withCompany } from '@/lib/voice/api-helpers';
import {
  FREE_RESOURCES,
  freeStackCoverage,
  immediatelyUsableResources,
  trulyFreeResources,
} from '@/lib/free-resources';

export const dynamic = 'force-dynamic';

/**
 * Free-tier resource catalogue (GET /api/free-resources).
 *
 * Returns the curated subset of free-for.dev that maps onto capabilities this
 * product actually implements, plus an honest coverage roll-up.
 *
 * `?category=`   filter to one capability group
 * `?usable=1`    only resources that can be enabled today with env vars
 *
 * Nothing here enables a provider. A resource is a candidate; the operator
 * connects it through the existing AI provider admin or env configuration.
 */
export async function GET(request: Request) {
  return withCompany(async () => {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const usableOnly = searchParams.get('usable') === '1';

    const base = usableOnly ? immediatelyUsableResources() : [...FREE_RESOURCES];
    const data = category ? base.filter((r) => r.category === category) : base;

    return {
      data,
      total: data.length,
      categories: [...new Set(FREE_RESOURCES.map((r) => r.category))],
      coverage: freeStackCoverage(),
      selfHostedUnlimited: trulyFreeResources().map((r) => r.id),
      notice:
        'Free allowances are quoted from vendor pages and must be re-verified before production use. No resource is enabled automatically.',
    };
  });
}
