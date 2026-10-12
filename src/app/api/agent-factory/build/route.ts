import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const builds = await db.agentBuildRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return NextResponse.json(builds)
  } catch (error) {
    console.error('[Agent Factory Build List] Error:', error)
    return NextResponse.json(
      { error: 'Failed to list build requests' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const body = await request.json()
    const { agentName, departmentId, config } = body

    if (!agentName) {
      return NextResponse.json(
        { error: 'agentName is required' },
        { status: 400 }
      )
    }

    // Validate department exists if provided
    if (departmentId) {
      const dept = await db.department.findUnique({
        where: { id: departmentId },
      })
      if (!dept) {
        return NextResponse.json(
          { error: 'Department not found' },
          { status: 404 }
        )
      }
    }

    // Generate next agent ID
    const lastAgent = await db.agent.findFirst({
      orderBy: { agentId: 'desc' },
      select: { agentId: true },
    })
    let nextNum = 1
    if (lastAgent?.agentId) {
      const match = lastAgent.agentId.match(/AGENT-(\d+)/)
      if (match) {
        nextNum = parseInt(match[1], 10) + 1
      }
    }
    const newAgentId = `AGENT-${String(nextNum).padStart(4, '0')}`

    // Get department name
    const deptName = departmentId
      ? (await db.department.findUnique({ where: { id: departmentId }, select: { name: true } }))?.name || 'Unknown'
      : 'Unassigned'

    const parsedConfig = typeof config === 'string' ? config : JSON.stringify(config || {})

    // Create Agent record
    const agent = await db.agent.create({
      data: {
        agentId: newAgentId,
        name: agentName,
        slug: agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        departmentId: departmentId || '',
        departmentName: deptName,
        purpose: '',
        status: 'configured',
        protectionRules: parsedConfig,
        workflowSteps: '[]',
        selfImprovement: '{}',
      },
    })

    // Create AgentBuildRequest record
    const buildRequest = await db.agentBuildRequest.create({
      data: {
        agentName,
        departmentId: departmentId || null,
        config: parsedConfig,
        status: 'generated',
        result: `Agent ${newAgentId} generated successfully`,
      },
    })

    return NextResponse.json(
      {
        agentId: agent.id,
        agentNumber: agent.agentId,
        name: agent.name,
        status: agent.status,
        buildRequestId: buildRequest.id,
        buildStatus: buildRequest.status,
        message: `Agent ${newAgentId} built and configured successfully`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[Agent Factory Build] Error:', error)
    return NextResponse.json(
      { error: 'Failed to build agent' },
      { status: 500 }
    )
  }
}