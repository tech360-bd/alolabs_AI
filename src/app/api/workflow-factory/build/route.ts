import { db } from '@/lib/db'
import { legacyTenant, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Resolves the caller's company from a live membership. The previous check
  // verified the token but discarded the session, so these routes created
  // records with no owner and could not attribute them to a tenant.
  let tenant;
  try {
    tenant = await legacyTenant(request);
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    throw error;
  }
  try {
    const body = await request.json()
    const { workflowName, config } = body

    if (!workflowName) {
      return NextResponse.json(
        { error: 'workflowName is required' },
        { status: 400 }
      )
    }

    const parsedConfig = typeof config === 'string' ? config : JSON.stringify(config || {})

    // Check for duplicate name
    const existing = await db.workflow.findUnique({
      where: { name: workflowName },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A workflow with this name already exists' },
        { status: 409 }
      )
    }

    // Create Workflow record
    const workflow = await db.workflow.create({
      data: {
        name: workflowName,
        slug: workflowName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        stepConfigs: parsedConfig,
        status: 'active',
        triggers: '[]',
      },
    })

    // Create WorkflowBuildRequest record
    const buildRequest = await db.workflowBuildRequest.create({
      data: {
        companyId: tenant.companyId,
        workflowName,
        config: parsedConfig,
        status: 'generated',
        result: `Workflow "${workflowName}" generated successfully`,
      },
    })

    return NextResponse.json(
      {
        workflowId: workflow.id,
        name: workflow.name,
        slug: workflow.slug,
        status: workflow.status,
        buildRequestId: buildRequest.id,
        buildStatus: buildRequest.status,
        message: `Workflow "${workflowName}" built and activated successfully`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[Workflow Factory Build] Error:', error)
    return NextResponse.json(
      { error: 'Failed to build workflow' },
      { status: 500 }
    )
  }
}