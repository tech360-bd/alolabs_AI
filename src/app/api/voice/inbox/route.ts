import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import {
  recordMessage,
  listThreads,
  threadDetail,
  approveDraft,
  assignThread,
  customerTimeline,
  upsertTemplate,
  renderTemplate,
  isOmniChannel,
  type OmniChannel,
} from '@/lib/voice/omnichannel'

export const dynamic = 'force-dynamic'

/**
 * Shared Inbox / omnichannel API (Module I).
 *
 * GET   — ?threadKey=   full thread (messages + contact + recent calls)
 *           ?timeline=contactId → one customer timeline across channels
 *           ?channel=&status=   thread list
 *           else                tenant thread list
 * POST  — { action }
 *           record     — append a message (inbound/outbound; aiDrafted stays
 *                        queued until approved)
 *           approve    — human approval of an AI draft (may edit the body)
 *           assign     — assign a thread to a tenant member
 *           template   — create/replace an SMS/WhatsApp/email template
 *           render     — render a template with variables (missing vars listed)
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)

    const threadKey = searchParams.get('threadKey')
    if (threadKey) return { data: await threadDetail(auth.companyId, threadKey) }

    const timelineFor = searchParams.get('timeline')
    if (timelineFor) return { data: await customerTimeline(auth.companyId, timelineFor) }

    const channelParam = searchParams.get('channel')
    const channel = channelParam && isOmniChannel(channelParam) ? channelParam : undefined

    const [threads, templates] = await Promise.all([
      listThreads({
        companyId: auth.companyId,
        channel,
        status: searchParams.get('status') ?? undefined,
        assignedUserId: searchParams.get('assignedUserId') ?? undefined,
      }),
      db.messageTemplate.findMany({
        where: { companyId: auth.companyId },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    ])
    return { data: threads, total: threads.length, templates }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const action = optionalString(body, 'action') ?? 'record'

    if (action === 'record') {
      const channel = requireString(body, 'channel')
      if (!isOmniChannel(channel)) throw new Error('Invalid request: channel must be voice, sms, whatsapp, email, webchat or social')
      const direction = optionalString(body, 'direction') === 'outbound' ? 'outbound' : 'inbound'
      const created = await recordMessage({
        companyId: auth.companyId,
        channel: channel as OmniChannel,
        direction,
        contactId: optionalString(body, 'contactId') ?? null,
        fromAddress: requireString(body, 'fromAddress'),
        toAddress: requireString(body, 'toAddress'),
        body: requireString(body, 'body'),
        assignedUserId: optionalString(body, 'assignedUserId') ?? auth.userId,
        aiDrafted: body.aiDrafted === true,
        templateId: optionalString(body, 'templateId') ?? null,
      })
      return {
        data: created,
        notice: body.aiDrafted === true
          ? 'Draft recorded. It stays queued until a human approves it (action "approve").'
          : 'Message recorded on the shared timeline.',
      }
    }

    if (action === 'approve') {
      const approved = await approveDraft({
        companyId: auth.companyId,
        messageId: requireString(body, 'messageId'),
        approverUserId: auth.userId,
        editedBody: optionalString(body, 'editedBody'),
      })
      return { data: approved, notice: 'Approved by a human — ready for the channel adapter to send.' }
    }

    if (action === 'assign') {
      if (typeof body.threadKey !== 'string' || !body.threadKey.trim()) throw new Error('Invalid request: threadKey is required')
      const userId = optionalString(body, 'userId') ?? null
      const result = await assignThread({ companyId: auth.companyId, threadKey: body.threadKey.trim(), userId })
      return { data: result, notice: userId ? 'Thread assigned.' : 'Thread unassigned.' }
    }

    if (action === 'template') {
      const channel = requireString(body, 'channel')
      if (!isOmniChannel(channel)) throw new Error('Invalid request: unknown channel')
      const template = await upsertTemplate({
        companyId: auth.companyId,
        channel: channel as OmniChannel,
        name: requireString(body, 'name'),
        language: optionalString(body, 'language'),
        body: requireString(body, 'body'),
        category: optionalString(body, 'category'),
      })
      return { data: template, notice: `Template saved with ${template.variables.length} variable(s).` }
    }

    if (action === 'render') {
      const templateId = requireString(body, 'templateId')
      const template = await db.messageTemplate.findFirst({ where: { id: templateId, companyId: auth.companyId } })
      if (!template) throw new Error(`template ${templateId} not found for this tenant`)
      const variables = (typeof body.variables === 'object' && body.variables ? body.variables : {}) as Record<string, string>
      const rendered = renderTemplate(template.body, variables)
      return {
        data: { text: rendered.text, missing: rendered.missing, channel: template.channel },
        notice: rendered.missing.length > 0
          ? `Missing variables: ${rendered.missing.join(', ')} — the placeholders were left visible on purpose.`
          : 'Template rendered.',
      }
    }

    throw new Error('Invalid request: action must be record, approve, assign, template or render')
  })
}
