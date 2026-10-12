'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Calendar,
  Plus,
  Search,
  Clock,
  Video,
  CheckCircle,
  XCircle,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Timer,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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

interface Meeting {
  id: string
  title: string
  description: string
  date: string
  duration: number
  attendees: string[]
  meetingLink: string
  status: 'scheduled' | 'completed' | 'cancelled'
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface MeetingStats {
  total: number
  scheduled: number
  completed: number
  cancelled: number
  upcomingThisWeek: number
  avgDuration: number
}

const statusConfig: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-600',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function MeetingsPanel() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [stats, setStats] = useState<MeetingStats>({ total: 0, scheduled: 0, completed: 0, cancelled: 0, upcomingThisWeek: 0, avgDuration: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('upcoming')
  const [addOpen, setAddOpen] = useState(false)

  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())

  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formTime, setFormTime] = useState('')
  const [formDuration, setFormDuration] = useState('30')
  const [formAttendees, setFormAttendees] = useState('')
  const [formLink, setFormLink] = useState('')

  const fetchMeetings = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const res = await fetch(`/api/meetings?${params}`)
      const data = await res.json()
      setMeetings(data.meetings || [])
      setStats(data.stats || { total: 0, scheduled: 0, completed: 0, cancelled: 0, upcomingThisWeek: 0, avgDuration: 0 })
    } catch {
      toast.error('Error', { description: 'Failed to load meetings' })
    } finally {
      setLoading(false)
    }
  }, [search, toast])

  useEffect(() => { fetchMeetings() }, [fetchMeetings])

  const now = new Date()
  const upcomingMeetings = useMemo(() =>
    meetings.filter((m) => new Date(m.date) >= now && m.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date)),
    [meetings]
  )
  const pastMeetings = useMemo(() =>
    meetings.filter((m) => new Date(m.date) < now || m.status !== 'scheduled').sort((a, b) => b.date.localeCompare(a.date)),
    [meetings]
  )

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay()
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(i)
    return days
  }, [calendarMonth, calendarYear])

  const getMeetingsForDay = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return meetings.filter((m) => m.date && m.date.startsWith(dateStr))
  }

  const openCreate = () => {
    setFormTitle(''); setFormDescription(''); setFormDate(''); setFormTime('')
    setFormDuration('30'); setFormAttendees(''); setFormLink('')
    setAddOpen(true)
  }

  const handleCreate = async () => {
    if (!formTitle.trim() || !formDate || !formTime) {
      toast.error('Validation Error', { description: 'Title, date, and time are required' })
      return
    }
    setSaving(true)
    try {
      const attendees = formAttendees.split(',').map((a) => a.trim()).filter(Boolean)
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formTitle, description: formDescription, date: `${formDate}T${formTime}:00`, duration: parseInt(formDuration, 10), attendees, meetingLink: formLink }),
      })
      if (res.ok) { toast.success('Created', { description: 'Meeting has been scheduled'  }); setAddOpen(false); fetchMeetings() }
      else { const data = await res.json(); toast.error('Error', { description: data.error }) }
    } catch { toast.error('Error', { description: 'Failed to create meeting' }) }
    finally { setSaving(false) }
  }

  const formatDuration = (mins: number) => {
    if (mins >= 60) { const h = Math.floor(mins / 60); const m = mins % 60; return m > 0 ? `${h}h ${m}m` : `${h}h` }
    return `${mins}m`
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-24 rounded-xl" />))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">Meetings</h2>
          <p className="text-sm text-[#64748B] mt-1">Schedule and manage team meetings</p>
        </div>
        <Button onClick={openCreate} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
          <Plus className="w-4 h-4 mr-2" /> New Meeting
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Calendar, color: 'text-[#003ABC]', bg: 'bg-blue-50' },
          { label: 'Upcoming This Week', value: stats.upcomingThisWeek, icon: Clock, color: 'text-[#FF6A00]', bg: 'bg-orange-50' },
          { label: 'Avg Duration', value: formatDuration(stats.avgDuration), icon: Timer, color: 'text-emerald-500', bg: 'bg-emerald-50' },
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
        <Input placeholder="Search meetings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#F1F5F9]">
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingMeetings.length === 0 ? (
              <div className="col-span-2 py-12 text-center">
                <Calendar className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-sm text-[#94A3B8]">No upcoming meetings.</p>
              </div>
            ) : upcomingMeetings.map((meeting) => (
              <Card key={meeting.id} className="border-[#E2E8F0] hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-sm text-[#1E293B]">{meeting.title}</h4>
                    <Badge className={`text-[10px] shrink-0 ${statusConfig[meeting.status] || ''}`}>{meeting.status}</Badge>
                  </div>
                  <p className="text-xs text-[#64748B] mb-3 line-clamp-2">{meeting.description || 'No description'}</p>
                  <div className="flex items-center gap-4 text-xs text-[#94A3B8] mb-3">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(meeting.date).toLocaleString()}</span>
                    <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{formatDuration(meeting.duration)}</span>
                  </div>
                  {meeting.attendees.length > 0 && (
                    <div className="flex items-center gap-1 mb-3">
                      <Users className="w-3 h-3 text-[#94A3B8]" />
                      <div className="flex -space-x-1.5">
                        {meeting.attendees.slice(0, 4).map((att, i) => (
                          <Avatar key={i} className="w-6 h-6 border-2 border-white">
                            <AvatarFallback className="text-[9px] bg-[#E2E8F0] text-[#64748B]">{att.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                        ))}
                        {meeting.attendees.length > 4 && <span className="text-[10px] text-[#94A3B8] ml-2">+{meeting.attendees.length - 4} more</span>}
                      </div>
                    </div>
                  )}
                  {meeting.meetingLink && (
                    <Button size="sm" variant="outline" className="w-full h-8 text-xs text-[#003ABC] border-[#003ABC]/30 hover:bg-[#003ABC]/5" asChild>
                      <a href={meeting.meetingLink} target="_blank" rel="noopener noreferrer">
                        <Video className="w-3 h-3 mr-1" /> Join Meeting <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {pastMeetings.length === 0 ? (
                <div className="py-12 text-center"><CheckCircle className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" /><p className="text-sm text-[#94A3B8]">No past meetings.</p></div>
              ) : pastMeetings.map((meeting) => (
                <Card key={meeting.id} className="border-[#E2E8F0]">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-[#F1F5F9]"><Calendar className="w-5 h-5 text-[#64748B]" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-sm text-[#1E293B] truncate">{meeting.title}</h4>
                        <Badge className={`text-[10px] shrink-0 ${statusConfig[meeting.status] || ''}`}>{meeting.status}</Badge>
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-0.5">{new Date(meeting.date).toLocaleString()} &bull; {formatDuration(meeting.duration)} &bull; {meeting.attendees.length} attendees</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card className="border-[#E2E8F0]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="sm" onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(calendarYear - 1) } else setCalendarMonth(calendarMonth - 1) }}><ChevronLeft className="w-4 h-4" /></Button>
                <h4 className="font-semibold text-[#1E293B]">{MONTHS[calendarMonth]} {calendarYear}</h4>
                <Button variant="ghost" size="sm" onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(calendarYear + 1) } else setCalendarMonth(calendarMonth + 1) }}><ChevronRight className="w-4 h-4" /></Button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d) => (<div key={d} className="text-center text-[10px] font-semibold text-[#94A3B8] py-1">{d}</div>))}
                {calendarDays.map((day, idx) => {
                  const dayMeetings = day ? getMeetingsForDay(day) : []
                  const isToday = day === now.getDate() && calendarMonth === now.getMonth() && calendarYear === now.getFullYear()
                  return (
                    <div key={idx} className={`min-h-[60px] rounded-lg p-1 border transition-colors ${day ? 'border-[#F1F5F9] hover:border-[#E2E8F0]' : 'border-transparent'} ${isToday ? 'bg-blue-50 border-blue-200' : ''}`}>
                      {day && <span className={`text-[10px] font-medium ${isToday ? 'text-[#003ABC]' : 'text-[#64748B]'}`}>{day}</span>}
                      {dayMeetings.slice(0, 2).map((m) => (<div key={m.id} className="mt-0.5 truncate text-[8px] bg-[#003ABC]/10 text-[#003ABC] rounded px-1 py-0.5 font-medium">{m.title}</div>))}
                      {dayMeetings.length > 2 && <span className="text-[8px] text-[#94A3B8]">+{dayMeetings.length - 2}</span>}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-[#003ABC]" /> New Meeting</DialogTitle>
            <DialogDescription>Schedule a new team meeting</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Title</Label><Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Meeting title..." className="mt-1" /></div>
            <div><Label>Description</Label><Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Meeting agenda..." rows={3} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="mt-1" /></div>
              <div><Label>Time</Label><Input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Duration</Label><Select value={formDuration} onValueChange={setFormDuration}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="15">15 min</SelectItem><SelectItem value="30">30 min</SelectItem><SelectItem value="45">45 min</SelectItem><SelectItem value="60">1 hour</SelectItem><SelectItem value="90">1.5 hours</SelectItem><SelectItem value="120">2 hours</SelectItem></SelectContent></Select></div>
              <div><Label>Meeting Link</Label><Input value={formLink} onChange={(e) => setFormLink(e.target.value)} placeholder="https://zoom.us/..." className="mt-1" /></div>
            </div>
            <div><Label>Attendees (comma separated)</Label><Input value={formAttendees} onChange={(e) => setFormAttendees(e.target.value)} placeholder="colleague@company.com, team-lead@company.com" className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-[#003ABC] hover:bg-[#003ABC]/90">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
