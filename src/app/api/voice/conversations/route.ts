import { db } from '@/lib/db'
import { withCompany } from '@/lib/voice/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * Shared inbox source (Module I) — tenant-scoped read view over the existing
 * Conversation/ConversationMessage tables used by AgentOS channels. Sending is
 * handled by the channel-specific existing APIs (WhatsApp, SMS, email); this
 * route only aggregates what a contact-center agent needs to see.
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '25') || 25))
    const conversations = await db.conversation.findMany({
      where: { companyId: auth.companyId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
    })
    return {
      data: conversations.map((c) => ({
        id: c.id,
        title: c.title || '(untitled)',
        status: c.status,
        updatedAt: c.updatedAt,
        messageCount: c.messages.length,
        lastMessage: c.messages.at(-1)?.content?.slice(0, 160) ?? null,
      })),
      total: conversations.length,
    }
  })
}
