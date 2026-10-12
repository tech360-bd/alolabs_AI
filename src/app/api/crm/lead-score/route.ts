import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
    const { contactId, factors: inputFactors } = body

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
    }

    const contact = await db.crmContact.findUnique({ where: { id: contactId } })
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Default factors if not provided
    const factors = {
      websiteVisits: inputFactors?.websiteVisits ?? 0,
      emailOpens: inputFactors?.emailOpens ?? 0,
      dealValue: inputFactors?.dealValue ?? 0,
      lastContactDaysAgo: inputFactors?.lastContactDaysAgo ?? 90,
    }

    // Scoring algorithm (0-100)
    let score = 0

    // Website visits (0-25 points)
    if (factors.websiteVisits >= 20) score += 25
    else if (factors.websiteVisits >= 10) score += 18
    else if (factors.websiteVisits >= 5) score += 12
    else if (factors.websiteVisits >= 1) score += 5

    // Email engagement (0-25 points)
    if (factors.emailOpens >= 10) score += 25
    else if (factors.emailOpens >= 5) score += 18
    else if (factors.emailOpens >= 2) score += 10
    else if (factors.emailOpens >= 1) score += 4

    // Deal value (0-25 points)
    if (factors.dealValue >= 50000) score += 25
    else if (factors.dealValue >= 10000) score += 18
    else if (factors.dealValue >= 5000) score += 12
    else if (factors.dealValue >= 1000) score += 6
    else if (factors.dealValue > 0) score += 3

    // Recency penalty (0-25 points) — more recent = higher score
    if (factors.lastContactDaysAgo <= 7) score += 25
    else if (factors.lastContactDaysAgo <= 14) score += 20
    else if (factors.lastContactDaysAgo <= 30) score += 15
    else if (factors.lastContactDaysAgo <= 60) score += 8
    else if (factors.lastContactDaysAgo <= 90) score += 3

    // Cap at 100
    score = Math.min(100, Math.max(0, score))

    // Create score record
    const leadScore = await db.crmLeadScore.create({
      data: {
        contactId,
        score,
        maxScore: 100,
        factors: JSON.stringify(factors),
        calculatedBy: 'rule-engine',
      },
    })

    // Update contact's score
    await db.crmContact.update({
      where: { id: contactId },
      data: { score },
    })

    return NextResponse.json({ data: leadScore })
  } catch (error) {
    console.error('[CRM Lead Score POST]', error)
    return NextResponse.json({ error: 'Failed to calculate lead score' }, { status: 500 })
  }
}