'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Target,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  Circle,
  Pause,
  Play,
  Sparkles,
  Trophy,
  ListChecks,
  Clock,
  TrendingUp,
  Globe,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

interface SEOTask {
  text: string
  completed: boolean
  completedAt: string | null
}

interface SEOChallenge {
  id: string
  title: string
  targetKeywords: string[]
  durationDays: number
  websiteUrl: string
  startDate: string
  endDate: string
  status: 'active' | 'completed' | 'paused'
  tasks: SEOTask[]
  progress: number
  completedTasks: number
  totalTasks: number
  daysElapsed: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface SEOStats {
  active: number
  completed: number
  paused: number
  totalChallenges: number
  totalTasks: number
  completedTasks: number
  avgScoreImprovement: number
}

const statusConfig: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
}

const DURATION_OPTIONS = [
  { value: '30', label: '30 Days', desc: 'Quick Wins' },
  { value: '60', label: '60 Days', desc: 'Growth Sprint' },
  { value: '90', label: '90 Days', desc: 'Quarter Plan' },
  { value: '180', label: '180 Days', desc: 'Half Year' },
  { value: '365', label: '365 Days', desc: 'Full Year' },
]

export default function SEOChallengePanel() {
  const [challenges, setChallenges] = useState<SEOChallenge[]>([])
  const [stats, setStats] = useState<SEOStats>({ active: 0, completed: 0, paused: 0, totalChallenges: 0, totalTasks: 0, completedTasks: 0, avgScoreImprovement: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('active')
  const [addOpen, setAddOpen] = useState(false)

  const [formTitle, setFormTitle] = useState('')
  const [formKeywords, setFormKeywords] = useState('')
  const [formDuration, setFormDuration] = useState('30')
  const [formUrl, setFormUrl] = useState('')

  const fetchChallenges = useCallback(async () => {
    try {
      const statusParam = tab !== 'all' ? tab : ''
      const params = new URLSearchParams()
      if (statusParam) params.set('status', statusParam)
      const res = await fetch(`/api/seo/challenges?${params}`)
      const data = await res.json()
      setChallenges(data.challenges || [])
      setStats(data.stats || { active: 0, completed: 0, paused: 0, totalChallenges: 0, totalTasks: 0, completedTasks: 0, avgScoreImprovement: 0 })
    } catch {
      toast.error('Error', { description: 'Failed to load challenges' })
    } finally {
      setLoading(false)
    }
  }, [tab, toast])

  useEffect(() => { fetchChallenges() }, [fetchChallenges])

  const openCreate = () => {
    setFormTitle(''); setFormKeywords(''); setFormDuration('30'); setFormUrl('')
    setAddOpen(true)
  }

  const handleCreate = async () => {
    if (!formTitle.trim() || !formUrl.trim()) {
      toast.error('Validation Error', { description: 'Title and website URL are required' })
      return
    }
    setSaving(true)
    try {
      const keywords = formKeywords.split(',').map((k) => k.trim()).filter(Boolean)
      const res = await fetch('/api/seo/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle, targetKeywords: keywords, durationDays: parseInt(formDuration, 10), websiteUrl: formUrl }),
      })
      if (res.ok) { toast.success('Created', { description: 'SEO challenge started!'  }); setAddOpen(false); fetchChallenges() }
      else { const data = await res.json(); toast.error('Error', { description: data.error }) }
    } catch { toast.error('Error', { description: 'Failed to create challenge' }) }
    finally { setSaving(false) }
  }

  const toggleTask = async (challengeId: string, taskIndex: number) => {
    try {
      const res = await fetch('/api/seo/challenges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: challengeId, markTaskComplete: taskIndex }),
      })
      if (res.ok) {
        const data = await res.json()
        setChallenges(challenges.map((c) => (c.id === challengeId ? { ...c, ...data } : c)))
      }
    } catch { toast.error('Error', { description: 'Failed to update task' }) }
  }

  const togglePause = async (challenge: SEOChallenge) => {
    try {
      const newStatus = challenge.status === 'paused' ? 'active' : 'paused'
      const res = await fetch('/api/seo/challenges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: challenge.id, status: newStatus }),
      })
      if (res.ok) {
        fetchChallenges()
        toast.success(newStatus === 'paused' ? 'Paused' : 'Resumed', { description: `Challenge ${newStatus}` })
      }
    } catch { toast.error('Error', { description: 'Failed to update challenge' }) }
  }

  const daysRemaining = (challenge: SEOChallenge) => {
    const end = new Date(challenge.endDate)
    const now = new Date()
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-24 rounded-xl" />))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">SEO Challenges</h2>
          <p className="text-sm text-[#64748B] mt-1">Structured SEO improvement programs with daily tasks</p>
        </div>
        <Button onClick={openCreate} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
          <Plus className="w-4 h-4 mr-2" /> New Challenge
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active', value: stats.active, icon: Target, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Tasks Completed', value: stats.completedTasks, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Total Tasks', value: stats.totalTasks, icon: ListChecks, color: 'text-[#003ABC]', bg: 'bg-blue-50' },
          { label: 'Completed', value: stats.completed, icon: Trophy, color: 'text-[#FF6A00]', bg: 'bg-orange-50' },
        ].map((stat) => (
          <Card key={stat.label} className="border-[#E2E8F0]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}><stat.icon className={`w-5 h-5 ${stat.color}`} /></div>
              <div>
                <p className="text-2xl font-bold text-[#1E293B]">{stat.value}</p>
                <p className="text-xs text-[#94A3B8]">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#F1F5F9]">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="paused">Paused</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <div className="space-y-4">
            {challenges.length === 0 ? (
              <Card className="border-[#E2E8F0]">
                <CardContent className="py-12 text-center">
                  <Target className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-sm text-[#94A3B8]">No {tab === 'all' ? '' : tab} challenges found.</p>
                </CardContent>
              </Card>
            ) : challenges.map((challenge) => {
              const remaining = daysRemaining(challenge)
              return (
                <Card key={challenge.id} className="border-[#E2E8F0]">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-base font-semibold text-[#1E293B]">{challenge.title}</h3>
                          <Badge className={`text-[10px] ${statusConfig[challenge.status] || ''}`}>{challenge.status}</Badge>
                          <Badge className="text-[10px] bg-[#F1F5F9] text-[#64748B]">{challenge.durationDays} days</Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-[#94A3B8] mb-1">
                          <Globe className="w-3 h-3" />
                          <span className="truncate max-w-[300px]">{challenge.websiteUrl}</span>
                        </div>
                        {challenge.targetKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {challenge.targetKeywords.slice(0, 5).map((kw, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] border-[#E2E8F0] text-[#64748B]">{kw}</Badge>
                            ))}
                            {challenge.targetKeywords.length > 5 && (
                              <span className="text-[10px] text-[#94A3B8]">+{challenge.targetKeywords.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {challenge.status !== 'completed' && (
                        <Button variant="outline" size="sm" onClick={() => togglePause(challenge)} className="shrink-0">
                          {challenge.status === 'paused' ? <><Play className="w-4 h-4 mr-1" />Resume</> : <><Pause className="w-4 h-4 mr-1" />Pause</>}
                        </Button>
                      )}
                    </div>

                    {/* Progress Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-medium text-[#64748B]">Progress</span>
                          <span className="text-[10px] font-bold text-[#003ABC]">{challenge.progress}%</span>
                        </div>
                        <Progress value={challenge.progress} className="h-2" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-[#1E293B]">{challenge.completedTasks}/{challenge.totalTasks}</p>
                        <p className="text-[10px] text-[#94A3B8]">Tasks Done</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-[#1E293B]">{challenge.status === 'completed' ? 0 : remaining}</p>
                        <p className="text-[10px] text-[#94A3B8]">{challenge.status === 'completed' ? 'Finished' : 'Days Left'}</p>
                      </div>
                    </div>

                    <Separator />

                    {/* Tasks List */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs text-[#64748B] flex items-center gap-1">
                          <ListChecks className="w-3 h-3" /> Tasks ({challenge.totalTasks})
                        </Label>
                      </div>
                      <ScrollArea className="max-h-64">
                        <div className="space-y-1.5">
                          {challenge.tasks.map((task, idx) => (
                            <div key={idx} className={`flex items-start gap-2.5 p-2 rounded-lg transition-colors ${task.completed ? 'bg-emerald-50/50' : 'hover:bg-[#F8FAFC]'}`}>
                              <Checkbox
                                checked={task.completed}
                                onCheckedChange={() => toggleTask(challenge.id, idx)}
                                disabled={challenge.status === 'completed'}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs leading-relaxed ${task.completed ? 'text-[#94A3B8] line-through' : 'text-[#1E293B]'}`}>{task.text}</p>
                              </div>
                              {idx < 5 && !task.completed && (
                                <Badge className="text-[8px] bg-purple-100 text-purple-600 shrink-0 flex items-center gap-0.5">
                                  <Sparkles className="w-2.5 h-2.5" /> AI
                                </Badge>
                              )}
                              {task.completedAt && (
                                <span className="text-[9px] text-[#CBD5E1] shrink-0">{new Date(task.completedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Day counter bar */}
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-[#94A3B8]">
                      <Clock className="w-3 h-3" />
                      <span>Day {challenge.daysElapsed} of {challenge.durationDays}</span>
                      <span>&bull;</span>
                      <span>Started {new Date(challenge.startDate).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#003ABC]" />
              New SEO Challenge
            </DialogTitle>
            <DialogDescription>Start a structured SEO improvement program</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Challenge Title</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g., Homepage SEO Overhaul" className="mt-1" />
            </div>
            <div>
              <Label>Website URL</Label>
              <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://your-website.com" className="mt-1" />
            </div>
            <div>
              <Label>Target Keywords (comma separated)</Label>
              <Input value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} placeholder="seo agency, digital marketing, ..." className="mt-1" />
            </div>
            <div>
              <Label>Duration</Label>
              <div className="grid grid-cols-5 gap-2 mt-1">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFormDuration(opt.value)}
                    className={`p-2 rounded-lg border text-center transition-colors ${formDuration === opt.value ? 'border-[#003ABC] bg-blue-50 text-[#003ABC]' : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'}`}
                  >
                    <span className="text-xs font-semibold block">{opt.label}</span>
                    <span className="text-[9px] text-[#94A3B8]">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Start Challenge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
