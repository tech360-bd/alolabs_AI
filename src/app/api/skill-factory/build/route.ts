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
        companyId: tenant.companyId,
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