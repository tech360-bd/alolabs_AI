import { clientRoute } from '@/lib/portal/auth';
import { accountDto } from '@/lib/portal/dto';

/** GET /api/portal/account — the signed-in client's own account details. */
export const GET = clientRoute(async (ctx) => ({ account: accountDto(ctx) }));
