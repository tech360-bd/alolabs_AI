import { requireAuth } from '@/lib/api-auth'
import { tenantTarget } from '@/lib/api/secure-route'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Tenant comes from the authenticated principal; a query value naming
    // another tenant is refused.
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId query parameter is required' },
        { status: 400 }
      )
    }
    const target = tenantTarget(user, companyId)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

    // Validate company exists
    const company = await db.company.findUnique({
      where: { id: companyId },
    })

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }

    // Parse allowedWorkflows from company
    const allowedWorkflowNames: string[] = company.allowedWorkflows
      ? JSON.parse(company.allowedWorkflows)
      : []

    let workflows: Array<{ id: string; name: string; slug: string; description: string | null; status: string; departmentId: string | null; createdAt: Date; updatedAt: Date; workflowSteps: unknown }> = []

    if (allowedWorkflowNames.length > 0) {
      workflows = await db.workflow.findMany({
        where: {
          OR: [
            { id: { in: allowedWorkflowNames } },
            { name: { in: allowedWorkflowNames } },
            { slug: { in: allowedWorkflowNames } },
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
          departmentId: true,
          createdAt: true,
          updatedAt: true,
          workflowSteps: {
            select: {
              id: true,
              stepNumber: true,
              action: true,
              agentId: true,
              skillId: true,
            },
            orderBy: { stepNumber: 'asc' },
          },
        },
      })
    }

    return NextResponse.json({
      companyId: company.id,
      companyName: company.name,
      workflows,
      total: workflows.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[Company Allowed Workflows] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch allowed workflows' },
      { status: 500 }
    )
  }
}