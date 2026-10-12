import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function GET() {
  try {
    await requireAuth()

    // Query real webhook configs as integration records
    const webhooks = await db.webhookConfig.findMany({
      include: {
        company: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Query real API keys that represent active integrations
    const apiKeys = await db.companyApiKey.findMany({
      include: {
        company: { select: { name: true } },
      },
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    // Build integration list from real data
    const integrations = [
      ...webhooks.map(w => ({
        id: w.id,
        name: `Webhook: ${w.url || w.name}`,
        category: 'Webhook',
        status: w.isActive ? 'active' : 'disabled',
        protocol: w.events ? 'REST + Events' : 'REST',
        purpose: `Webhook endpoint subscribed to ${w.events || 'configured events'}`,
        dataFlow: 'inbound',
        securityLevel: 'tls',
        company: w.company?.name,
      })),
      ...apiKeys.map(k => ({
        id: k.id,
        name: `API Key: ${k.name} (${k.company?.name || 'System'})`,
        category: 'API Access',
        status: 'active',
        protocol: 'REST',
        purpose: `API integration for ${k.company?.name || 'internal service'}`,
        dataFlow: 'bidirectional',
        securityLevel: k.scopes?.includes('admin') ? 'oauth' : 'tls',
        company: k.company?.name,
      })),
    ]

    // Also count real system connections from agent runs
    const agentRunModels = await db.agentRun.groupBy({
      by: ['model'],
      _count: { id: true },
      where: { model: { not: null } },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    const modelIntegrations = agentRunModels.map(m => ({
      id: `model-${m.model}`,
      name: `AI Model: ${m.model}`,
      category: 'AI Provider',
      status: 'active',
      protocol: 'REST + Streaming',
      purpose: `AI inference (${m._count.id} calls)`,
      dataFlow: 'outbound',
      securityLevel: 'encrypted',
      usageCount: m._count.id,
    }))

    const allIntegrations = [...integrations, ...modelIntegrations]
    const total = allIntegrations.length

    const byCategory: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    for (const int of allIntegrations) {
      byCategory[int.category] = (byCategory[int.category] || 0) + 1
      byStatus[int.status] = (byStatus[int.status] || 0) + 1
    }

    return NextResponse.json({ integrations: allIntegrations, total, byCategory, byStatus })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise integrations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
