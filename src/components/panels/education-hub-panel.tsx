'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen,
  GraduationCap,
  Users,
  Star,
  Play,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Search,
  Mic,
  Globe,
  FileText,
  ClipboardList,
  Award,
  BarChart3,
  Timer,
  MessageSquare,
  Sparkles,
  ChevronRight,
  AlertCircle,
  TrendingUp,
  Target,
  Headphones,
  PenTool,
  Video,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AITutor {
  id: string
  name: string
  subject: string
  level: 'beginner' | 'intermediate' | 'advanced'
  studentCount: number
  rating: number
  avatar?: string
  specialties: string[]
  availability: 'online' | 'offline' | 'busy'
}

interface Course {
  id: string
  title: string
  subject: string
  level: 'beginner' | 'intermediate' | 'advanced'
  description: string
  modules: string[]
  progress: number
  studentCount: number
  rating: number
  createdAt: string
}

interface Classroom {
  id: string
  subject: string
  teacher: string
  studentCount: number
  schedule: string
  duration: string
  status: 'active' | 'scheduled' | 'ended'
  topic: string
}

interface Assignment {
  id: string
  title: string
  subject: string
  dueDate: string
  status: 'open' | 'closed' | 'grading' | 'graded'
  submissionsCount: number
  totalStudents: number
  autoGrading: boolean
  gradingProgress: number
}

interface Exam {
  id: string
  title: string
  subject: string
  duration: string
  questionCount: number
  passingScore: number
  avgScore: number
  totalTaken: number
  status: 'upcoming' | 'in_progress' | 'completed'
  scheduledDate: string
}

interface SpeakingSession {
  id: string
  language: string
  topic: string
  level: 'beginner' | 'intermediate' | 'advanced'
  pronunciationScore: number
  fluencyScore: number
  overallScore: number
  duration: string
  date: string
}

interface EducationHubData {
  tutors: AITutor[]
  courses: Course[]
  classrooms: Classroom[]
  assignments: Assignment[]
  exams: Exam[]
  speakingSessions: SpeakingSession[]
  stats: {
    totalStudents: number
    activeTutors: number
    coursesCount: number
    avgRating: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const subjectColors: Record<string, string> = {
  Math: 'bg-blue-100 text-blue-700 border-blue-200',
  Physics: 'bg-purple-100 text-purple-700 border-purple-200',
  'Computer Science': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  English: 'bg-amber-100 text-amber-700 border-amber-200',
  Bangla: 'bg-rose-100 text-rose-700 border-rose-200',
  Chemistry: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Biology: 'bg-green-100 text-green-700 border-green-200',
  History: 'bg-orange-100 text-orange-700 border-orange-200',
  Arabic: 'bg-teal-100 text-teal-700 border-teal-200',
  General: 'bg-slate-100 text-slate-700 border-slate-200',
}

const subjectIcons: Record<string, React.ElementType> = {
  Math: BarChart3,
  Physics: Zap,
  'Computer Science': Sparkles,
  English: MessageSquare,
  Bangla: Globe,
  Chemistry: FlaskConical,
  Biology: Leaf,
  History: BookOpen,
  Arabic: Globe,
  General: BookOpen,
}

const levelColors: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700 border-green-200',
  intermediate: 'bg-amber-100 text-amber-700 border-amber-200',
  advanced: 'bg-red-100 text-red-700 border-red-200',
}

const levelLabels: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

const classroomStatusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
  ended: 'bg-slate-100 text-slate-500 border-slate-200',
}

const assignmentStatusColors: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-500 border-slate-200',
  grading: 'bg-amber-100 text-amber-700 border-amber-200',
  graded: 'bg-blue-100 text-blue-700 border-blue-200',
}

