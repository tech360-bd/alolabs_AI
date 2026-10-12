import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import {
  CONSTITUTION,
  CHAPTERS,
  type ConstitutionalRuleSpec,
} from '@/lib/enterprise-spec'

interface RuleResponse {
  id: string
  chapter: string
  title: string
  category: string
  severity: string
  priority: string
  statement: string
  rationale: string
  enforcement: string
  violationConsequence: string
  reviewCycle: string
}

function mapRuleToResponse(rule: ConstitutionalRuleSpec): RuleResponse {
  return {
    id: rule.ruleId,
    chapter: rule.chapter,
    title: rule.title,
    category: rule.prismaCategory,
    severity: rule.prismaSeverity,
    priority: rule.priority,
    statement: rule.statement,
    rationale: rule.rationale,
    enforcement: rule.enforcement,
    violationConsequence: rule.violationConsequence,
    reviewCycle: rule.reviewCycle,
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const severity = searchParams.get('severity') || ''
    const chapter = searchParams.get('chapter') || ''
    const priority = searchParams.get('priority') || ''
    const status = searchParams.get('status') || ''

    let filtered = CONSTITUTION

    // Filter by chapter (new filter using spec data)
    if (chapter) {
      filtered = filtered.filter(
        (r) => r.chapter.toLowerCase() === chapter.toLowerCase()
      )
    }

    // Filter by category (mapped from prismaCategory)
    if (category) {
      filtered = filtered.filter(
        (r) => r.prismaCategory.toLowerCase() === category.toLowerCase()
      )
    }

    // Filter by severity (mapped from prismaSeverity)
    if (severity) {
      filtered = filtered.filter(
        (r) => r.prismaSeverity.toLowerCase() === severity.toLowerCase()
      )
    }

    // Filter by priority (CRITICAL|HIGH|MEDIUM|LOW)
    if (priority) {
      filtered = filtered.filter(
        (r) => r.priority.toUpperCase() === priority.toUpperCase()
      )
    }

    // Search by title or statement
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.statement.toLowerCase().includes(q) ||
          r.ruleId.toLowerCase().includes(q)
      )
    }

    // status filter kept for backward compat — all spec rules are active
    if (status && status !== 'active') {
      filtered = filtered.filter(() => false)
    }

    const total = filtered.length
    const paged = filtered.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      rules: paged.map(mapRuleToResponse),
      total,
      page,
      limit,
      // Expose available chapters for client-side filtering
      chapters: CHAPTERS,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
