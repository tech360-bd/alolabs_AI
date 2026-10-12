'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  GraduationCap,
  Plane,
  Briefcase,
  MessageSquare,
  Code2,
  Trophy,
  Users,
  Calendar,
  Clock,
  Star,
  Target,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Play,
  BarChart3,
  ThumbsUp,
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'

// ── Types ───────────────────────────────────────────────────────────────────

interface InterviewType {
  id: string
  name: string
  icon: string
  description: string
  sessionCount: number
  avgScore: number
  color: string
}

interface InterviewSession {
  id: string
  candidate: string
  type: string
  date: string
  duration: string
  score: number
  status: 'scheduled' | 'completed' | 'cancelled'
  feedback: string | null
}

interface ScoringCriteria {
  id: string
  name: string
  description: string
  maxScore: number
  avgScore: number
  weight: number
}

interface ScoreDistribution {
  label: string
  count: number
  percentage: number
}

interface FeedbackReport {
  id: string
  candidate: string
  type: string
  overallScore: number
  breakdown: { criteria: string; score: number; maxScore: number }[]
  strengths: string[]
  improvements: string[]
  date: string
}

interface PracticeEntry {
  id: string
  type: string
  language: string
  difficulty: string
  score: number
  duration: string
  date: string
}

interface InterviewHubData {
  interviewTypes: InterviewType[]
  sessions: InterviewSession[]
  scoringCriteria: ScoringCriteria[]
  scoreDistribution: ScoreDistribution[]
  feedbackReports: FeedbackReport[]
  practiceHistory: PracticeEntry[]
}

const EMPTY_DATA: InterviewHubData = {
  interviewTypes: [],
  sessions: [],
  scoringCriteria: [],
  scoreDistribution: [],
  feedbackReports: [],
  practiceHistory: [],
}

const ICON_MAP: Record<string, React.ReactNode> = {
  GraduationCap: <GraduationCap className="size-6" />,
  Plane: <Plane className="size-6" />,
  Briefcase: <Briefcase className="size-6" />,
  MessageSquare: <MessageSquare className="size-6" />,
  Code2: <Code2 className="size-6" />,
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
}

// ── Component ───────────────────────────────────────────────────────────────