const examStatusColors: Record<string, string> = {
  upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const languageColors: Record<string, string> = {
  English: 'bg-blue-100 text-blue-700 border-blue-200',
  Bangla: 'bg-rose-100 text-rose-700 border-rose-200',
  Arabic: 'bg-teal-100 text-teal-700 border-teal-200',
  Spanish: 'bg-orange-100 text-orange-700 border-orange-200',
  French: 'bg-purple-100 text-purple-700 border-purple-200',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function renderStars(rating: number) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`size-3.5 ${s <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
        />
      ))}
      <span className="ml-1 text-xs text-slate-500 font-medium">{rating.toFixed(1)}</span>
    </div>
  )
}

function SpeakingLevelIndicator({ score }: { score: number }) {
  let level = 'Beginner'
  let color = 'text-green-600'
  let bgColor = 'bg-green-100'
  if (score >= 80) { level = 'Advanced'; color = 'text-purple-600'; bgColor = 'bg-purple-100' }
  else if (score >= 60) { level = 'Intermediate'; color = 'text-amber-600'; bgColor = 'bg-amber-100' }
  else if (score >= 40) { level = 'Elementary'; color = 'text-blue-600'; bgColor = 'bg-blue-100' }

  return (
    <div className="flex items-center gap-2">
      <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${bgColor} ${color}`}>
        {level}
      </div>
      <div className="w-20">
        <Progress value={score} className="h-2" />
      </div>
      <span className="text-xs font-semibold text-slate-600">{score}%</span>
    </div>
  )
}

function FlaskConical(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 3h6"/><path d="M10 9V3h4v6l5 8.5a2 2 0 0 1-1.7 3H6.7a2 2 0 0 1-1.7-3L10 9Z"/>
    </svg>
  )
}

function Leaf(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
    </svg>
  )
}

// Unwraps a value that may be a paginated object { data: T[], pagination } or a plain array T[]
function unwrapPaginated<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object' && 'data' in (value as Record<string, unknown>)) {
    const inner = (value as { data: unknown }).data
    if (Array.isArray(inner)) return inner as T[]
  }
  return []
}

