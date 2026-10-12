import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { URL } from 'url'

// ─── SSRF Protection ──────────────────────────────────────────────────

/**
 * Validate that a URL is safe to fetch (not internal/private).
 * Blocks localhost, loopback, link-local, private RFC 1918 ranges,
 * and metadata endpoints. Only allows http:// and https://.
 */
function validateUrlForHttpCall(rawUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }

  // Only allow http and https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Protocol '${parsed.protocol}' is not allowed. Only http:// and https:// are permitted.`)
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block localhost and loopback
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  ) {
    throw new Error('Requests to localhost/loopback addresses are not allowed.')
  }

  // Block 0.0.0.0
  if (hostname === '0.0.0.0' || hostname === '0177.0.0.1' || hostname === '2130706433') {
    throw new Error('Requests to loopback addresses are not allowed.')
  }

  // Block 10.0.0.0/8 (Class A private)
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    throw new Error('Requests to private IP ranges (10.x.x.x) are not allowed.')
  }

  // Block 172.16.0.0/12 (Class B private)
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    throw new Error('Requests to private IP ranges (172.16-31.x.x) are not allowed.')
  }

  // Block 192.168.0.0/16 (Class C private)
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    throw new Error('Requests to private IP ranges (192.168.x.x) are not allowed.')
  }

  // Block 169.254.0.0/16 (link-local / metadata endpoints)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    throw new Error('Requests to link-local/metadata addresses (169.254.x.x) are not allowed.')
  }

  // Block cloud metadata endpoints by hostname
  const blockedHostnames = [
    'metadata.google.internal',
    'metadata.goog',
    '169.254.169.254',
    'metadata.aws',
    'metadata',
  ]
  if (blockedHostnames.includes(hostname)) {
    throw new Error('Requests to cloud metadata endpoints are not allowed.')
  }
}

function evaluateCondition(
  conditionType: string,
  conditionConfig: Record<string, unknown>,
  eventData: Record<string, unknown>
): boolean {
  if (conditionType === 'always') return true
  if (conditionType === 'never') return false

  const field = (conditionConfig.field as string) || ''
  const operator = (conditionConfig.operator as string) || 'eq'
  const value = conditionConfig.value

  const fieldValue = field.split('.').reduce((obj: unknown, key: string) => {
    if (obj && typeof obj === 'object') {
      return (obj as Record<string, unknown>)[key]
    }
    return undefined
  }, eventData)

  switch (operator) {
    case 'eq': return fieldValue === value
    case 'neq': return fieldValue !== value
    case 'gt': return Number(fieldValue) > Number(value)
    case 'gte': return Number(fieldValue) >= Number(value)
    case 'lt': return Number(fieldValue) < Number(value)
    case 'lte': return Number(fieldValue) <= Number(value)
    case 'contains': return String(fieldValue).includes(String(value))
    case 'exists': return fieldValue !== undefined && fieldValue !== null
    default: return true
  }
}