export default function InterviewHubPanel() {
  const [data, setData] = useState<InterviewHubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [practiceType, setPracticeType] = useState('job')
  const [practiceLang, setPracticeLang] = useState('english')
  const [practiceDifficulty, setPracticeDifficulty] = useState('medium')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/interview-hub')
      const json = await res.json()
      if (json.data) {
        setData(json.data)
      } else {
        setData(EMPTY_DATA)
      }
    } catch {
      setData(EMPTY_DATA)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const hasAnyData = data && (
    data.interviewTypes.length > 0 ||
    data.sessions.length > 0 ||
    data.scoringCriteria.length > 0 ||
    data.scoreDistribution.length > 0 ||
    data.feedbackReports.length > 0 ||
    data.practiceHistory.length > 0
  )

  if (!data || !hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <GraduationCap className="size-12 text-slate-300 mb-4" />
        <h2 className="text-lg font-semibold text-slate-600">No interview data yet</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-md">Start an AI-powered interview session to see your types, scores, and feedback here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">AI Interview Hub</h2>
          <p className="text-sm text-slate-500 mt-1">AI-powered interview preparation, scoring, and feedback</p>
        </div>
        <Button className="bg-[#003ABC] hover:bg-[#002A8F] text-white gap-2">
          <Trophy className="size-4" />
          Start Interview
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="types" className="space-y-4">
        <TabsList className="bg-slate-100 p-1 h-auto flex-wrap">
          <TabsTrigger value="types" className="gap-1.5 text-sm">
            <Target className="size-3.5" /> Interview Types
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-1.5 text-sm">
            <Users className="size-3.5" /> Sessions
          </TabsTrigger>
          <TabsTrigger value="scoring" className="gap-1.5 text-sm">
            <BarChart3 className="size-3.5" /> AI Scoring
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5 text-sm">
            <ThumbsUp className="size-3.5" /> Feedback
          </TabsTrigger>
          <TabsTrigger value="practice" className="gap-1.5 text-sm">
            <Play className="size-3.5" /> Practice
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Interview Types ─────────────────────────────────────── */}
        <TabsContent value="types">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.interviewTypes.map((type) => (
              <Card key={type.id} className="rounded-xl border-slate-200 shadow-sm hover:shadow-md transition-all group cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`size-12 rounded-xl bg-gradient-to-br ${type.color} flex items-center justify-center text-white shrink-0`}>
                      {ICON_MAP[type.icon] || <Target className="size-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[#1E293B] text-sm">{type.name}</h3>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{type.description}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-lg font-bold text-[#1E293B]">{type.sessionCount.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Sessions</p>
                      </div>
                      <div className="w-px h-8 bg-slate-200" />
                      <div className="text-center">
                        <p className="text-lg font-bold text-[#003ABC]">{type.avgScore}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg Score</p>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-slate-300 group-hover:text-[#003ABC] transition-colors" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab 2: Sessions ────────────────────────────────────────────── */}
        <TabsContent value="sessions">
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-[#1E293B] text-lg">Interview Sessions</CardTitle>
                  <CardDescription>{data.sessions.length} total sessions</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select defaultValue="all">
                    <SelectTrigger className="w-36 h-9 text-sm">
                      <SelectValue placeholder="Filter Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="job">Job Interview</SelectItem>
                      <SelectItem value="university">University</SelectItem>
                      <SelectItem value="visa">Visa</SelectItem>
                      <SelectItem value="ielts">IELTS Speaking</SelectItem>
                      <SelectItem value="technical">Technical</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select defaultValue="all">
                    <SelectTrigger className="w-36 h-9 text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="text-xs font-semibold text-slate-600">Candidate</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Type</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Date</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Duration</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Score</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-600">Feedback</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.sessions.map((session) => (
                      <TableRow key={session.id} className="hover:bg-slate-50/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-full bg-gradient-to-br from-[#003ABC] to-[#0066FF] flex items-center justify-center text-white text-xs font-semibold shrink-0">
                              {session.candidate.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-[#1E293B]">{session.candidate}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{session.type}</TableCell>
                        <TableCell className="text-sm text-slate-500">{session.date}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-slate-500">
                            <Clock className="size-3" /> {session.duration}
                          </div>
                        </TableCell>
                        <TableCell>
                          {session.score > 0 ? (
                            <Badge className={`text-[10px] px-2 py-0.5 border-0 ${
                              session.score >= 80 ? 'bg-green-100 text-green-700'
                              : session.score >= 60 ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                            }`}>
                              {session.score}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] px-2 py-0.5 border-0 ${STATUS_STYLES[session.status]}`}>
                            {session.status === 'completed' && <CheckCircle2 className="size-3 mr-0.5" />}
                            {session.status === 'scheduled' && <Calendar className="size-3 mr-0.5" />}
                            {session.status === 'cancelled' && <XCircle className="size-3 mr-0.5" />}
                            {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {session.feedback ? (
                            <p className="text-xs text-slate-500 truncate">{session.feedback}</p>
                          ) : (
                            <span className="text-xs text-slate-400">No feedback</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: AI Scoring ──────────────────────────────────────────── */}
        <TabsContent value="scoring">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Scoring Criteria */}
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-[#1E293B] text-lg">Scoring Criteria</CardTitle>
                <CardDescription>AI evaluates candidates across five key dimensions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.scoringCriteria.map((criteria) => {
                    const pct = Math.round((criteria.avgScore / criteria.maxScore) * 100)
                    return (
                      <div key={criteria.id} className="p-3 rounded-lg bg-slate-50/80">
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            <h4 className="text-sm font-semibold text-[#1E293B]">{criteria.name}</h4>
                            <p className="text-[10px] text-slate-400">{criteria.description}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-[#003ABC]">{criteria.avgScore}</span>
                            <span className="text-xs text-slate-400">/{criteria.maxScore}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Progress value={pct} className="h-2 flex-1" />
                          <span className="text-xs font-medium text-slate-500 w-10 text-right">{pct}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Score Distribution */}
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-[#1E293B] text-lg">Score Distribution</CardTitle>
                <CardDescription>Overall score breakdown across all interviews</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.scoreDistribution.map((dist) => {
                    const maxCount = data.scoreDistribution.length > 0
                      ? Math.max(...data.scoreDistribution.map(d => d.count))
                      : 1
                    const barWidth = (dist.count / maxCount) * 100
                    return (
                      <div key={dist.label} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-600 w-16 text-right shrink-0">{dist.label}</span>
                        <div className="flex-1 h-8 bg-slate-100 rounded-md overflow-hidden relative">
                          <div
                            className={`h-full rounded-md transition-all ${
                              dist.label === '90-100' ? 'bg-gradient-to-r from-[#003ABC] to-[#0066FF]'
                              : dist.label === '80-89' ? 'bg-gradient-to-r from-[#003ABC]/80 to-[#0066FF]/80'
                              : dist.label === '70-79' ? 'bg-gradient-to-r from-[#FF6A00]/80 to-[#FF9A50]/80'
                              : dist.label === '60-69' ? 'bg-gradient-to-r from-[#FF6A00]/60 to-[#FF9A50]/60'
                              : 'bg-gradient-to-r from-slate-300 to-slate-400'
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <div className="w-16 text-right shrink-0">
                          <span className="text-xs font-bold text-[#1E293B]">{dist.count}</span>
                          <span className="text-[10px] text-slate-400 ml-1">({dist.percentage}%)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Total Interviews</span>
                    <span className="text-lg font-bold text-[#1E293B]">
                      {data.scoreDistribution.reduce((sum, d) => sum + d.count, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-slate-500">Average Score</span>
                    <span className="text-lg font-bold text-[#003ABC]">
                      {(() => {
                        const total = data.scoreDistribution.reduce((sum, d) => sum + d.count, 0)
                        if (total === 0) return '0'
                        return (data.scoreDistribution.reduce((sum, d) => {
                          const mid = parseInt(d.label.split('-')[0])
                          return sum + mid * d.count
                        }, 0) / total).toFixed(1)
                      })()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 4: Feedback Reports ────────────────────────────────────── */}
        <TabsContent value="feedback">
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
            {data.feedbackReports.map((report) => (
              <Card key={report.id} className="rounded-xl border-slate-200 shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-gradient-to-br from-[#003ABC] to-[#0066FF] flex items-center justify-center text-white font-semibold">
                        {report.candidate.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-[#1E293B]">{report.candidate}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{report.type}</Badge>
                          <span className="text-xs text-slate-400">{report.date}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-center px-4 py-1.5 bg-slate-50 rounded-lg">
                        <p className="text-xl font-bold text-[#003ABC]">{report.overallScore}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Overall</p>
                      </div>
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {report.breakdown.map((item) => {
                      const pct = Math.round((item.score / item.maxScore) * 100)
                      return (
                        <div key={item.criteria} className="text-center p-2 bg-slate-50 rounded-lg">
                          <Progress value={pct} className="h-1.5 mb-1.5" />
                          <p className="text-xs font-bold text-[#1E293B]">{item.score}</p>
                          <p className="text-[9px] text-slate-400 truncate">{item.criteria}</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Strengths & Improvements */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <ThumbsUp className="size-3.5 text-green-600" />
                        <span className="text-xs font-semibold text-green-700">Strengths</span>
                      </div>
                      <ul className="space-y-1">
                        {report.strengths.map((s, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                            <CheckCircle2 className="size-3 text-green-500 mt-0.5 shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="size-3.5 text-amber-600" />
                        <span className="text-xs font-semibold text-amber-700">Improvements</span>
                      </div>
                      <ul className="space-y-1">
                        {report.improvements.map((s, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                            <Target className="size-3 text-amber-500 mt-0.5 shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab 5: Practice Mode ───────────────────────────────────────── */}
        <TabsContent value="practice">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Practice Setup */}
            <Card className="rounded-xl border-slate-200 shadow-sm lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-[#1E293B] text-lg flex items-center gap-2">
                  <BookOpen className="size-5 text-[#003ABC]" />
                  Practice Setup
                </CardTitle>
                <CardDescription>Configure your practice session</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Interview Type</label>
                  <Select value={practiceType} onValueChange={setPracticeType}>
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="job">Job Interview</SelectItem>
                      <SelectItem value="university">University Admission</SelectItem>
                      <SelectItem value="visa">Visa Interview</SelectItem>
                      <SelectItem value="ielts">IELTS Speaking</SelectItem>
                      <SelectItem value="technical">Technical Interview</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Language</label>
                  <Select value={practiceLang} onValueChange={setPracticeLang}>
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="english">English</SelectItem>
                      <SelectItem value="spanish">Spanish</SelectItem>
                      <SelectItem value="french">French</SelectItem>
                      <SelectItem value="german">German</SelectItem>
                      <SelectItem value="japanese">Japanese</SelectItem>
                      <SelectItem value="hindi">Hindi</SelectItem>
                      <SelectItem value="arabic">Arabic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Difficulty</label>
                  <Select value={practiceDifficulty} onValueChange={setPracticeDifficulty}>
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full bg-[#FF6A00] hover:bg-[#E05E00] text-white gap-2 h-10 mt-2">
                  <Play className="size-4" />
                  Start Practice Session
                </Button>
              </CardContent>
            </Card>

            {/* Practice History */}
            <Card className="rounded-xl border-slate-200 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-[#1E293B] text-lg">Practice History</CardTitle>
                    <CardDescription>{data.practiceHistory.length} recent sessions</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs gap-1">
                    <TrendingUp className="size-3" /> Trending Up
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                  {data.practiceHistory.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="size-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Play className="size-4 text-[#003ABC]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-[#1E293B]">{entry.type}</h4>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{entry.difficulty}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                          <span>{entry.language}</span>
                          <span>•</span>
                          <span>{entry.duration}</span>
                          <span>•</span>
                          <span>{entry.date}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-[#003ABC]">{entry.score}</p>
                        <p className="text-[10px] text-slate-400">Score</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}