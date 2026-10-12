'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  GraduationCap,
  Building2,
  Award,
  Home,
  Trophy,
  Globe,
  ExternalLink,
  Filter,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface University {
  id: string
  name: string
  slug: string
  country: string
  city: string
  campus: string
  type: string
  foundedYear: number | null
  studentCount: number
  internationalStudents: number | null
  website: string | null
  rankingQS: number | null
  rankingTHE: number | null
  rankingARWU: number | null
  acceptanceRate: number | null
  description: string | null
  _count: { faculties: number; courses: number; scholarships: number; accommodations: number }
}

interface Course {
  id: string
  name: string
  universityId: string
  universityName: string
  universityCountry: string
  facultyName: string | null
  level: string
  duration: string | null
  tuitionFeeUSD: number | null
  intakeMonths: string[] | null
  entryRequirements: string[] | null
  description: string | null
}

interface Scholarship {
  id: string
  name: string
  universityId: string
  universityName: string
  universityCountry: string
  type: string
  coverage: string
  amountUSD: number | null
  eligibility: string[] | null
  deadline: string | null
  description: string | null
  website: string | null
}

interface Accommodation {
  id: string
  name: string
  universityId: string
  universityName: string
  type: string
  costPerWeekUSD: number | null
  capacity: number | null
  amenities: string[] | null
  description: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return `$${value.toLocaleString()}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const levelColors: Record<string, string> = {
  undergraduate: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  postgraduate: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  phd: 'bg-green-100 text-green-800 hover:bg-green-100',
  foundation: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
}

const coverageColors: Record<string, string> = {
  full: 'bg-green-100 text-green-800 hover:bg-green-100',
  partial: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  tuition_only: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  living_only: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
}

const typeColors: Record<string, string> = {
  public: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  private: 'bg-rose-100 text-rose-800 hover:bg-rose-100',
}

const scholarshipTypeColors: Record<string, string> = {
  merit: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  need: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-100',
  research: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
  sports: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
}

const accommodationTypeColors: Record<string, string> = {
  halls: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
  apartments: 'bg-violet-100 text-violet-800 hover:bg-violet-100',
  homestay: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  private: 'bg-slate-100 text-slate-800 hover:bg-slate-100',
}

// ─── Skeleton Loaders ───────────────────────────────────────────────────────

function UniversityCardSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="h-5 w-3/4 mb-2" />
      <Skeleton className="h-4 w-1/2 mb-3" />
      <div className="flex gap-2 mb-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-4 w-full" />
    </Card>
  )
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function UniversityDirectoryPanel() {
  const [activeTab, setActiveTab] = useState('universities')

  // Universities state
  const [universities, setUniversities] = useState<University[]>([])
  const [uniLoading, setUniLoading] = useState(true)
  const [uniError, setUniError] = useState<string | null>(null)
  const [uniSearch, setUniSearch] = useState('')
  const [uniCountryFilter, setUniCountryFilter] = useState('all')
  const [uniTypeFilter, setUniTypeFilter] = useState('all')
  const [selectedUniversity, setSelectedUniversity] = useState<University | null>(null)
  const [uniCountries, setUniCountries] = useState<string[]>([])

  // Courses state
  const [courses, setCourses] = useState<Course[]>([])
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const [courseSearch, setCourseSearch] = useState('')
  const [courseLevelFilter, setCourseLevelFilter] = useState('all')
  const [courseMaxTuition, setCourseMaxTuition] = useState('')

  // Scholarships state
  const [scholarships, setScholarships] = useState<Scholarship[]>([])
  const [scholarshipLoading, setScholarshipLoading] = useState(true)
  const [scholarshipError, setScholarshipError] = useState<string | null>(null)
  const [scholarshipSearch, setScholarshipSearch] = useState('')
  const [scholarshipTypeFilter, setScholarshipTypeFilter] = useState('all')
  const [scholarshipCoverageFilter, setScholarshipCoverageFilter] = useState('all')

  // Accommodation state
  const [accommodations, setAccommodations] = useState<Accommodation[]>([])
  const [accLoading, setAccLoading] = useState(true)
  const [accError, setAccError] = useState<string | null>(null)
  const [accSearch, setAccSearch] = useState('')
  const [accTypeFilter, setAccTypeFilter] = useState('all')
  const [accMaxCost, setAccMaxCost] = useState('')

  // Rankings state
  const [rankings, setRankings] = useState<University[]>([])
  const [rankLoading, setRankLoading] = useState(true)
  const [rankError, setRankError] = useState<string | null>(null)

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchUniversities = useCallback(async () => {
    setUniLoading(true)
    setUniError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (uniSearch) params.set('search', uniSearch)
      if (uniCountryFilter !== 'all') params.set('country', uniCountryFilter)
      if (uniTypeFilter !== 'all') params.set('type', uniTypeFilter)
      const res = await fetch(`/api/universities?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Fetch failed')
      setUniversities(json.data.universities)
    } catch (err) {
      setUniError(err instanceof Error ? err.message : 'Failed to load universities')
    } finally {
      setUniLoading(false)
    }
  }, [uniSearch, uniCountryFilter, uniTypeFilter])

  const fetchCourses = useCallback(async () => {
    setCourseLoading(true)
    setCourseError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (courseSearch) params.set('search', courseSearch)
      if (courseLevelFilter !== 'all') params.set('level', courseLevelFilter)
      if (courseMaxTuition) params.set('maxTuition', courseMaxTuition)
      const res = await fetch(`/api/universities/courses?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Fetch failed')
      setCourses(json.data.courses)
    } catch (err) {
      setCourseError(err instanceof Error ? err.message : 'Failed to load courses')
    } finally {
      setCourseLoading(false)
    }
  }, [courseSearch, courseLevelFilter, courseMaxTuition])

  const fetchScholarships = useCallback(async () => {
    setScholarshipLoading(true)
    setScholarshipError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (scholarshipSearch) params.set('search', scholarshipSearch)
      if (scholarshipTypeFilter !== 'all') params.set('type', scholarshipTypeFilter)
      if (scholarshipCoverageFilter !== 'all') params.set('coverage', scholarshipCoverageFilter)
      const res = await fetch(`/api/universities/scholarships?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Fetch failed')
      setScholarships(json.data.scholarships)
    } catch (err) {
      setScholarshipError(err instanceof Error ? err.message : 'Failed to load scholarships')
    } finally {
      setScholarshipLoading(false)
    }
  }, [scholarshipSearch, scholarshipTypeFilter, scholarshipCoverageFilter])

  const fetchAccommodation = useCallback(async () => {
    setAccLoading(true)
    setAccError(null)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (accTypeFilter !== 'all') params.set('type', accTypeFilter)
      if (accMaxCost) params.set('maxCostPerWeek', accMaxCost)
      const res = await fetch(`/api/universities/accommodation?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Fetch failed')
      let data = json.data.accommodations
      if (accSearch) {
        const q = accSearch.toLowerCase()
        data = data.filter(
          (a: Accommodation) =>
            a.name.toLowerCase().includes(q) ||
            a.universityName.toLowerCase().includes(q)
        )
      }
      setAccommodations(data)
    } catch (err) {
      setAccError(err instanceof Error ? err.message : 'Failed to load accommodation')
    } finally {
      setAccLoading(false)
    }
  }, [accSearch, accTypeFilter, accMaxCost])

  const fetchRankings = useCallback(async () => {
    setRankLoading(true)
    setRankError(null)
    try {
      const params = new URLSearchParams({
        limit: '100',
        sortBy: 'rankingQS',
        sortOrder: 'asc',
      })
      const res = await fetch(`/api/universities?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Fetch failed')
      setRankings(json.data.universities)
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Failed to load rankings')
    } finally {
      setRankLoading(false)
    }
  }, [])

  // Fetch all universities for country list
  const fetchAllUniversitiesForCountries = useCallback(async () => {
    try {
      const res = await fetch('/api/universities?limit=100')
      if (!res.ok) return
      const json = await res.json()
      if (!json.success) return
      const countries = Array.from(
        new Set<string>(json.data.universities.map((u: University) => u.country))
      ).sort()
      setUniCountries(countries)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchAllUniversitiesForCountries()
  }, [fetchAllUniversitiesForCountries])

  useEffect(() => {
    if (activeTab === 'universities') fetchUniversities()
  }, [activeTab, fetchUniversities])

  useEffect(() => {
    if (activeTab === 'courses') fetchCourses()
  }, [activeTab, fetchCourses])

  useEffect(() => {
    if (activeTab === 'scholarships') fetchScholarships()
  }, [activeTab, fetchScholarships])

  useEffect(() => {
    if (activeTab === 'accommodation') fetchAccommodation()
  }, [activeTab, fetchAccommodation])

  useEffect(() => {
    if (activeTab === 'rankings') fetchRankings()
  }, [activeTab, fetchRankings])

  // ─── Computed Stats ───────────────────────────────────────────────────────

  const totalCountries = new Set(universities.map((u) => u.country)).size
  const avgQsRanking =
    universities.length > 0
      ? Math.round(
          universities
            .filter((u) => u.rankingQS !== null)
            .reduce((sum, u) => sum + (u.rankingQS ?? 0), 0) /
            universities.filter((u) => u.rankingQS !== null).length
        )
      : 0

  // ─── Render: Universities Tab ─────────────────────────────────────────────

  function renderUniversities() {
    if (selectedUniversity) {
      return (
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedUniversity(null)}
            className="gap-1.5 text-[#64748B] hover:text-[#1E293B]"
          >
            ← Back to list
          </Button>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl">{selectedUniversity.name}</CardTitle>
                  <p className="text-sm text-[#64748B] mt-1">
                    {selectedUniversity.city}, {selectedUniversity.country}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge className={typeColors[selectedUniversity.type] || ''}>
                    {selectedUniversity.type}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {selectedUniversity.description && (
                <p className="text-sm text-[#475569] leading-relaxed">
                  {selectedUniversity.description}
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-[#F8FAFC]">
                  <p className="text-2xl font-bold text-[#0F172A]">{selectedUniversity.studentCount?.toLocaleString() || '—'}</p>
                  <p className="text-xs text-[#64748B]">Students</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-[#F8FAFC]">
                  <p className="text-2xl font-bold text-[#0F172A]">{selectedUniversity.internationalStudents?.toLocaleString() || '—'}</p>
                  <p className="text-xs text-[#64748B]">International</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-[#F8FAFC]">
                  <p className="text-2xl font-bold text-[#0F172A]">{selectedUniversity._count.courses}</p>
                  <p className="text-xs text-[#64748B]">Courses</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-[#F8FAFC]">
                  <p className="text-2xl font-bold text-[#0F172A]">{selectedUniversity._count.scholarships}</p>
                  <p className="text-xs text-[#64748B]">Scholarships</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-3 text-center">
                  <p className="text-xs text-[#64748B] mb-1">QS Ranking</p>
                  <p className="text-lg font-bold text-[#0F172A]">{selectedUniversity.rankingQS ?? '—'}</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-xs text-[#64748B] mb-1">THE Ranking</p>
                  <p className="text-lg font-bold text-[#0F172A]">{selectedUniversity.rankingTHE ?? '—'}</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-xs text-[#64748B] mb-1">ARWU Ranking</p>
                  <p className="text-lg font-bold text-[#0F172A]">{selectedUniversity.rankingARWU ?? '—'}</p>
                </Card>
              </div>
              <div className="flex items-center gap-4 text-sm text-[#64748B]">
                {selectedUniversity.website && (
                  <a
                    href={selectedUniversity.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[#003ABC] hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Visit Website
                  </a>
                )}
                {selectedUniversity.foundedYear && (
                  <span>Founded {selectedUniversity.foundedYear}</span>
                )}
                {selectedUniversity.acceptanceRate && (
                  <span>Acceptance: {selectedUniversity.acceptanceRate}%</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {/* Stats Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#003ABC]/10">
              <Building2 className="w-5 h-5 text-[#003ABC]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0F172A]">{universities.length}</p>
              <p className="text-xs text-[#64748B]">Total Universities</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#003ABC]/10">
              <Globe className="w-5 h-5 text-[#003ABC]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0F172A]">{totalCountries}</p>
              <p className="text-xs text-[#64748B]">Countries</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#003ABC]/10">
              <Trophy className="w-5 h-5 text-[#003ABC]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0F172A]">{avgQsRanking || '—'}</p>
              <p className="text-xs text-[#64748B]">Avg QS Ranking</p>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <Input
              placeholder="Search universities..."
              value={uniSearch}
              onChange={(e) => setUniSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={uniCountryFilter} onValueChange={setUniCountryFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-[#94A3B8]" />
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {uniCountries.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={uniTypeFilter} onValueChange={setUniTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {uniLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <UniversityCardSkeleton key={i} />
            ))}
          </div>
        ) : uniError ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-red-500">Error: {uniError}</p>
          </Card>
        ) : universities.length === 0 ? (
          <Card className="p-8 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
            <p className="text-sm text-[#64748B]">No universities found matching your filters.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {universities.map((uni) => (
              <Card
                key={uni.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer border border-[#E2E8F0]"
                onClick={() => setSelectedUniversity(uni)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-sm text-[#0F172A] leading-tight line-clamp-2 flex-1 mr-2">
                    {uni.name}
                  </h3>
                  <Badge className={typeColors[uni.type] || ''}>
                    {uni.type}
                  </Badge>
                </div>
                <p className="text-xs text-[#64748B] mb-3 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {uni.city}, {uni.country}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {uni.rankingQS && (
                    <Badge variant="outline" className="text-xs font-medium">
                      QS #{uni.rankingQS}
                    </Badge>
                  )}
                  {uni.rankingTHE && (
                    <Badge variant="outline" className="text-xs font-medium">
                      THE #{uni.rankingTHE}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>{uni.studentCount?.toLocaleString() || '—'} students</span>
                  <span>{uni._count.courses} courses</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Render: Courses Tab ──────────────────────────────────────────────────

  function renderCourses() {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <Input
              placeholder="Search courses or universities..."
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={courseLevelFilter} onValueChange={setCourseLevelFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-[#94A3B8]" />
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="undergraduate">Undergraduate</SelectItem>
              <SelectItem value="postgraduate">Postgraduate</SelectItem>
              <SelectItem value="phd">PhD</SelectItem>
              <SelectItem value="foundation">Foundation</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B] whitespace-nowrap">Max Tuition:</span>
            <Input
              type="number"
              placeholder="e.g. 30000"
              value={courseMaxTuition}
              onChange={(e) => setCourseMaxTuition(e.target.value)}
              className="w-[130px]"
            />
          </div>
        </div>

        <div className="rounded-lg border border-[#E2E8F0] overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            {courseLoading ? (
              <div className="p-4">
                <TableSkeleton rows={8} />
              </div>
            ) : courseError ? (
              <div className="p-8 text-center">
                <p className="text-sm text-red-500">Error: {courseError}</p>
              </div>
            ) : courses.length === 0 ? (
              <div className="p-8 text-center">
                <GraduationCap className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
                <p className="text-sm text-[#64748B]">No courses found matching your filters.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC]">
                    <TableHead className="text-xs font-semibold">Course</TableHead>
                    <TableHead className="text-xs font-semibold">University</TableHead>
                    <TableHead className="text-xs font-semibold hidden md:table-cell">Country</TableHead>
                    <TableHead className="text-xs font-semibold">Level</TableHead>
                    <TableHead className="text-xs font-semibold hidden lg:table-cell">Duration</TableHead>
                    <TableHead className="text-xs font-semibold">Tuition</TableHead>
                    <TableHead className="text-xs font-semibold hidden xl:table-cell">Requirements</TableHead>
                    <TableHead className="text-xs font-semibold hidden lg:table-cell">Intake</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.map((c) => (
                    <TableRow key={c.id} className="hover:bg-[#F8FAFC]">
                      <TableCell className="font-medium text-sm max-w-[200px]">
                        <span className="line-clamp-2">{c.name}</span>
                      </TableCell>
                      <TableCell className="text-sm text-[#475569]">{c.universityName}</TableCell>
                      <TableCell className="text-sm text-[#64748B] hidden md:table-cell">{c.universityCountry}</TableCell>
                      <TableCell>
                        <Badge className={levelColors[c.level] || ''}>{c.level}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-[#64748B] hidden lg:table-cell">{c.duration || '—'}</TableCell>
                      <TableCell className="text-sm font-medium">{formatCurrency(c.tuitionFeeUSD)}</TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(c.entryRequirements || []).slice(0, 2).map((req, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {req}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-[#64748B] hidden lg:table-cell">
                        {(c.intakeMonths || []).join(', ') || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Render: Scholarships Tab ──────────────────────────────────────────────

  function renderScholarships() {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <Input
              placeholder="Search scholarships or universities..."
              value={scholarshipSearch}
              onChange={(e) => setScholarshipSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={scholarshipTypeFilter} onValueChange={setScholarshipTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-[#94A3B8]" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="merit">Merit</SelectItem>
              <SelectItem value="need">Need</SelectItem>
              <SelectItem value="research">Research</SelectItem>
              <SelectItem value="sports">Sports</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scholarshipCoverageFilter} onValueChange={setScholarshipCoverageFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Coverage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Coverage</SelectItem>
              <SelectItem value="full">Full</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="tuition_only">Tuition Only</SelectItem>
              <SelectItem value="living_only">Living Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scholarshipLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <UniversityCardSkeleton key={i} />
            ))}
          </div>
        ) : scholarshipError ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-red-500">Error: {scholarshipError}</p>
          </Card>
        ) : scholarships.length === 0 ? (
          <Card className="p-8 text-center">
            <Award className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
            <p className="text-sm text-[#64748B]">No scholarships found matching your filters.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {scholarships.map((s) => (
              <Card key={s.id} className="p-4 hover:shadow-md transition-shadow border border-[#E2E8F0]">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-sm text-[#0F172A] leading-tight line-clamp-2 flex-1 mr-2">
                    {s.name}
                  </h3>
                  <Badge className={coverageColors[s.coverage] || ''}>
                    {s.coverage.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-xs text-[#64748B] mb-3">{s.universityName}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <Badge className={scholarshipTypeColors[s.type] || ''}>{s.type}</Badge>
                  {s.amountUSD !== null && s.amountUSD !== undefined && (
                    <Badge variant="outline" className="font-medium">
                      {formatCurrency(s.amountUSD)}
                    </Badge>
                  )}
                </div>
                {s.eligibility && s.eligibility.length > 0 && (
                  <ul className="space-y-1 mb-3">
                    {s.eligibility.slice(0, 3).map((item, i) => (
                      <li key={i} className="text-xs text-[#475569] flex items-start gap-1.5">
                        <span className="text-[#94A3B8] mt-0.5">•</span>
                        <span className="line-clamp-1">{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {s.deadline && (
                  <p className="text-xs text-[#64748B]">
                    Deadline: <span className="font-medium text-[#0F172A]">{formatDate(s.deadline)}</span>
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Render: Accommodation Tab ─────────────────────────────────────────────

  function renderAccommodation() {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <Input
              placeholder="Search accommodation or universities..."
              value={accSearch}
              onChange={(e) => setAccSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={accTypeFilter} onValueChange={setAccTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-[#94A3B8]" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="halls">Halls</SelectItem>
              <SelectItem value="apartments">Apartments</SelectItem>
              <SelectItem value="homestay">Homestay</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B] whitespace-nowrap">Max $/week:</span>
            <Input
              type="number"
              placeholder="e.g. 300"
              value={accMaxCost}
              onChange={(e) => setAccMaxCost(e.target.value)}
              className="w-[120px]"
            />
          </div>
        </div>

        <div className="rounded-lg border border-[#E2E8F0] overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            {accLoading ? (
              <div className="p-4">
                <TableSkeleton rows={8} />
              </div>
            ) : accError ? (
              <div className="p-8 text-center">
                <p className="text-sm text-red-500">Error: {accError}</p>
              </div>
            ) : accommodations.length === 0 ? (
              <div className="p-8 text-center">
                <Home className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
                <p className="text-sm text-[#64748B]">No accommodation found matching your filters.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC]">
                    <TableHead className="text-xs font-semibold">Name</TableHead>
                    <TableHead className="text-xs font-semibold">University</TableHead>
                    <TableHead className="text-xs font-semibold">Type</TableHead>
                    <TableHead className="text-xs font-semibold">Cost/Week</TableHead>
                    <TableHead className="text-xs font-semibold hidden md:table-cell">Capacity</TableHead>
                    <TableHead className="text-xs font-semibold hidden lg:table-cell">Amenities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accommodations.map((a) => (
                    <TableRow key={a.id} className="hover:bg-[#F8FAFC]">
                      <TableCell className="font-medium text-sm max-w-[180px]">
                        <span className="line-clamp-2">{a.name}</span>
                      </TableCell>
                      <TableCell className="text-sm text-[#475569]">{a.universityName}</TableCell>
                      <TableCell>
                        <Badge className={accommodationTypeColors[a.type] || ''}>{a.type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{formatCurrency(a.costPerWeekUSD)}</TableCell>
                      <TableCell className="text-sm text-[#64748B] hidden md:table-cell">
                        {a.capacity ? `${a.capacity} beds` : '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(a.amenities || []).slice(0, 4).map((amenity, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {amenity}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Render: Rankings Tab ──────────────────────────────────────────────────

  function renderRankings() {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#E2E8F0] overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            {rankLoading ? (
              <div className="p-4">
                <TableSkeleton rows={10} />
              </div>
            ) : rankError ? (
              <div className="p-8 text-center">
                <p className="text-sm text-red-500">Error: {rankError}</p>
              </div>
            ) : rankings.length === 0 ? (
              <div className="p-8 text-center">
                <Trophy className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
                <p className="text-sm text-[#64748B]">No ranking data available.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC]">
                    <TableHead className="text-xs font-semibold w-[60px]">#</TableHead>
                    <TableHead className="text-xs font-semibold">University</TableHead>
                    <TableHead className="text-xs font-semibold hidden md:table-cell">Country</TableHead>
                    <TableHead className="text-xs font-semibold">QS</TableHead>
                    <TableHead className="text-xs font-semibold hidden lg:table-cell">THE</TableHead>
                    <TableHead className="text-xs font-semibold hidden xl:table-cell">ARWU</TableHead>
                    <TableHead className="text-xs font-semibold hidden md:table-cell">Students</TableHead>
                    <TableHead className="text-xs font-semibold hidden lg:table-cell">Intl %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankings.map((uni, index) => {
                    const rank = index + 1
                    const medalStyle =
                      rank === 1
                        ? 'bg-yellow-50 border-l-4 border-l-yellow-400'
                        : rank === 2
                          ? 'bg-gray-50 border-l-4 border-l-gray-400'
                          : rank === 3
                            ? 'bg-amber-50 border-l-4 border-l-amber-600'
                            : ''
                    const medalIcon =
                      rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
                    return (
                      <TableRow key={uni.id} className={`hover:bg-[#F8FAFC] ${medalStyle}`}>
                        <TableCell className="font-bold text-sm">
                          {medalIcon ? <span className="mr-1">{medalIcon}</span> : null}
                          {rank}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{uni.name}</TableCell>
                        <TableCell className="text-sm text-[#64748B] hidden md:table-cell">{uni.country}</TableCell>
                        <TableCell className="text-sm font-semibold">{uni.rankingQS ?? '—'}</TableCell>
                        <TableCell className="text-sm text-[#475569] hidden lg:table-cell">{uni.rankingTHE ?? '—'}</TableCell>
                        <TableCell className="text-sm text-[#475569] hidden xl:table-cell">{uni.rankingARWU ?? '—'}</TableCell>
                        <TableCell className="text-sm text-[#64748B] hidden md:table-cell">
                          {uni.studentCount?.toLocaleString() || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-[#64748B] hidden lg:table-cell">
                          {uni.internationalStudents && uni.studentCount
                            ? `${Math.round((uni.internationalStudents / uni.studentCount) * 100)}%`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Main Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-[#003ABC]" />
          University Directory
        </h2>
        <p className="text-sm text-[#64748B] mt-1">
          Explore universities, courses, scholarships, accommodation, and worldwide rankings.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="universities" className="gap-1.5 text-xs sm:text-sm">
            <Building2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Universities</span>
          </TabsTrigger>
          <TabsTrigger value="courses" className="gap-1.5 text-xs sm:text-sm">
            <GraduationCap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Courses</span>
          </TabsTrigger>
          <TabsTrigger value="scholarships" className="gap-1.5 text-xs sm:text-sm">
            <Award className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Scholarships</span>
          </TabsTrigger>
          <TabsTrigger value="accommodation" className="gap-1.5 text-xs sm:text-sm">
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Accommodation</span>
          </TabsTrigger>
          <TabsTrigger value="rankings" className="gap-1.5 text-xs sm:text-sm">
            <Trophy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rankings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="universities">{renderUniversities()}</TabsContent>
        <TabsContent value="courses">{renderCourses()}</TabsContent>
        <TabsContent value="scholarships">{renderScholarships()}</TabsContent>
        <TabsContent value="accommodation">{renderAccommodation()}</TabsContent>
        <TabsContent value="rankings">{renderRankings()}</TabsContent>
      </Tabs>
    </div>
  )
}
