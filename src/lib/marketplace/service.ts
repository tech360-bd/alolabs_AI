import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export async function installTemplate(templateId: string, data: { companyId: string; userId?: string; config?: Record<string, unknown> }) {
  const template = await db.marketplaceTemplate.findUnique({ where: { id: templateId } })
  if (!template) throw new Error('Template not found')

  // Create version record
  await db.templateVersion.create({
    data: { templateId, version: template.version, configJson: template.configJson, changeLog: 'Initial install', isCurrent: true },
  })

  // Create install record
  const install = await db.templateInstall.create({
    data: { templateId, companyId: data.companyId, userId: data.userId, version: template.version, status: 'installed', configJson: JSON.stringify(data.config || {}) },
  })

  await db.marketplaceTemplate.update({ where: { id: templateId }, data: { installCount: { increment: 1 } } })
  return { success: true, installId: install.id }
}

export async function enableTemplate(installId: string) {
  return db.templateInstall.update({ where: { id: installId }, data: { status: 'enabled', enabledAt: new Date() } })
}

export async function disableTemplate(installId: string) {
  return db.templateInstall.update({ where: { id: installId }, data: { status: 'disabled', disabledAt: new Date() } })
}

export async function upgradeTemplate(installId: string, newVersion: string) {
  const install = await db.templateInstall.findUnique({ where: { id: installId } })
  if (!install) throw new Error('Install not found')
  const template = await db.marketplaceTemplate.findUnique({ where: { id: install.templateId } })
  if (!template) throw new Error('Template not found')

  await db.templateVersion.updateMany({ where: { templateId: install.templateId }, data: { isCurrent: false } })
  await db.templateVersion.create({ data: { templateId: install.templateId, version: newVersion, configJson: template.configJson, changeLog: `Upgrade from ${install.version}`, isCurrent: true } })
  return db.templateInstall.update({ where: { id: installId }, data: { version: newVersion, status: 'upgraded' } })
}

export async function rollbackTemplate(installId: string, targetVersion: string) {
  const install = await db.templateInstall.findUnique({ where: { id: installId } })
  if (!install) throw new Error('Install not found')

  await db.templateVersion.updateMany({ where: { templateId: install.templateId }, data: { isCurrent: false } })
  await db.templateVersion.updateMany({ where: { templateId: install.templateId, version: targetVersion }, data: { isCurrent: true } })
  return db.templateInstall.update({ where: { id: installId }, data: { version: targetVersion, status: 'rolled_back' } })
}

export async function getVersionHistory(templateId: string) {
  return db.templateVersion.findMany({ where: { templateId }, orderBy: { createdAt: 'desc' } })
}

export async function getTemplates(filters?: { type?: string; category?: string; active?: boolean; limit?: number }) {
  const where: Prisma.MarketplaceTemplateWhereInput = {}
  if (filters?.type) where.type = filters.type
  if (filters?.category) where.category = filters.category
  if (filters?.active !== undefined) where.isActive = filters.active
  return db.marketplaceTemplate.findMany({ where, orderBy: { installCount: 'desc' }, take: filters?.limit || 100 })
}

export async function getInstalls(filters?: { companyId?: string; status?: string; templateId?: string }) {
  const where: Prisma.TemplateInstallWhereInput = {}
  if (filters?.companyId) where.companyId = filters.companyId
  if (filters?.status) where.status = filters.status
  if (filters?.templateId) where.templateId = filters.templateId
  return db.templateInstall.findMany({ where, orderBy: { installedAt: 'desc' }, include: { template: true }, take: 100 })
}
