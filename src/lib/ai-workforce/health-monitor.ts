import { db } from '@/lib/db'
import { getRouter } from '@/lib/ai-router'
import type { Prisma } from '@prisma/client'

export type CheckResult = {
  checkType: string
  status: 'pass' | 'fail' | 'warn'
  responseMs: number
  details: Record<string, unknown>
  errorMessage?: string
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    const values: string[] = []
    for (const item of parsed) {
      if (typeof item === 'string') values.push(item)
    }
    return values
  } catch {
    return []
  }
}

export async function runHealthCheck(instanceId: string, companyId: string) {
  const instance = await db.agentInstance.findFirst({
    where: { id: instanceId, companyId },
    include: { agent: { select: { id: true, status: true } } },
  })
  if (!instance) throw new Error('Instance not found')

  const checks: CheckResult[] = []
  const start = Date.now()
  const configIsPresent = instance.config.trim().length > 0 && instance.config.trim() !== '{}'
  checks.push({
    checkType: 'configuration',
    status: configIsPresent ? 'pass' : 'warn',
    responseMs: 0,
    details: { configured: configIsPresent },
  })

  const tools = parseStringArray(instance.toolsConnected)
  checks.push({
    checkType: 'tool_configuration',
    status: tools.length > 0 ? 'pass' : 'warn',
    responseMs: 0,
    details: { configuredTools: tools.length, connectivityVerified: false },
  })

  const permissions = parseStringArray(instance.permissionsJson)
  checks.push({
    checkType: 'permission_configuration',
    status: permissions.length > 0 ? 'pass' : 'warn',
    responseMs: 0,
    details: { configuredPermissionCount: permissions.length, enforcementVerified: false },
  })

  checks.push({
    checkType: 'agent_status',
    status: instance.agent.status === 'active' ? 'pass' : 'warn',
    responseMs: 0,
    details: { active: instance.agent.status === 'active' },
  })

  const providerStart = Date.now()
  let providerStatus: CheckResult['status'] = 'fail'
  let providerDetails: Record<string, unknown> = {}
  let providerError: string | undefined
  try {
    const providerHealth = await getRouter().getHealthStatus()
    const providerResults = Array.from(providerHealth.values())
    const healthyProviderCount = providerResults.filter((provider) => provider.isHealthy && !provider.circuitOpen).length
    providerStatus = providerResults.length === 0 ? 'warn' : healthyProviderCount > 0 ? 'pass' : 'fail'
    providerDetails = { configuredProviders: providerResults.length, healthyProviders: healthyProviderCount }
  } catch (error) {
    providerError = error instanceof Error ? error.message : 'Provider health check failed'
    providerDetails = { configuredProviders: 0, healthyProviders: 0 }
  }
  checks.push({
    checkType: 'provider_connectivity',
    status: providerStatus,
    responseMs: Date.now() - providerStart,
    details: providerDetails,
    ...(providerError ? { errorMessage: providerError } : {}),
  })

  const dbStart = Date.now()
  const instanceCount = await db.agentInstance.count({ where: { id: instanceId, companyId } })
  checks.push({
    checkType: 'database_connectivity',
    status: instanceCount === 1 ? 'pass' : 'fail',
    responseMs: Date.now() - dbStart,
    details: { instanceFound: instanceCount === 1 },
  })

  const latencyStart = Date.now()
  await db.agentInstance.findUnique({ where: { id: instanceId }, select: { id: true } })
  const latency = Date.now() - latencyStart
  checks.push({
    checkType: 'database_latency',
    status: latency < 500 ? 'pass' : latency < 2000 ? 'warn' : 'fail',
    responseMs: latency,
    details: { latencyMs: latency },
  })

  await Promise.all(checks.map((check) => db.agentHealthCheck.create({
    data: {
      instanceId,
      checkType: check.checkType,
      status: check.status,
      responseMs: check.responseMs,
      details: JSON.stringify(check.details),
      errorMessage: check.errorMessage,
    },
  })))

  const hasFail = checks.some((check) => check.status === 'fail')
  const hasWarn = checks.some((check) => check.status === 'warn')
  const overallHealth = hasFail ? 'down' : hasWarn ? 'degraded' : 'healthy'

  await db.agentInstance.update({
    where: { id: instanceId },
    data: { healthStatus: overallHealth, lastHealthCheck: new Date() },
  })

  await db.metric.create({
    data: {
      name: 'health_status',
      metricType: 'health',
      value: overallHealth === 'healthy' ? 1 : overallHealth === 'degraded' ? 0.5 : 0,
      unit: 'score',
      instanceId,
      agentId: instance.agentId,
      companyId: instance.companyId,
      dimensions: JSON.stringify({ healthStatus: overallHealth }),
      recordedAt: new Date(),
    },
  })

  return { instanceId, overallHealth, checks, durationMs: Date.now() - start }
}

export async function createAgentMetric(data: {
  instanceId?: string
  agentId?: string
  companyId: string
  metricType: string
  metricName: string
  value: number
  unit?: string
  dimensions?: Record<string, unknown>
}) {
  return db.metric.create({
    data: {
      name: data.metricName,
      metricType: data.metricType,
      value: data.value,
      unit: data.unit || 'count',
      instanceId: data.instanceId,
      agentId: data.agentId,
      companyId: data.companyId,
      dimensions: JSON.stringify(data.dimensions || {}),
      recordedAt: new Date(),
    },
  })
}

export async function getAgentMetrics(filters: { companyId: string; instanceId?: string; agentId?: string; metricType?: string; from?: Date; to?: Date }) {
  const where: Prisma.MetricWhereInput = { companyId: filters.companyId }
  if (filters.instanceId) where.instanceId = filters.instanceId
  if (filters.agentId) where.agentId = filters.agentId
  if (filters.metricType) where.metricType = filters.metricType
  if (filters.from || filters.to) where.recordedAt = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) }
  return db.metric.findMany({ where, orderBy: { recordedAt: 'desc' }, take: 500 })
}

export async function createAgentAlert(data: { instanceId?: string; agentId?: string; companyId: string; alertType: string; severity: string; message: string; metadata?: Record<string, unknown> }) {
  return db.agentAlert.create({ data: { ...data, metadata: JSON.stringify(data.metadata || {}) } })
}

export async function getAlerts(filters: { companyId: string; instanceId?: string; agentId?: string; severity?: string; acknowledged?: boolean; limit?: number }) {
  const where: Prisma.AgentAlertWhereInput = { companyId: filters.companyId }
  if (filters.instanceId) where.instanceId = filters.instanceId
  if (filters.agentId) where.agentId = filters.agentId
  if (filters.severity) where.severity = filters.severity
  if (filters.acknowledged !== undefined) where.isAcknowledged = filters.acknowledged
  const take = Math.min(Math.max(filters.limit ?? 50, 1), 100)
  return db.agentAlert.findMany({ where, orderBy: { createdAt: 'desc' }, take })
}

export async function acknowledgeAlert(alertId: string, acknowledgedBy: string, companyId: string) {
  const updated = await db.agentAlert.updateMany({
    where: { id: alertId, companyId },
    data: { isAcknowledged: true, acknowledgedBy, resolvedAt: new Date() },
  })
  if (updated.count === 0) throw new Error('Alert not found for this company')
  return db.agentAlert.findFirst({ where: { id: alertId, companyId } })
}
