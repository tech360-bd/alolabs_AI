import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'

const CommunicationSchema = z.object({
  fromAgentId: z.string().min(1).optional(),
  toAgentId: z.string().min(1).optional(),
  fromInstanceId: z.string().min(1).optional(),
  toInstanceId: z.string().min(1).optional(),
  type: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(1).max(500),
  payload: z.record(z.string(), z.unknown()).default({}),
  parentMsgId: z.string().min(1).optional(),
}).refine((value) => value.fromAgentId || value.fromInstanceId, {
  message: 'fromAgentId or fromInstanceId is required',
}).refine((value) => value.toAgentId || value.toInstanceId, {
  message: 'toAgentId or toInstanceId is required',
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const search = req.nextUrl.searchParams
    const constraints: Prisma.AgentCommunicationWhereInput[] = []
    const agentId = search.get('agentId')
    const instanceId = search.get('instanceId')
    const type = search.get('type')
    const status = search.get('status')
    if (agentId) constraints.push({ OR: [{ fromAgentId: agentId }, { toAgentId: agentId }] })
    if (instanceId) constraints.push({ OR: [{ fromInstanceId: instanceId }, { toInstanceId: instanceId }] })

    const where: Prisma.AgentCommunicationWhereInput = {
      companyId: user.companyId,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(constraints.length ? { AND: constraints } : {}),
    }
    const data = await db.agentCommunication.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = CommunicationSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }
    const message = parsed.data
    let fromAgentId = message.fromAgentId
    let toAgentId = message.toAgentId

    if (message.fromInstanceId) {
      const instance = await db.agentInstance.findFirst({
        where: { id: message.fromInstanceId, companyId: user.companyId },
        select: { agentId: true },
      })
      if (!instance) return NextResponse.json({ error: 'Sender instance not found for this company', success: false }, { status: 404 })
      if (fromAgentId && fromAgentId !== instance.agentId) {
        return NextResponse.json({ error: 'Sender agent does not match the instance', success: false }, { status: 400 })
      }
      fromAgentId = instance.agentId
    } else if (fromAgentId) {
      const access = await db.agentCompanyAccess.findFirst({
        where: { agentId: fromAgentId, companyId: user.companyId },
        select: { id: true },
      })
      if (!access) return NextResponse.json({ error: 'Sender agent is not available to this company', success: false }, { status: 404 })
    }

    if (message.toInstanceId) {
      const instance = await db.agentInstance.findFirst({
        where: { id: message.toInstanceId, companyId: user.companyId },
        select: { agentId: true },
      })
      if (!instance) return NextResponse.json({ error: 'Recipient instance not found for this company', success: false }, { status: 404 })
      if (toAgentId && toAgentId !== instance.agentId) {
        return NextResponse.json({ error: 'Recipient agent does not match the instance', success: false }, { status: 400 })
      }
      toAgentId = instance.agentId
    } else if (toAgentId) {
      const access = await db.agentCompanyAccess.findFirst({
        where: { agentId: toAgentId, companyId: user.companyId },
        select: { id: true },
      })
      if (!access) return NextResponse.json({ error: 'Recipient agent is not available to this company', success: false }, { status: 404 })
    }

    if (message.parentMsgId) {
      const parent = await db.agentCommunication.findFirst({
        where: { id: message.parentMsgId, companyId: user.companyId },
        select: { id: true },
      })
      if (!parent) return NextResponse.json({ error: 'Parent message not found for this company', success: false }, { status: 404 })
    }

    const data = await db.agentCommunication.create({
      data: {
        fromAgentId,
        toAgentId,
        fromInstanceId: message.fromInstanceId,
        toInstanceId: message.toInstanceId,
        type: message.type,
        subject: message.subject,
        payload: JSON.stringify(message.payload),
        parentMsgId: message.parentMsgId,
        companyId: user.companyId,
        status: 'pending',
      },
    })
    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