async function executeAction(
  type: string,
  config: Record<string, unknown>,
  eventData: Record<string, unknown>,
  triggerId: string,
  userId?: string
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString()

  switch (type) {
    case 'send_notification': {
      const title = (config.title as string) || 'Automation Notification'
      const message = (config.message as string) || JSON.stringify(eventData)
      const priority = (config.priority as string) || 'info'
      const recipientId = (config.recipientId as string) || userId
      const companyId = (config.companyId as string) || undefined

      const notification = await db.notification.create({
        data: {
          type: 'automation',
          title,
          message,
          priority,
          userId: recipientId,
          companyId,
          metadata: JSON.stringify({
            triggerId,
            eventData: JSON.stringify(eventData),
          }),
        },
      })

      return {
        success: true,
        message: `Notification created`,
        notificationId: notification.id,
        recipient: recipientId,
        channel: 'in-app',
        timestamp: now,
      }
    }

    case 'log_message': {
      const level = (config.level as string) || 'info'
      const logMessage = (config.message as string) || JSON.stringify(eventData)
      const source = (config.source as string) || 'automation'

      await db.serverLog.create({
        data: {
          level,
          message: logMessage,
          metadata: JSON.stringify({
            triggerId,
            actionType: type,
            eventData: JSON.stringify(eventData),
          }),
        },
      })

      return {
        success: true,
        message: `Logged: ${logMessage}`,
        level,
        timestamp: now,
      }
    }

    case 'http_call': {
      const url = (config.url as string)
      const method = (config.method as string) || 'POST'
      const headers = (config.headers as Record<string, string>) || {}
      const timeoutMs = (config.timeout as number) || 10000

      if (!url) {
        return {
          success: false,
          message: 'URL is required for http_call action',
          timestamp: now,
        }
      }

      // SSRF protection — validate URL before making any request
      try {
        validateUrlForHttpCall(url)
      } catch (ssrfErr) {
        return {
          success: false,
          message: ssrfErr instanceof Error ? ssrfErr.message : 'URL blocked by security policy',
          timestamp: now,
        }
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs)

        const fetchOpts: RequestInit = {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          signal: controller.signal,
        }

        if (method !== 'GET' && method !== 'HEAD') {
          fetchOpts.body = typeof config.body === 'string' ? config.body : JSON.stringify(config.body || eventData)
        }

        const response = await fetch(url, fetchOpts)
        clearTimeout(timeout)

        let responseBody: string | null = null
        try {
          responseBody = await response.text()
        } catch {
          // response body may not be readable
        }

        return {
          success: response.status >= 200 && response.status < 300,
          message: `HTTP ${method} ${url}`,
          statusCode: response.status,
          responseLength: responseBody?.length || 0,
          timestamp: now,
        }
      } catch (err) {
        return {
          success: false,
          message: `HTTP ${method} ${url} failed`,
          error: err instanceof Error ? err.message : 'Request failed',
          timestamp: now,
        }
      }
    }

    case 'create_task': {
      const title = (config.title as string) || 'Automation Task'
      const description = (config.description as string) || `Created by automation trigger ${triggerId}`
      const priority = (config.priority as string) || 'medium'
      const assigneeId = (config.assigneeId as string) || undefined

      const task = await db.task.create({
        data: {
          title,
          description,
          status: 'pending',
          priority,
          userId: assigneeId,
        },
      })

      return {
        success: true,
        message: `Task created: ${title}`,
        taskId: task.id,
        priority,
        timestamp: now,
      }
    }

    case 'update_record': {
      const targetTable = (config.table as string)
      const recordId = (config.recordId as string)
      const updates = (config.updates as Record<string, unknown>) || {}

      if (!targetTable || !recordId) {
        return {
          success: false,
          message: 'table and recordId are required for update_record action',
          timestamp: now,
        }
      }

      const allowedTables = ['agent', 'task', 'workflow', 'crmContact', 'crmDeal'] as const
      if (!allowedTables.includes(targetTable as typeof allowedTables[number])) {
        return {
          success: false,
          message: `Table '${targetTable}' is not allowed for update_record`,
          timestamp: now,
        }
      }

      // Blocked fields prevent updating sensitive columns
      const BLOCKED_FIELDS: Record<string, string[]> = {
        // Universal blocked fields (applied to every table)
        '__universal__': ['id', 'createdAt', 'updatedAt'],
        'agent': ['agentId', 'departmentId', 'departmentName', 'status'],
        'task': [],
        'workflow': [],
        'crmContact': [],
        'crmDeal': [],
        'user': ['role', 'passwordHash', 'otpSecret', 'otpEnabled', 'isActive'],
        'company': ['slug', 'isActive'],
      }

      const universalBlocked = BLOCKED_FIELDS['__universal__'] || []
      const tableBlocked = BLOCKED_FIELDS[targetTable] || []
      const allBlocked = new Set([...universalBlocked, ...tableBlocked])

      // Filter out blocked fields from updates
      const filteredUpdates: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(updates)) {
        if (!allBlocked.has(key)) {
          filteredUpdates[key] = value
        }
      }

      try {
        const updateData: Record<string, unknown> = { ...filteredUpdates, updatedAt: new Date() }
        switch (targetTable) {
          case 'agent': {
            const r = await db.agent.update({ where: { id: recordId }, data: updateData as Record<string, unknown> })
            return { success: true, message: `Record updated in ${targetTable}`, recordsAffected: 1, recordId: r.id, timestamp: now }
          }
          case 'task': {
            const r = await db.task.update({ where: { id: recordId }, data: updateData as Record<string, unknown> })
            return { success: true, message: `Record updated in ${targetTable}`, recordsAffected: 1, recordId: r.id, timestamp: now }
          }
          case 'workflow': {
            const r = await db.workflow.update({ where: { id: recordId }, data: updateData as Record<string, unknown> })
            return { success: true, message: `Record updated in ${targetTable}`, recordsAffected: 1, recordId: r.id, timestamp: now }
          }
          case 'crmContact': {
            const r = await db.crmContact.update({ where: { id: recordId }, data: updateData as Record<string, unknown> })
            return { success: true, message: `Record updated in ${targetTable}`, recordsAffected: 1, recordId: r.id, timestamp: now }
          }
          case 'crmDeal': {
            const r = await db.crmDeal.update({ where: { id: recordId }, data: updateData as Record<string, unknown> })
            return { success: true, message: `Record updated in ${targetTable}`, recordsAffected: 1, recordId: r.id, timestamp: now }
          }
          default:
            return { success: false, message: `Unknown table: ${targetTable}`, timestamp: now }
        }
      } catch (err) {
        return {
          success: false,
          message: `Failed to update record in ${targetTable}`,
          error: err instanceof Error ? err.message : 'Update failed',
          timestamp: now,
        }
      }
    }

    case 'agent_dispatch': {
      const agentId = (config.agentId as string)
      const taskPrompt = (config.prompt as string) || JSON.stringify(eventData)

      if (!agentId) {
        return {
          success: false,
          message: 'agentId is required for agent_dispatch action',
          timestamp: now,
        }
      }

      const agent = await db.agent.findUnique({ where: { id: agentId } })
      if (!agent) {
        return {
          success: false,
          message: `Agent ${agentId} not found`,
          timestamp: now,
        }
      }

      const agentRun = await db.agentRun.create({
        data: {
          agentId,
          agentName: agent.name,
          status: 'queued',
          input: taskPrompt,
        },
      })

      return {
        success: true,
        message: `Agent dispatched for task`,
        agentId,
        agentRunId: agentRun.id,
        status: 'queued',
        timestamp: now,
      }
    }

    case 'run_workflow': {
      const workflowId = (config.workflowId as string)
      const workflowInput = (config.input as string) || JSON.stringify(eventData)

      if (!workflowId) {
        return {
          success: false,
          message: 'workflowId is required for run_workflow action',
          timestamp: now,
        }
      }

      const workflow = await db.workflow.findUnique({ where: { id: workflowId } })
      if (!workflow) {
        return {
          success: false,
          message: `Workflow ${workflowId} not found`,
          timestamp: now,
        }
      }

      const workflowRun = await db.workflowRun.create({
        data: {
          workflowId,
          workflowName: workflow.name,
          status: 'pending',
          input: workflowInput,
        },
      })

      return {
        success: true,
        message: `Workflow \"${workflow.name}\" queued`,
        workflowId,
        workflowRunId: workflowRun.id,
        timestamp: now,
      }
    }

    case 'send_email': {
      const to = (config.to as string)
      const subject = (config.subject as string) || 'Automation Notification'
      const emailBody = (config.body as string) || JSON.stringify(eventData, null, 2)

      if (!to) {
        return {
          success: false,
          message: 'to (email address) is required for send_email action',
          timestamp: now,
        }
      }

      await db.notification.create({
        data: {
          type: 'email',
          title: subject,
          message: emailBody,
          priority: 'normal',
          userId,
          metadata: JSON.stringify({
            channel: 'email',
            to,
            triggerId,
          }),
        },
      })

      return {
        success: true,
        message: `Email queued for ${to}`,
        to,
        subject,
        timestamp: now,
      }
    }

    default:
      return {
        success: false,
        message: `Unknown action type: ${type}`,
        timestamp: now,
      }
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { verifySessionToken } = await import('@/lib/auth')
  const session = await verifySessionToken(token)
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  try {
    const body = await request.json()
    const { triggerId, eventData: inputEventData } = body

    if (!triggerId) {
      return NextResponse.json({ error: 'triggerId is required' }, { status: 400 })
    }

    const trigger = await db.automationTrigger.findUnique({
      where: { id: triggerId },
      include: {
        actions: { orderBy: { sortOrder: 'asc' } },
      },
    })

    if (!trigger) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 })
    }

    if (!trigger.enabled) {
      return NextResponse.json({ error: 'Trigger is disabled' }, { status: 400 })
    }

    const startTime = Date.now()
    const eventData = inputEventData || { source: 'manual', triggeredAt: new Date().toISOString() }
    const actionResults: Array<{
      actionId: string
      actionName: string
      actionType: string
      status: string
      result: unknown
      durationMs: number
      skipped: boolean
    }> = []

    let hasFailure = false
    let hasSuccess = false
    let executionError: string | null = null

    for (const action of trigger.actions) {
      const actionConfig = JSON.parse(action.config || '{}')
      const conditionConfig = JSON.parse(action.conditionConfig || '{}')

      const shouldRun = evaluateCondition(action.conditionType, conditionConfig, eventData)

      if (!shouldRun) {
        actionResults.push({
          actionId: action.id,
          actionName: action.name,
          actionType: action.type,
          status: 'skipped',
          result: { message: 'Condition not met, action skipped' },
          durationMs: 0,
          skipped: true,
        })
        continue
      }

      if (action.delaySeconds && action.delaySeconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, action.delaySeconds * 1000))
      }

      const actionStart = Date.now()
      let result: Record<string, unknown> = { success: false, message: 'Action not executed' }
      let attempts = 0
      const maxAttempts = 1 + (action.retryCount || 0)
      const retryDelay = (action.retryDelaySeconds || 30) * 1000

      while (attempts < maxAttempts) {
        attempts++
        try {
          result = await executeAction(action.type, actionConfig, eventData, trigger.id, session.userId)
          if (result.success) break
          if (attempts < maxAttempts && retryDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay))
          }
        } catch (err) {
          result = {
            success: false,
            message: `Action ${action.name} threw an error`,
            error: err instanceof Error ? err.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          }
          if (attempts < maxAttempts && retryDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay))
          }
        }
      }

      const actionDuration = Date.now() - actionStart
      const actionStatus = result.success ? 'success' : 'failed'

      if (actionStatus === 'failed') hasFailure = true
      else hasSuccess = true

      actionResults.push({
        actionId: action.id,
        actionName: action.name,
        actionType: action.type,
        status: actionStatus,
        result,
        durationMs: actionDuration,
        skipped: false,
      })

      await db.automationAction.update({
        where: { id: action.id },
        data: {
          lastExecutedAt: new Date(),
          executionCount: { increment: 1 },
          successCount: actionStatus === 'success' ? { increment: 1 } : undefined,
          failCount: actionStatus === 'failed' ? { increment: 1 } : undefined,
        },
      })
    }

    const totalDuration = Date.now() - startTime
    const overallStatus = hasFailure && hasSuccess ? 'partial' : hasFailure ? 'failed' : 'success'

    if (overallStatus === 'failed') {
      executionError = actionResults
        .filter((r) => r.status === 'failed')
        .map((r) => `${r.actionName}: ${r.result && typeof r.result === 'object' && 'message' in r.result ? (r.result as { message: string }).message : 'Unknown error'}`)
        .join('; ')
    }

    await db.automationTriggerLog.create({
      data: {
        triggerId: trigger.id,
        eventData: JSON.stringify(eventData),
        actionResults: JSON.stringify(actionResults),
        status: overallStatus,
        durationMs: totalDuration,
        error: executionError,
      },
    })

    await db.automationTrigger.update({
      where: { id: trigger.id },
      data: {
        lastFiredAt: new Date(),
        fireCount: { increment: 1 },
      },
    })

    return NextResponse.json({
      data: {
        triggerId: trigger.id,
        triggerName: trigger.name,
        status: overallStatus,
        durationMs: totalDuration,
        actionResults,
        eventData,
      },
    })
  } catch (error) {
    console.error('[POST /api/automation/execute]', error)
    return NextResponse.json({ error: 'Failed to execute trigger' }, { status: 500 })
  }
}