import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAuth } from '@/lib/api-auth';
import { listConversations } from '@/lib/whatsapp/inbox';

/**
 * GET /api/whatsapp/inbox — shared team inbox.
 *
 * Returns one row per (phone number, contact) with the last message preview and
 * unread count. Conversations are written by the webhook and by replies sent
 * from /api/whatsapp/inbox/[id].
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth();
    const { searchParams } = new URL(request.url);

    const result = await listConversations({
      companyId: user.companyId,
      page: Math.max(1, parseInt(searchParams.get('page') || '1', 10)),
      limit: Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10))),
      search: searchParams.get('search') || '',
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('WhatsApp inbox list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
