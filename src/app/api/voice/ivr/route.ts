import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany, parseJsonColumn } from '@/lib/voice/api-helpers'
import {
  createIvrFlow,
  updateIvrFlow,
  deleteIvrFlow,
  activateIvrFlow,
  validateIvrGraph,
} from '@/lib/voice/telephony-config'
import type { IvrFlowGraph } from '@/lib/voice/routing'

export const dynamic = 'force-dynamic'

/**
 * IVR flow management (Module A — IVR menus, call routing).
 *
 * GET   — list the tenant's flows (graphs parsed)
 * POST  — create { name, nodes[], entryNodeId?, activate? } — graph is
 *         structurally validated; a broken graph is rejected, never stored
 * PATCH — { flowId, name?, description?, nodes?, entryNodeId?, action? }
 *         action 'activate' makes this the single active flow for the tenant
 * DELETE — { flowId } (refuses while active or assigned to a number)
 */
export async function GET() {
  return withCompany(async (auth) => {
    const flows = await db.ivrFlow.findMany({
      where: { companyId: auth.companyId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })
    return {
      data: flows.map((flow) => ({
        ...flow,
        nodes: parseJsonColumn<unknown[]>(flow.nodes, []),
      })),
      total: flows.length,
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const name = requireString(body, 'name')
    if (!Array.isArray(body.nodes)) throw new Error('Invalid request: nodes must be an array')

    const graph: IvrFlowGraph = {
      nodes: body.nodes as IvrFlowGraph['nodes'],
      entryNodeId: optionalString(body, 'entryNodeId'),
    }
    const created = await createIvrFlow({
      companyId: auth.companyId,
      name,
      description: optionalString(body, 'description'),
      graph,
      active: body.activate === true,
    })
    return {
      data: created,
      notice: created.validation.warnings.length > 0
        ? `Saved. ${created.validation.warnings.length} warning(s) — see validation.warnings.`
        : 'IVR flow saved.',
    }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const flowId = requireString(body, 'flowId')

    if (optionalString(body, 'action') === 'activate') {
      await activateIvrFlow(auth.companyId, flowId)
      return { data: { ok: true, activeFlowId: flowId } }
    }

    const graph = Array.isArray(body.nodes)
      ? { nodes: body.nodes as IvrFlowGraph['nodes'], entryNodeId: optionalString(body, 'entryNodeId') }
      : undefined
    const result = await updateIvrFlow({
      companyId: auth.companyId,
      flowId,
      name: optionalString(body, 'name'),
      description: optionalString(body, 'description'),
      graph,
    })
    return { data: { ok: true, validation: result.validation } }
  })
}

export async function DELETE(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    await deleteIvrFlow(auth.companyId, requireString(body, 'flowId'))
    return { data: { ok: true } }
  })
}

/** Expose the validator so the UI can preview graph errors before saving. */
export async function PUT(request: Request) {
  return withCompany(async () => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    if (!Array.isArray(body.nodes)) throw new Error('Invalid request: nodes must be an array')
    return {
      data: validateIvrGraph({
        nodes: body.nodes as IvrFlowGraph['nodes'],
        entryNodeId: optionalString(body, 'entryNodeId'),
      }),
    }
  })
}
