'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table'
import {
  Search, Play, BarChart3, Key, FileText, TrendingUp, TrendingDown,
  Minus, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Info,
  ExternalLink, Globe,
} from 'lucide-react'
import { fetchApi } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeoAudit {
  id: string
  url: string
  type: 'full' | 'technical' | 'content'
  score: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  results: {
    performance: number
    accessibility: number
    seo: number
    bestPractices: number
    issues: Array<{ category: string; severity: 'info' | 'warning' | 'error'; message: string }>
  }
  createdAt: string
}

interface SeoKeyword {
  id: string
  keyword: string
  url?: string
  position: number
  previousPosition: number
  searchVolume: number
  difficulty: number
  clickThroughRate: number
  createdAt: string
}

interface SeoReport {
  id: string
  period: 'weekly' | 'monthly'
  label: string
  avgScore: number
  totalKeywords: number
  avgPosition: number
  topMovers: Array<{ keyword: string; change: number }>
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-600'
  if (score >= 70) return 'text-[#003ABC]'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-500'
}

function scoreGaugeColor(score: number): string {
  if (score >= 90) return '#10b981'
  if (score >= 70) return '#003ABC'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 50) return 'Needs Work'
  return 'Poor'
}

function trendIcon(change: number) {
  if (change > 0) return <TrendingUp className="h-4 w-4 text-emerald-600" />
  if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-slate-400" />
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function diffColor(diff: number) {
  if (diff > 0) return 'text-emerald-600'
  if (diff < 0) return 'text-red-500'
  return 'text-slate-400'
}

function difficultyColor(d: number): string {
  if (d >= 70) return 'bg-red-50 text-red-700 border-red-200'
  if (d >= 40) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

// ─── Score Gauge Component ─────────────────────────────────────────────────────

function ScoreGauge({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 10) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const offset = circumference - progress
  const color = scoreGaugeColor(score)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className={`absolute text-sm font-bold ${scoreColor(score)}`}>{score}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SeoPanel() {
  const [activeTab, setActiveTab] = useState('audits')

  // Audits state
  const [audits, setAudits] = useState<SeoAudit[]>([])
  const [auditsLoading, setAuditsLoading] = useState(true)
  const [auditUrl, setAuditUrl] = useState('')
  const [auditType, setAuditType] = useState<'full' | 'technical' | 'content'>('full')
  const [runningAudit, setRunningAudit] = useState(false)

  // Keywords state
  const [keywords, setKeywords] = useState<SeoKeyword[]>([])
  const [keywordsLoading, setKeywordsLoading] = useState(true)

  // Reports state (derived from audit data)
  const [reports, setReports] = useState<SeoReport[]>([])

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchAudits = useCallback(async () => {
    setAuditsLoading(true)
    try {
      const res = await fetchApi<{ data: SeoAudit[] }>('/api/seo?resource=audits&limit=50')
      setAudits(res.data || [])
    } catch {
      setAudits([])
    } finally {
      setAuditsLoading(false)
    }
  }, [])

  const fetchKeywords = useCallback(async () => {
    setKeywordsLoading(true)
    try {
      const res = await fetchApi<{ data: SeoKeyword[] }>('/api/seo?resource=keywords&limit=50')
      setKeywords(res.data || [])
    } catch {
      setKeywords([])
    } finally {
      setKeywordsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAudits() }, [fetchAudits])
  useEffect(() => { fetchKeywords() }, [fetchKeywords])

  // Generate report cards from audit data
  useEffect(() => {
    if (audits.length === 0) { setReports([]); return }
    const now = new Date()
    const weekly: SeoReport = {
      id: 'weekly', period: 'weekly',
      label: `Week of ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      avgScore: Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length),
      totalKeywords: keywords.length,
      avgPosition: keywords.length > 0 ? Math.round(keywords.reduce((s, k) => s + k.position, 0) / keywords.length) : 0,
      topMovers: keywords.slice(0, 3).map(k => ({ keyword: k.keyword, change: k.previousPosition - k.position })),
      createdAt: now.toISOString(),
    }
    const lastMonth = new Date(now); lastMonth.setMonth(lastMonth.getMonth() - 1)
    const monthly: SeoReport = {
      id: 'monthly', period: 'monthly',
      label: `${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      avgScore: Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length),
      totalKeywords: keywords.length,
      avgPosition: keywords.length > 0 ? Math.round(keywords.reduce((s, k) => s + k.position, 0) / keywords.length) : 0,
      topMovers: keywords.slice(0, 5).map(k => ({ keyword: k.keyword, change: k.previousPosition - k.position })),
      createdAt: now.toISOString(),
    }
    setReports([weekly, monthly])
  }, [audits, keywords])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleRunAudit(e: React.FormEvent) {
    e.preventDefault()
    if (!auditUrl.trim()) return
    setRunningAudit(true)
    try {
      await fetchApi('/api/seo', {
        method: 'POST',
        body: JSON.stringify({ url: auditUrl, type: auditType }),
      })
      setAuditUrl('')
      fetchAudits()
      fetchKeywords()
    } catch {
      // Error handled by fetchApi
    } finally {
      setRunningAudit(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="audits" className="text-[#1E293B] data-[state=active]:bg-[#003ABC] data-[state=active]:text-white">
            <Search className="h-4 w-4 mr-1.5" /> Audits
          </TabsTrigger>
          <TabsTrigger value="keywords" className="text-[#1E293B] data-[state=active]:bg-[#003ABC] data-[state=active]:text-white">
            <Key className="h-4 w-4 mr-1.5" /> Keywords
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-[#1E293B] data-[state=active]:bg-[#003ABC] data-[state=active]:text-white">
            <FileText className="h-4 w-4 mr-1.5" /> Reports
          </TabsTrigger>
        </TabsList>

        {/* ─── Audits Tab ───────────────────────────────────────────────── */}
        <TabsContent value="audits" className="space-y-4">
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-[#1E293B]">Run New Audit</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRunAudit} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Globe className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="https://your-website.com"
                    value={auditUrl}
                    onChange={e => setAuditUrl(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={auditType} onValueChange={v => setAuditType(v as typeof auditType)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Audit</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="content">Content</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={runningAudit || !auditUrl.trim()} className="bg-[#FF6A00] hover:bg-[#FF6A00]/90 text-white shrink-0">
                  {runningAudit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span className="ml-1.5">Run Audit</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          {auditsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : audits.length === 0 ? (
            <Card className="bg-white border-slate-200">
              <CardContent className="py-16 text-center text-slate-400">
                <Search className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No audits yet. Run your first SEO audit above.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {audits.map(audit => (
                <Card key={audit.id} className="bg-white border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      <ScoreGauge score={audit.score} size={80} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <a href={audit.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#003ABC] hover:underline truncate flex items-center gap-1">
                            {audit.url} <ExternalLink className="h-3 w-3" />
                          </a>
                          <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 capitalize text-xs">{audit.type}</Badge>
                        </div>
                        <p className={`text-xs font-medium ${scoreColor(audit.score)} mb-2`}>{scoreLabel(audit.score)}</p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                          {[
                            { label: 'Performance', value: audit.results.performance },
                            { label: 'Accessibility', value: audit.results.accessibility },
                            { label: 'SEO', value: audit.results.seo },
                            { label: 'Best Practices', value: audit.results.bestPractices },
                          ].map(m => (
                            <div key={m.label} className="text-center">
                              <p className={`text-lg font-bold ${scoreColor(m.value)}`}>{m.value}</p>
                              <p className="text-xs text-slate-500">{m.label}</p>
                            </div>
                          ))}
                        </div>

                        {audit.results.issues.length > 0 && (
                          <div className="space-y-1">
                            {audit.results.issues.slice(0, 3).map((issue, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                {issue.severity === 'error' && <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />}
                                {issue.severity === 'warning' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />}
                                {issue.severity === 'info' && <Info className="h-3.5 w-3.5 text-[#003ABC] mt-0.5 shrink-0" />}
                                <span className="text-slate-600">{issue.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">{fmtDate(audit.createdAt)}</p>
                        <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={fetchAudits}>
                          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Keywords Tab ──────────────────────────────────────────────── */}
        <TabsContent value="keywords" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#1E293B]">{keywords.length} keywords tracked</h3>
            <Button variant="outline" size="sm" onClick={fetchKeywords}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>

          {keywordsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : keywords.length === 0 ? (
            <Card className="bg-white border-slate-200">
              <CardContent className="py-16 text-center text-slate-400">
                <Key className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No keywords tracked yet. Run an audit to auto-generate keyword data.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white border-slate-200">
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-100">
                        <TableHead className="text-[#1E293B]">Keyword</TableHead>
                        <TableHead className="text-[#1E293B] text-center">Position</TableHead>
                        <TableHead className="text-[#1E293B] text-center">Change</TableHead>
                        <TableHead className="text-[#1E293B] text-center">Volume</TableHead>
                        <TableHead className="text-[#1E293B] text-center">Difficulty</TableHead>
                        <TableHead className="text-[#1E293B] text-center">CTR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keywords.map(kw => {
                        const change = kw.previousPosition - kw.position
                        return (
                          <TableRow key={kw.id} className="border-slate-50">
                            <TableCell className="font-medium text-[#1E293B]">{kw.keyword}</TableCell>
                            <TableCell className="text-center">
                              <span className="text-lg font-bold text-[#003ABC]">#{kw.position}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={`inline-flex items-center gap-1 text-sm font-medium ${diffColor(change)}`}>
                                {trendIcon(change)}
                                {change > 0 ? `+${change}` : change}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-sm text-[#1E293B]">{kw.searchVolume.toLocaleString()}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={difficultyColor(kw.difficulty)}>
                                {kw.difficulty}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center text-sm text-[#1E293B]">{kw.clickThroughRate}%</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Reports Tab ───────────────────────────────────────────────── */}
        <TabsContent value="reports" className="space-y-4">
          {reports.length === 0 ? (
            <Card className="bg-white border-slate-200">
              <CardContent className="py-16 text-center text-slate-400">
                <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No reports available. Run audits to generate weekly and monthly reports.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reports.map(report => (
                <Card key={report.id} className="bg-white border-slate-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-[#1E293B] capitalize">{report.period} Report</CardTitle>
                      <Badge variant="outline" className="bg-[#003ABC]/10 text-[#003ABC] border-[#003ABC]/20 capitalize">
                        <FileText className="h-3 w-3 mr-1" />
                        {report.period}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">{report.label}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <ScoreGauge score={report.avgScore} size={64} />
                      <div>
                        <p className="text-2xl font-bold text-[#1E293B]">{report.avgScore}</p>
                        <p className="text-xs text-slate-500">Avg Score</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-[#1E293B]">{report.totalKeywords}</p>
                        <p className="text-xs text-slate-500">Keywords</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-[#1E293B]">#{report.avgPosition}</p>
                        <p className="text-xs text-slate-500">Avg Position</p>
                      </div>
                    </div>
                    {report.topMovers.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2">Top Movers</p>
                        <div className="space-y-1.5">
                          {report.topMovers.map((m, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-[#1E293B] truncate mr-2">{m.keyword}</span>
                              <span className={`inline-flex items-center gap-1 font-medium shrink-0 ${diffColor(m.change)}`}>
                                {trendIcon(m.change)}
                                {m.change > 0 ? `+${m.change}` : m.change}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}