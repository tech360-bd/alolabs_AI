import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { tenantTarget } from '@/lib/api/secure-route'
import { parseBody } from '@/lib/validators'

const tenantConfigUpdateSchema = z.object({
  companyId: z.string().min(1),
  logoUrl: z.string().nullable().optional(),
  primaryColor: z.string().optional(),
  customDomain: z.string().nullable().optional(),
  emailFrom: z.string().nullable().optional(),
  supportEmail: z.string().nullable().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  notificationsEnabled: z.boolean().optional(),
  webhookTimeoutMs: z.number().int().optional(),
  maxConcurrentJobs: z.number().int().optional(),
  config: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
})

// GET: Get tenant config for a company
export async function GET(request: NextRequest) {
  try {
    const user = await requireRole('super_admin')
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json({ error: 'companyId query parameter is required' }, { status: 400 })
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const company = await db.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    let config = await db.tenantConfig.findUnique({ where: { companyId } })

    if (!config) {
      config = await db.tenantConfig.create({
        data: {
          companyId,
          primaryColor: '#003ABC',
          locale: 'en',
          timezone: 'Asia/Dhaka',
          notificationsEnabled: true,
          webhookTimeoutMs: 30000,
          maxConcurrentJobs: 5,
          config: '{}',
        },
      })
    }

    return NextResponse.json({ config })
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('Error fetching tenant config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create or update tenant config (upsert)
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('super_admin')
    const body = await request.json()
    const { companyId, logoUrl, primaryColor, customDomain, emailFrom, supportEmail, locale, timezone, notificationsEnabled, webhookTimeoutMs, maxConcurrentJobs, config } = body

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const company = await db.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (logoUrl !== undefined) data.logoUrl = logoUrl
    if (primaryColor !== undefined) data.primaryColor = primaryColor
    if (customDomain !== undefined) data.customDomain = customDomain
    if (emailFrom !== undefined) data.emailFrom = emailFrom
    if (supportEmail !== undefined) data.supportEmail = supportEmail
    if (locale !== undefined) data.locale = locale
    if (timezone !== undefined) data.timezone = timezone
    if (notificationsEnabled !== undefined) data.notificationsEnabled = notificationsEnabled
    if (webhookTimeoutMs !== undefined) data.webhookTimeoutMs = webhookTimeoutMs
    if (maxConcurrentJobs !== undefined) data.maxConcurrentJobs = maxConcurrentJobs
    if (config !== undefined) data.config = typeof config === 'string' ? config : JSON.stringify(config)

    const result = await db.tenantConfig.upsert({
      where: { companyId },
      update: data,
      create: {
        companyId,
        primaryColor: (data.primaryColor as string) || '#003ABC',
        locale: (data.locale as string) || 'en',
        timezone: (data.timezone as string) || 'Asia/Dhaka',
        notificationsEnabled: (data.notificationsEnabled as boolean) ?? true,
        webhookTimeoutMs: (data.webhookTimeoutMs as number) ?? 30000,
        maxConcurrentJobs: (data.maxConcurrentJobs as number) ?? 5,
        config: (data.config as string) || '{}',
        ...(data.logoUrl ? { logoUrl: data.logoUrl as string } : {}),
        ...(data.customDomain ? { customDomain: data.customDomain as string } : {}),
        ...(data.emailFrom ? { emailFrom: data.emailFrom as string } : {}),
        ...(data.supportEmail ? { supportEmail: data.supportEmail as string } : {}),
      },
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'create',
        resource: 'tenant-config',
        details: JSON.stringify({ companyId, configId: result.id }),
      },
    })

    return NextResponse.json({ config: result })
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('Error upserting tenant config:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT: Update tenant config (requires companyId)
export async function PUT(req: NextRequest) {
  try {
    const user = await requireRole('super_admin')
    const body = await req.json()
    const parsed = parseBody(tenantConfigUpdateSchema, body)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })

    const { companyId, config, ...rest } = parsed.data
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const existing = await db.tenantConfig.findUnique({ where: { companyId } })
    if (!existing) {
      return NextResponse.json({ error: 'Tenant config not found for this company' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (rest.logoUrl !== undefined) data.logoUrl = rest.logoUrl
    if (rest.primaryColor !== undefined) data.primaryColor = rest.primaryColor
    if (rest.customDomain !== undefined) data.customDomain = rest.customDomain
    if (rest.emailFrom !== undefined) data.emailFrom = rest.emailFrom
    if (rest.supportEmail !== undefined) data.supportEmail = rest.supportEmail
    if (rest.locale !== undefined) data.locale = rest.locale
    if (rest.timezone !== undefined) data.timezone = rest.timezone
    if (rest.notificationsEnabled !== undefined) data.notificationsEnabled = rest.notificationsEnabled
    if (rest.webhookTimeoutMs !== undefined) data.webhookTimeoutMs = rest.webhookTimeoutMs
    if (rest.maxConcurrentJobs !== undefined) data.maxConcurrentJobs = rest.maxConcurrentJobs
    if (config !== undefined) data.config = typeof config === 'string' ? config : JSON.stringify(config)

    const result = await db.tenantConfig.update({
      where: { companyId },
      data,
    })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'update',
        resource: 'tenant-config',
        details: JSON.stringify({ companyId, changes: Object.keys(data) }),
      },
    })

    return NextResponse.json({ config: result })
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('PUT tenant config error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete tenant config for a company
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireRole('super_admin')
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    const existing = await db.tenantConfig.findUnique({ where: { companyId } })
    if (!existing) {
      return NextResponse.json({ error: 'Tenant config not found for this company' }, { status: 404 })
    }

    await db.tenantConfig.delete({ where: { companyId } })

    await db.auditLog.create({
      data: {
        userId: user.userId,
        action: 'delete',
        resource: 'tenant-config',
        details: JSON.stringify({ companyId, configId: existing.id }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('DELETE tenant config error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}