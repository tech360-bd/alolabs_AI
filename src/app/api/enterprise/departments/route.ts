import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { DEPARTMENTS, DIVISIONS, type DivisionSpec, type DepartmentBlueprint } from '@/lib/enterprise-spec'

interface DivisionResponse {
  id: string
  name: string
  mission: string
  vpAgent: string
  departmentCount: number
  kpis: string[]
}

interface DepartmentResponse {
  id: string
  name: string
  code: string
  division: string
  divisionName: string
  type: string
  mission: string
  objectives: string[]
  capabilities: string[]
  reportingTo: string
}

const divisionMap = new Map<string, DivisionSpec>(
  DIVISIONS.map((d) => [d.divId, d])
)

function enrichDepartment(dept: DepartmentBlueprint): DepartmentResponse {
  const div = divisionMap.get(dept.division)
  return {
    id: dept.deptId,
    name: dept.name,
    code: dept.code,
    division: dept.division,
    divisionName: div?.name ?? 'Unknown',
    type: dept.type,
    mission: dept.mission,
    objectives: dept.strategicObjectives,
    capabilities: dept.keyCapabilities,
    reportingTo: dept.reportingTo,
  }
}

function mapDivision(div: DivisionSpec): DivisionResponse {
  return {
    id: div.divId,
    name: div.name,
    mission: div.mission,
    vpAgent: div.vpAgent,
    departmentCount: div.departments.length,
    kpis: div.kpis,
  }
}

const enrichedDepartments: DepartmentResponse[] = DEPARTMENTS.map(enrichDepartment)
const mappedDivisions: DivisionResponse[] = DIVISIONS.map(mapDivision)

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const limit = Math.min(Number(searchParams.get('limit') || 10), 100)
    const search = searchParams.get('search') || ''
    const division = searchParams.get('division') || ''
    const type = searchParams.get('type') || ''
    // 'category' kept for backward compat — maps to 'type' in spec
    const category = searchParams.get('category') || ''

    const filterType = type || category

    let filtered = enrichedDepartments
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          d.mission.toLowerCase().includes(q)
      )
    }
    if (division) {
      filtered = filtered.filter((d) => d.division === division)
    }
    if (filterType) {
      filtered = filtered.filter(
        (d) => d.type.toLowerCase() === filterType.toLowerCase()
      )
    }

    const total = filtered.length
    const paged = filtered.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      departments: paged,
      divisions: mappedDivisions,
      total,
      page,
      limit,
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
