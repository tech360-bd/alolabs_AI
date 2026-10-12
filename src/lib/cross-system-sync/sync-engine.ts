import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export async function syncRecord(data: { sourceSystem: string; targetSystem: string; syncType: string; entityType: string; entityId?: string; payload: Record<string, unknown>; syncedBy?: string; companyId?: string; instanceId?: string }) {
  const start = Date.now()
  const log = await db.crossSystemSyncLog.create({
    data: { ...data, payload: JSON.stringify(data.payload), status: 'syncing', instanceId: data.instanceId },
  })
  try {
    // In production, actual sync logic per system pair
    await db.crossSystemSyncLog.update({ where: { id: log.id }, data: { status: 'completed', durationMs: Date.now() - start, completedAt: new Date() } })
    return { success: true, syncId: log.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.crossSystemSyncLog.update({ where: { id: log.id }, data: { status: 'failed', errorMessage: msg, durationMs: Date.now() - start } })
    return { success: false, syncId: log.id, error: msg }
  }
}

export async function getSyncLogs(filters?: { sourceSystem?: string; targetSystem?: string; status?: string; companyId?: string; limit?: number }) {
  const where: Prisma.CrossSystemSyncLogWhereInput = {}
  if (filters?.sourceSystem) where.sourceSystem = filters.sourceSystem
  if (filters?.targetSystem) where.targetSystem = filters.targetSystem
  if (filters?.status) where.status = filters.status
  if (filters?.companyId) where.companyId = filters.companyId
  return db.crossSystemSyncLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: filters?.limit || 100 })
}

export async function retrySync(syncId: string) {
  const log = await db.crossSystemSyncLog.findUnique({ where: { id: syncId } })
  if (!log) throw new Error('Sync log not found')
 return db.crossSystemSyncLog.update({ where: { id: syncId }, data: { status: 'pending', retryCount: { increment: 1 }, errorMessage: null } })
}

export async function getSyncStats(companyId?: string) {
  const where: any = companyId ? { companyId } : {}
  const [total, completed, failed, pending] = await Promise.all([
    db.crossSystemSyncLog.count({ where }),
    db.crossSystemSyncLog.count({ where: { ...where, status: 'completed' } }),
    db.crossSystemSyncLog.count({ where: { ...where, status: 'failed' } }),
    db.crossSystemSyncLog.count({ where: { ...where, status: 'pending' } }),
  ])
  return { total, completed, failed, pending, successRate: total > 0 ? ((completed / total) * 100).toFixed(1) : '100' }
}
