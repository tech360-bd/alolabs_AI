import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

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
    const { skillName, category, content } = body

    if (!skillName) {
      return NextResponse.json(
        { error: 'skillName is required' },
        { status: 400 }
      )
    }

    const categoryValue = category || 'general'
    const contentValue = content || ''

    // Create Skill record
    const skill = await db.skill.create({
      data: {
        name: skillName,
        slug: skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        category: categoryValue,
        categorySlug: categoryValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        title: skillName,
        status: 'private',
        content: contentValue,
        purpose: '',
        requiresApproval: true,
      },
    })

    // Create SkillBuildRequest record
    const buildRequest = await db.skillBuildRequest.create({
      data: {
        skillName,
        category: categoryValue,
        content: contentValue,
        status: 'generated',
        result: `Skill "${skillName}" generated successfully`,
      },
    })

    return NextResponse.json(
      {
        skillId: skill.id,
        name: skill.name,
        slug: skill.slug,
        category: skill.category,
        status: skill.status,
        buildRequestId: buildRequest.id,
        buildStatus: buildRequest.status,
        message: `Skill "${skillName}" built and saved as private`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[Skill Factory Build] Error:', error)
    return NextResponse.json(
      { error: 'Failed to build skill' },
      { status: 500 }
    )
  }
}