const EMPTY_DATA: EducationHubData = {
  tutors: [],
  courses: [],
  classrooms: [],
  assignments: [],
  exams: [],
  speakingSessions: [],
  stats: { totalStudents: 0, activeTutors: 0, coursesCount: 0, avgRating: 0 },
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EducationHubPanel() {
  const [data, setData] = useState<EducationHubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('__all__')

  // Dialog states
  const [createCourseOpen, setCreateCourseOpen] = useState(false)
  const [createAssignmentOpen, setCreateAssignmentOpen] = useState(false)
  const [scheduleExamOpen, setScheduleExamOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // New course form
  const [newCourse, setNewCourse] = useState({
    title: '',
    subject: 'Math',
    level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    description: '',
    modulesText: '',
  })

  // New assignment form
  const [newAssignment, setNewAssignment] = useState({
    title: '',
    subject: 'Math',
    dueDate: '',
    autoGrading: true,
  })

  // New exam form
  const [newExam, setNewExam] = useState({
    title: '',
    subject: 'Math',
    duration: '60',
    questionCount: '30',
    passingScore: '60',
    scheduledDate: '',
  })

  // Speaking language
  const [selectedLanguage, setSelectedLanguage] = useState('English')

  const fetchData = useCallback(async () => {
    let cancelled = false
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/education-hub')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!cancelled) {
        const raw = (json.data || {}) as Record<string, unknown>
        const normalized: EducationHubData = {
          tutors: unwrapPaginated<AITutor>(raw.tutors),
          courses: unwrapPaginated<Course>(raw.courses),
          classrooms: unwrapPaginated<Classroom>(raw.classrooms),
          assignments: unwrapPaginated<Assignment>(raw.assignments),
          exams: unwrapPaginated<Exam>(raw.exams),
          speakingSessions: unwrapPaginated<SpeakingSession>(raw.speakingSessions),
          stats: (raw.stats as EducationHubData['stats']) || EMPTY_DATA.stats,
        }
        setData(normalized)
      }
    } catch (err) {
      if (!cancelled) {
        setData(null)
        setError(err instanceof Error ? err.message : 'Failed to load education data')
      }
    } finally {
      if (!cancelled) setLoading(false)
    }
    return () => { cancelled = true }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Filter helpers
  const filteredTutors = (data?.tutors || []).filter((t) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase())
    const matchSubject = subjectFilter === '__all__' || t.subject === subjectFilter
    return matchSearch && matchSubject
  })

  const filteredCourses = (data?.courses || []).filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.subject.toLowerCase().includes(search.toLowerCase())
    const matchSubject = subjectFilter === '__all__' || c.subject === subjectFilter
    return matchSearch && matchSubject
  })

  const filteredClassrooms = (data?.classrooms || []).filter((c) => {
    const matchSearch = !search || c.topic.toLowerCase().includes(search.toLowerCase()) || c.subject.toLowerCase().includes(search.toLowerCase())
    const matchSubject = subjectFilter === '__all__' || c.subject === subjectFilter
    return matchSearch && matchSubject
  })

  const filteredAssignments = (data?.assignments || []).filter((a) => {
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.subject.toLowerCase().includes(search.toLowerCase())
    const matchSubject = subjectFilter === '__all__' || a.subject === subjectFilter
    return matchSearch && matchSubject
  })

  const filteredExams = (data?.exams || []).filter((e) => {
    const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.subject.toLowerCase().includes(search.toLowerCase())
    const matchSubject = subjectFilter === '__all__' || e.subject === subjectFilter
    return matchSearch && matchSubject
  })

  const filteredSpeakingSessions = (data?.speakingSessions || []).filter((s) => {
    const matchSearch = !search || s.topic.toLowerCase().includes(search.toLowerCase())
    const matchLang = selectedLanguage === '__all__' || s.language === selectedLanguage
    return matchSearch && matchLang
  })

  const allSubjects = [...new Set([
    ...(data?.tutors || []).map(t => t.subject),
    ...(data?.courses || []).map(c => c.subject),
    ...(data?.classrooms || []).map(c => c.subject),
    ...(data?.assignments || []).map(a => a.subject),
    ...(data?.exams || []).map(e => e.subject),
  ])].filter(Boolean).sort()

  const allLanguages = [...new Set((data?.speakingSessions || []).map(s => s.language))].filter(Boolean).sort()

  // Handle creates
  const handleCreateCourse = async () => {
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 800))
    setSubmitting(false)
    setCreateCourseOpen(false)
    setNewCourse({ title: '', subject: 'Math', level: 'beginner', description: '', modulesText: '' })
  }

  const handleCreateAssignment = async () => {
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 800))
    setSubmitting(false)
    setCreateAssignmentOpen(false)
    setNewAssignment({ title: '', subject: 'Math', dueDate: '', autoGrading: true })
  }

  const handleScheduleExam = async () => {
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 800))
    setSubmitting(false)
    setScheduleExamOpen(false)
    setNewExam({ title: '', subject: 'Math', duration: '60', questionCount: '30', passingScore: '60', scheduledDate: '' })
  }

  // ─── Loading State ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <Skeleton className="h-10 w-full mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Students</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{data.stats.totalStudents.toLocaleString()}</p>
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><TrendingUp className="size-3" /> +12% this month</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users className="size-5 text-[#003ABC]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Tutors</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{data.stats.activeTutors}</p>
              <p className="text-xs text-slate-500 mt-1">Online now</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
              <GraduationCap className="size-5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Courses</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{data.stats.coursesCount}</p>
              <p className="text-xs text-slate-500 mt-1">Available courses</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
              <BookOpen className="size-5 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Rating</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{data.stats.avgRating}</p>
              <div className="flex items-center gap-0.5 mt-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`size-3 ${s <= Math.round(data.stats.avgRating) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
                ))}
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center">
              <Award className="size-5 text-[#FF6A00]" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Bar ── */}
      <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              placeholder="Search tutors, courses, assignments..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-full sm:w-48 h-9">
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Subjects</SelectItem>
              {allSubjects.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="tutors" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-white border border-slate-100 rounded-xl shadow-sm">
          <TabsTrigger value="tutors" className="gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white data-[state=active]:shadow-sm">
            <GraduationCap className="size-4" />
            <span className="hidden sm:inline">AI Tutor</span>
            <span className="sm:hidden">Tutor</span>
          </TabsTrigger>
          <TabsTrigger value="courses" className="gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white data-[state=active]:shadow-sm">
            <BookOpen className="size-4" />
            <span className="hidden sm:inline">Course Builder</span>
            <span className="sm:hidden">Courses</span>
          </TabsTrigger>
          <TabsTrigger value="classroom" className="gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white data-[state=active]:shadow-sm">
            <Video className="size-4" />
            <span className="hidden sm:inline">AI Classroom</span>
            <span className="sm:hidden">Class</span>
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white data-[state=active]:shadow-sm">
            <ClipboardList className="size-4" />
            <span className="hidden sm:inline">Assignments</span>
            <span className="sm:hidden">Work</span>
          </TabsTrigger>
          <TabsTrigger value="exams" className="gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white data-[state=active]:shadow-sm">
            <FileText className="size-4" />
            <span className="hidden sm:inline">Exams</span>
            <span className="sm:hidden">Exam</span>
          </TabsTrigger>
          <TabsTrigger value="speaking" className="gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-lg data-[state=active]:bg-[#003ABC] data-[state=active]:text-white data-[state=active]:shadow-sm">
            <Mic className="size-4" />
            <span className="hidden sm:inline">Speaking Coach</span>
            <span className="sm:hidden">Speak</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════ Tab 1: AI Tutor ═══════════════════ */}
        <TabsContent value="tutors">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTutors.map(tutor => {
              const SubjectIcon = subjectIcons[tutor.subject] || BookOpen
              return (
                <div key={tutor.id} className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-5 group">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${subjectColors[tutor.subject] || subjectColors.General}`}>
                      <SubjectIcon className="size-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 text-sm truncate">{tutor.name}</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          tutor.availability === 'online' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          tutor.availability === 'busy' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tutor.availability === 'online' ? 'bg-emerald-500' : tutor.availability === 'busy' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                          {tutor.availability}
                        </span>
                      </div>
                      <Badge variant="outline" className={`mt-1.5 text-[10px] ${subjectColors[tutor.subject] || subjectColors.General}`}>
                        {tutor.subject}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tutor.specialties.map(s => (
                      <span key={s} className="text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md">{s}</span>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <Badge variant="outline" className={`text-[10px] ${levelColors[tutor.level]}`}>
                      {levelLabels[tutor.level]}
                    </Badge>
                    {renderStars(tutor.rating)}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Users className="size-3.5" />
                      <span>{tutor.studentCount} students</span>
                    </div>
                    <Button
                      size="sm"
                      disabled={tutor.availability === 'offline'}
                      className="h-8 text-xs bg-[#003ABC] hover:bg-[#002D99] text-white gap-1.5"
                    >
                      <Play className="size-3.5" />
                      Start Session
                    </Button>
                  </div>
                </div>
              )
            })}
            {filteredTutors.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400">
                <GraduationCap className="size-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No tutors found matching your search.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════ Tab 2: Course Builder ═══════════════════ */}
        <TabsContent value="courses">
          <div className="flex justify-end mb-4">
            <Dialog open={createCourseOpen} onOpenChange={setCreateCourseOpen}>
              <DialogTrigger asChild>
                <Button className="h-9 text-xs bg-[#003ABC] hover:bg-[#002D99] text-white gap-1.5">
                  <Plus className="size-3.5" />
                  Create Course
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-[#1E293B]">Create New Course</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <Label className="text-xs font-medium text-slate-700">Course Title</Label>
                    <Input
                      placeholder="e.g., Introduction to Calculus"
                      value={newCourse.title}
                      onChange={e => setNewCourse(p => ({ ...p, title: e.target.value }))}
                      className="mt-1.5 h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Subject</Label>
                      <Select value={newCourse.subject} onValueChange={v => setNewCourse(p => ({ ...p, subject: v }))}>
                        <SelectTrigger className="mt-1.5 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Level</Label>
                      <Select value={newCourse.level} onValueChange={v => setNewCourse(p => ({ ...p, level: v as 'beginner' | 'intermediate' | 'advanced' }))}>
                        <SelectTrigger className="mt-1.5 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-700">Description</Label>
                    <Textarea
                      placeholder="Course description..."
                      value={newCourse.description}
                      onChange={e => setNewCourse(p => ({ ...p, description: e.target.value }))}
                      className="mt-1.5 min-h-[80px]"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-slate-700">Modules (one per line)</Label>
                    <Textarea
                      placeholder="Module 1: Introduction&#10;Module 2: Fundamentals&#10;Module 3: Advanced Topics"
                      value={newCourse.modulesText}
                      onChange={e => setNewCourse(p => ({ ...p, modulesText: e.target.value }))}
                      className="mt-1.5 min-h-[80px]"
                    />
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <DialogClose asChild>
                    <Button variant="outline" className="h-9 text-xs">Cancel</Button>
                  </DialogClose>
                  <Button onClick={handleCreateCourse} disabled={submitting || !newCourse.title} className="h-9 text-xs bg-[#003ABC] hover:bg-[#002D99] text-white">
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    Create Course
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredCourses.map(course => (
              <div key={course.id} className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden group">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 text-sm truncate">{course.title}</h3>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${subjectColors[course.subject] || subjectColors.General}`}>
                          {course.subject}
                        </Badge>
                      </div>
                      <Badge variant="outline" className={`mt-1.5 text-[10px] ${levelColors[course.level]}`}>
                        {levelLabels[course.level]}
                      </Badge>
                    </div>
                    {renderStars(course.rating)}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">{course.description}</p>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500">Progress</span>
                      <span className="font-semibold text-[#003ABC]">{course.progress}%</span>
                    </div>
                    <Progress value={course.progress} className="h-2" />
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Users className="size-3" /> {course.studentCount} students</span>
                    <span className="flex items-center gap-1"><Calendar className="size-3" /> {formatDate(course.createdAt)}</span>
                  </div>
                </div>

                <div className="border-t border-slate-50 bg-slate-50/50 px-5 py-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Modules</p>
                  <div className="flex flex-wrap gap-1.5">
                    {course.modules.map((m, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                        <span className="w-3.5 h-3.5 rounded-full bg-[#003ABC] text-white flex items-center justify-center text-[8px] font-bold">{i + 1}</span>
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {filteredCourses.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400">
                <BookOpen className="size-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No courses found matching your search.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════ Tab 3: AI Classroom ═══════════════════ */}
        <TabsContent value="classroom">
          <div className="space-y-3">
            {/* Status summary bar */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-700">
                  {data.classrooms.filter(c => c.status === 'active').length} Active
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                <Clock className="size-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700">
                  {data.classrooms.filter(c => c.status === 'scheduled').length} Scheduled
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                <CheckCircle2 className="size-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-600">
                  {data.classrooms.filter(c => c.status === 'ended').length} Ended
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredClassrooms.map(cls => {
                const SubjectIcon = subjectIcons[cls.subject] || BookOpen
                return (
                  <div key={cls.id} className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-5 relative overflow-hidden">
                    {cls.status === 'active' && (
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-300" />
                    )}
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${subjectColors[cls.subject] || subjectColors.General}`}>
                        <SubjectIcon className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${classroomStatusColors[cls.status]}`}>
                            {cls.status === 'active' ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" /> : null}
                            {cls.status.charAt(0).toUpperCase() + cls.status.slice(1)}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] ${subjectColors[cls.subject] || subjectColors.General}`}>
                            {cls.subject}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-slate-900 text-sm mt-1.5 truncate">{cls.topic}</h3>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <GraduationCap className="size-3.5 text-slate-400" />
                        <span>{cls.teacher}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Calendar className="size-3.5 text-slate-400" />
                        <span>{cls.schedule}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Timer className="size-3.5 text-slate-400" />
                        <span>{cls.duration}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Users className="size-3.5" />
                        <span>{cls.studentCount} students</span>
                      </div>
                      {cls.status !== 'ended' && (
                        <Button
                          size="sm"
                          variant={cls.status === 'active' ? 'default' : 'outline'}
                          className={`h-8 text-xs gap-1.5 ${
                            cls.status === 'active'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'border-[#003ABC] text-[#003ABC] hover:bg-[#003ABC] hover:text-white'
                          }`}
                        >
                          {cls.status === 'active' ? (
                            <><Video className="size-3.5" /> Join Now</>
                          ) : (
                            <><Calendar className="size-3.5" /> View Schedule</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
              {filteredClassrooms.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400">
                  <Video className="size-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No classrooms found matching your search.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════ Tab 4: Assignments ═══════════════════ */}
        <TabsContent value="assignments">
          <div className="flex justify-end mb-4">
            <Dialog open={createAssignmentOpen} onOpenChange={setCreateAssignmentOpen}>
              <DialogTrigger asChild>
                <Button className="h-9 text-xs bg-[#FF6A00] hover:bg-[#E05E00] text-white gap-1.5">
                  <Plus className="size-3.5" />
                  Create Assignment
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-[#1E293B]">Create Assignment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <Label className="text-xs font-medium text-slate-700">Title</Label>
                    <Input
                      placeholder="e.g., Problem Set 5"
                      value={newAssignment.title}
                      onChange={e => setNewAssignment(p => ({ ...p, title: e.target.value }))}
                      className="mt-1.5 h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Subject</Label>
                      <Select value={newAssignment.subject} onValueChange={v => setNewAssignment(p => ({ ...p, subject: v }))}>
                        <SelectTrigger className="mt-1.5 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Due Date</Label>
                      <Input
                        type="date"
                        value={newAssignment.dueDate}
                        onChange={e => setNewAssignment(p => ({ ...p, dueDate: e.target.value }))}
                        className="mt-1.5 h-9"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="autoGrading"
                      checked={newAssignment.autoGrading}
                      onChange={e => setNewAssignment(p => ({ ...p, autoGrading: e.target.checked }))}
                      className="rounded border-slate-300"
                    />
                    <Label htmlFor="autoGrading" className="text-xs font-medium text-slate-700">Enable Auto-Grading</Label>
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <DialogClose asChild>
                    <Button variant="outline" className="h-9 text-xs">Cancel</Button>
                  </DialogClose>
                  <Button onClick={handleCreateAssignment} disabled={submitting || !newAssignment.title} className="h-9 text-xs bg-[#FF6A00] hover:bg-[#E05E00] text-white">
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    Create Assignment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              {filteredAssignments.map((assignment, i) => (
                <div key={assignment.id} className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${i > 0 ? 'border-t border-slate-50' : ''}`}>
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${subjectColors[assignment.subject] || subjectColors.General}`}>
                      <PenTool className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 text-sm truncate">{assignment.title}</h3>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${assignmentStatusColors[assignment.status]}`}>
                          {assignment.status === 'grading' && <Loader2 className="size-3 mr-1 animate-spin" />}
                          {assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1).replace('_', ' ')}
                        </Badge>
                        {assignment.autoGrading && (
                          <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-600 border-purple-200">
                            <Zap className="size-3 mr-0.5" /> Auto-Grade
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Calendar className="size-3" /> Due: {formatDate(assignment.dueDate)}</span>
                        <span className="flex items-center gap-1"><Users className="size-3" /> {assignment.submissionsCount}/{assignment.totalStudents} submitted</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    {assignment.status === 'grading' ? (
                      <div className="w-24">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                          <span>Grading</span>
                          <span className="font-semibold">{assignment.gradingProgress}%</span>
                        </div>
                        <Progress value={assignment.gradingProgress} className="h-1.5" />
                      </div>
                    ) : assignment.status === 'graded' ? (
                      <div className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="size-3.5" />
                        <span>Complete</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="size-3.5" />
                        <span>Open</span>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-[#003ABC] hover:bg-blue-50 gap-1"
                    >
                      View <ChevronRight className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredAssignments.length === 0 && (
                <div className="py-12 text-center text-slate-400">
                  <ClipboardList className="size-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No assignments found matching your search.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════ Tab 5: Exams ═══════════════════ */}
        <TabsContent value="exams">
          <div className="flex justify-end mb-4">
            <Dialog open={scheduleExamOpen} onOpenChange={setScheduleExamOpen}>
              <DialogTrigger asChild>
                <Button className="h-9 text-xs bg-[#003ABC] hover:bg-[#002D99] text-white gap-1.5">
                  <Plus className="size-3.5" />
                  Schedule Exam
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-[#1E293B]">Schedule New Exam</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <Label className="text-xs font-medium text-slate-700">Exam Title</Label>
                    <Input
                      placeholder="e.g., Midterm: Physics"
                      value={newExam.title}
                      onChange={e => setNewExam(p => ({ ...p, title: e.target.value }))}
                      className="mt-1.5 h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Subject</Label>
                      <Select value={newExam.subject} onValueChange={v => setNewExam(p => ({ ...p, subject: v }))}>
                        <SelectTrigger className="mt-1.5 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Date</Label>
                      <Input
                        type="date"
                        value={newExam.scheduledDate}
                        onChange={e => setNewExam(p => ({ ...p, scheduledDate: e.target.value }))}
                        className="mt-1.5 h-9"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Duration (min)</Label>
                      <Input
                        type="number"
                        value={newExam.duration}
                        onChange={e => setNewExam(p => ({ ...p, duration: e.target.value }))}
                        className="mt-1.5 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Questions</Label>
                      <Input
                        type="number"
                        value={newExam.questionCount}
                        onChange={e => setNewExam(p => ({ ...p, questionCount: e.target.value }))}
                        className="mt-1.5 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-700">Pass Score (%)</Label>
                      <Input
                        type="number"
                        value={newExam.passingScore}
                        onChange={e => setNewExam(p => ({ ...p, passingScore: e.target.value }))}
                        className="mt-1.5 h-9"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <DialogClose asChild>
                    <Button variant="outline" className="h-9 text-xs">Cancel</Button>
                  </DialogClose>
                  <Button onClick={handleScheduleExam} disabled={submitting || !newExam.title} className="h-9 text-xs bg-[#003ABC] hover:bg-[#002D99] text-white">
                    {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    Schedule Exam
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Exam Results Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Target className="size-4 text-emerald-600" />
                <span className="text-xs font-medium text-slate-500">Completed</span>
              </div>
              <p className="text-xl font-bold text-slate-900">{data.exams.filter(e => e.status === 'completed').length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="size-4 text-blue-600" />
                <span className="text-xs font-medium text-slate-500">Upcoming</span>
              </div>
              <p className="text-xl font-bold text-slate-900">{data.exams.filter(e => e.status === 'upcoming').length}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="size-4 text-[#FF6A00]" />
                <span className="text-xs font-medium text-slate-500">Avg Score</span>
              </div>
              <p className="text-xl font-bold text-slate-900">
                {(() => {
                  const completed = data.exams.filter(e => e.status === 'completed' && e.avgScore > 0)
                  return completed.length > 0 ? Math.round(completed.reduce((a, b) => a + b.avgScore, 0) / completed.length) + '%' : 'N/A'
                })()}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {filteredExams.map(exam => (
              <div key={exam.id} className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${subjectColors[exam.subject] || subjectColors.General}`}>
                      <FileText className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 text-sm truncate">{exam.title}</h3>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${examStatusColors[exam.status]}`}>
                          {exam.status === 'in_progress' && <Loader2 className="size-3 mr-1 animate-spin" />}
                          {exam.status === 'upcoming' ? 'Upcoming' : exam.status === 'in_progress' ? 'In Progress' : 'Completed'}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${subjectColors[exam.subject] || subjectColors.General}`}>
                          {exam.subject}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Timer className="size-3" /> {exam.duration}</span>
                        <span className="flex items-center gap-1"><ClipboardList className="size-3" /> {exam.questionCount} questions</span>
                        <span className="flex items-center gap-1"><Target className="size-3" /> Pass: {exam.passingScore}%</span>
                        <span className="flex items-center gap-1"><Calendar className="size-3" /> {formatDate(exam.scheduledDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {exam.status === 'completed' && exam.avgScore > 0 ? (
                      <div className="text-center">
                        <p className="text-xs text-slate-500 mb-0.5">Avg Score</p>
                        <div className={`text-lg font-bold ${exam.avgScore >= exam.passingScore ? 'text-emerald-600' : 'text-red-500'}`}>
                          {exam.avgScore}%
                        </div>
                        <p className="text-[10px] text-slate-400">{exam.totalTaken} taken</p>
                      </div>
                    ) : exam.status === 'upcoming' ? (
                      <Button size="sm" className="h-8 text-xs bg-[#003ABC] hover:bg-[#002D99] text-white gap-1.5">
                        <Calendar className="size-3.5" /> View Details
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600">
                        <AlertCircle className="size-4" />
                        <span>{exam.totalTaken} taking</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredExams.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                <FileText className="size-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No exams found matching your search.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════ Tab 6: Speaking Coach ═══════════════════ */}
        <TabsContent value="speaking">
          <div className="space-y-4">
            {/* Language Selector */}
            <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <Headphones className="size-5 text-[#003ABC]" />
                  <span className="text-sm font-semibold text-slate-900">Practice Language</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 text-xs gap-1.5 rounded-full ${
                      selectedLanguage === 'English' ? 'bg-[#003ABC] text-white border-[#003ABC] hover:bg-[#002D99]' : ''
                    }`}
                    onClick={() => setSelectedLanguage('English')}
                  >
                    <Globe className="size-3" /> English
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 text-xs gap-1.5 rounded-full ${
                      selectedLanguage === 'Bangla' ? 'bg-[#003ABC] text-white border-[#003ABC] hover:bg-[#002D99]' : ''
                    }`}
                    onClick={() => setSelectedLanguage('Bangla')}
                  >
                    <Globe className="size-3" /> বাংলা
                  </Button>
                  {allLanguages.filter(l => l !== 'English' && l !== 'Bangla').map(lang => (
                    <Button
                      key={lang}
                      variant="outline"
                      size="sm"
                      className={`h-8 text-xs gap-1.5 rounded-full ${
                        selectedLanguage === lang ? 'bg-[#003ABC] text-white border-[#003ABC] hover:bg-[#002D99]' : ''
                      }`}
                      onClick={() => setSelectedLanguage(lang)}
                    >
                      <Globe className="size-3" /> {lang}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 text-xs gap-1.5 rounded-full ${
                      selectedLanguage === '__all__' ? 'bg-[#003ABC] text-white border-[#003ABC] hover:bg-[#002D99]' : ''
                    }`}
                    onClick={() => setSelectedLanguage('__all__')}
                  >
                    All
                  </Button>
                </div>
                <div className="sm:ml-auto">
                  <Button aria-label="Start speaking practice session" className="h-8 text-xs bg-[#FF6A00] hover:bg-[#E05E00] text-white gap-1.5">
                    <Mic className="size-3.5" /> Start Practice
                  </Button>
                </div>
              </div>
            </div>

            {/* Speaking Level Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                <p className="text-xs font-medium text-slate-500 mb-2">Pronunciation</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Progress
                      value={(() => {
                        const sessions = filteredSpeakingSessions.length > 0 ? filteredSpeakingSessions : data.speakingSessions
                        return sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + s.pronunciationScore, 0) / sessions.length) : 0
                      })()}
                      className="h-2.5"
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-900">
                    {(() => {
                      const sessions = filteredSpeakingSessions.length > 0 ? filteredSpeakingSessions : data.speakingSessions
                      return sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + s.pronunciationScore, 0) / sessions.length) : 0
                    })()}%
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                <p className="text-xs font-medium text-slate-500 mb-2">Fluency</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Progress
                      value={(() => {
                        const sessions = filteredSpeakingSessions.length > 0 ? filteredSpeakingSessions : data.speakingSessions
                        return sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + s.fluencyScore, 0) / sessions.length) : 0
                      })()}
                      className="h-2.5"
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-900">
                    {(() => {
                      const sessions = filteredSpeakingSessions.length > 0 ? filteredSpeakingSessions : data.speakingSessions
                      return sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + s.fluencyScore, 0) / sessions.length) : 0
                    })()}%
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
                <p className="text-xs font-medium text-slate-500 mb-2">Overall Level</p>
                <SpeakingLevelIndicator
                  score={(() => {
                    const sessions = filteredSpeakingSessions.length > 0 ? filteredSpeakingSessions : data.speakingSessions
                    return sessions.length > 0 ? Math.round(sessions.reduce((a, s) => a + s.overallScore, 0) / sessions.length) : 0
                  })()}
                />
              </div>
            </div>

            {/* Sessions List */}
            <div className="space-y-3">
              {filteredSpeakingSessions.map(session => (
                <div key={session.id} className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${languageColors[session.language] || 'bg-slate-100 text-slate-600'}`}>
                        <Mic className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-900 text-sm">{session.topic}</h3>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${languageColors[session.language] || 'bg-slate-100 text-slate-600'}`}>
                            {session.language}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${levelColors[session.level]}`}>
                            {levelLabels[session.level]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Calendar className="size-3" /> {formatDate(session.date)}</span>
                          <span className="flex items-center gap-1"><Timer className="size-3" /> {session.duration}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 mb-0.5">Pronunciation</p>
                        <p className={`text-sm font-bold ${session.pronunciationScore >= 80 ? 'text-emerald-600' : session.pronunciationScore >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                          {session.pronunciationScore}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 mb-0.5">Fluency</p>
                        <p className={`text-sm font-bold ${session.fluencyScore >= 80 ? 'text-emerald-600' : session.fluencyScore >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                          {session.fluencyScore}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 mb-0.5">Overall</p>
                        <p className={`text-sm font-bold ${session.overallScore >= 80 ? 'text-emerald-600' : session.overallScore >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                          {session.overallScore}%
                        </p>
                      </div>
                      <SpeakingLevelIndicator score={session.overallScore} />
                    </div>
                  </div>
                </div>
              ))}
              {filteredSpeakingSessions.length === 0 && (
                <div className="py-12 text-center text-slate-400">
                  <Mic className="size-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No speaking sessions found.</p>
                  <p className="text-xs mt-1">Try selecting a different language or start a new practice session.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}