'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  MessageSquare,
  ThumbsUp,
  AlertCircle,
  Lightbulb,
  Send,
  Bot,
  Search,
  Loader2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface Feedback {
  id: string
  taskId: string | null
  agentId: string | null
  companyId: string | null
  category: string
  content: string
  fromUser: boolean
  createdAt: string
}

const FEEDBACK_CATEGORIES = [
  { value: 'correction', label: 'Correction' },
  { value: 'praise', label: 'Praise' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'suggestion', label: 'Suggestion' },
]

function getCategoryBadge(category: string) {
  const map: Record<string, string> = {
    correction: 'bg-red-100 text-red-700',
    praise: 'bg-green-100 text-green-700',
    suggestion: 'bg-blue-100 text-blue-700',
    complaint: 'bg-amber-100 text-amber-700',
  }
  return map[category] || 'bg-gray-100 text-gray-700'
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'correction': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
    case 'praise': return <ThumbsUp className="w-3.5 h-3.5 text-green-500" />
    case 'complaint': return <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
    case 'suggestion': return <Lightbulb className="w-3.5 h-3.5 text-blue-500" />
    default: return <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
  }
}

export default function FeedbackPanel() {
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [category, setCategory] = useState('')
  const [content, setContent] = useState('')
  const [fromUser, setFromUser] = useState(true)

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  const fetchFeedback = useCallback(() => {
    setLoading(true)
    fetch('/api/feedback')
      .then((r) => r.json())
      .then((data) => {
        setFeedback(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchFeedback()
  }, [fetchFeedback])

  const handleSubmit = async () => {
    if (!category || !content.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          content: content.trim(),
          fromUser,
        }),
      })
      if (!res.ok) throw new Error('Failed to submit feedback')
      toast.success('Feedback submitted')
      setCategory('')
      setContent('')
      setFromUser(true)
      setSubmitOpen(false)
      fetchFeedback()
    } catch {
      toast.error('Failed to submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  // Computed stats
  const totalFeedback = feedback.length
  const corrections = feedback.filter((f) => f.category === 'correction').length
  const praises = feedback.filter((f) => f.category === 'praise').length
  const complaints = feedback.filter((f) => f.category === 'complaint').length
  const suggestions = feedback.filter((f) => f.category === 'suggestion').length
  const fromUserCount = feedback.filter((f) => f.fromUser).length
  const fromAgentCount = feedback.filter((f) => !f.fromUser).length

  // Filter logic
  const filteredFeedback = feedback.filter((f) => {
    const matchSearch = !search || f.content.toLowerCase().includes(search.toLowerCase())
    const matchCategory = !categoryFilter || f.category === categoryFilter
    return matchSearch && matchCategory
  })

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  const formatDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString()
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56 bg-gray-100 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl bg-gray-100" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-[#1E293B]">Feedback &amp; Learning Center</h2>
        <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg">
              <Send className="w-4 h-4 mr-2" />
              Submit Feedback
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-[#E2E8F0] rounded-xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#1E293B]">Submit Feedback</DialogTitle>
              <DialogDescription className="text-[#64748B]">Help agents improve by sharing feedback.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
                    {FEEDBACK_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-[#1E293B]">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Source</Label>
                <Select value={fromUser ? 'user' : 'agent'} onValueChange={(v) => setFromUser(v === 'user')}>
                  <SelectTrigger className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
                    <SelectItem value="user" className="text-[#1E293B]">From User</SelectItem>
                    <SelectItem value="agent" className="text-[#1E293B]">From Agent (Self)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[#1E293B] text-sm">Content</Label>
                <Textarea
                  placeholder="Share your feedback..."
                  className="bg-[#F8FAFC] border-[#E2E8F0] text-[#1E293B] rounded-lg min-h-[100px]"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
              <Button
                className="w-full bg-[#003ABC] hover:bg-[#002A8F] text-white rounded-lg"
                onClick={handleSubmit}
                disabled={!category || !content.trim() || submitting}
              >
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Send className="w-4 h-4 mr-2" />
                Submit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: MessageSquare, label: 'Total Feedback', value: totalFeedback, color: 'text-[#003ABC]' },
          { icon: AlertCircle, label: 'Corrections', value: corrections, color: 'text-red-500' },
          { icon: ThumbsUp, label: 'Praise', value: praises, color: 'text-green-500' },
          { icon: Lightbulb, label: 'Suggestions', value: suggestions, color: 'text-amber-500' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-[#E2E8F0] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#94A3B8]" />
                <span className="text-xs text-[#64748B]">{s.label}</span>
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Quick stats bar */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-xs text-[#64748B]">From Users</p>
            <p className="text-lg font-bold text-[#1E293B]">{fromUserCount}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#64748B]">From Agents</p>
            <p className="text-lg font-bold text-[#1E293B]">{fromAgentCount}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#64748B]">Complaints</p>
            <p className="text-lg font-bold text-red-500">{complaints}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#64748B]">Positive Rate</p>
            <p className="text-lg font-bold text-green-500">
              {totalFeedback > 0 ? `${Math.round((praises / totalFeedback) * 100)}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input
            placeholder="Search feedback..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-white border-[#E2E8F0] text-[#1E293B] rounded-lg"
          />
        </div>
        <Select value={categoryFilter || '__all__'} onValueChange={(v) => setCategoryFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-[160px] bg-white border-[#E2E8F0] text-[#1E293B] rounded-lg text-xs">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0] rounded-lg">
            <SelectItem value="__all__" className="text-[#1E293B]">All Categories</SelectItem>
            {FEEDBACK_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value} className="text-[#1E293B]">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Feedback Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="p-4 pb-0 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1E293B]">Feedback History</h3>
          <span className="text-xs text-[#94A3B8]">{filteredFeedback.length} of {totalFeedback}</span>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E2E8F0] hover:bg-transparent sticky top-0 bg-white">
                <TableHead className="text-[#64748B] text-xs font-medium">Category</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium">Content</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium hidden sm:table-cell">Source</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium hidden md:table-cell">Agent ID</TableHead>
                <TableHead className="text-[#64748B] text-xs font-medium hidden lg:table-cell">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFeedback.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-[#94A3B8] py-12 text-sm">No feedback yet</TableCell>
                </TableRow>
              ) : (
                filteredFeedback.map((fb) => (
                  <TableRow key={fb.id} className="border-[#E2E8F0] hover:bg-[#F8FAFC]">
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {getCategoryIcon(fb.category)}
                        <Badge className={`text-[10px] py-0 border-0 capitalize ${getCategoryBadge(fb.category)}`}>
                          {fb.category}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#1E293B] text-sm max-w-xs truncate">{fb.content}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge className={`text-[10px] py-0 border-0 ${fb.fromUser ? 'bg-[#003ABC]/10 text-[#003ABC]' : 'bg-purple-100 text-purple-700'}`}>
                        {fb.fromUser ? 'User' : 'Agent'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#64748B] text-sm hidden md:table-cell">
                      {fb.agentId ? (
                        <div className="flex items-center gap-1.5">
                          <Bot className="w-3 h-3 text-[#94A3B8]" />
                          <span className="font-mono text-xs">{fb.agentId.slice(0, 12)}</span>
                        </div>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-[#94A3B8] text-xs hidden lg:table-cell">
                      {formatDateTime(fb.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}