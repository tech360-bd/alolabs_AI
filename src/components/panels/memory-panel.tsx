'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Brain, Database, Archive, Search, Plus, Trash2, ChevronLeft, ChevronRight, Flame, Thermometer, Snowflake } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MemoryItem {
  id: string
  agentId: string
  category: string
  content: string
  temperature: string
  successCount: number
  useCount: number
  promotedAt: string | null
  createdAt: string
  updatedAt: string
}

interface MemoryStats {
  hot: number
  warm: number
  cold: number
  total: number
}

type TabType = 'hot' | 'warm' | 'cold'

// ─── Component ───────────────────────────────────────────────────────────────

export default function MemoryPanel() {
  const [tab, setTab] = useState<TabType>('hot')
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [stats, setStats] = useState<MemoryStats>({ hot: 0, warm: 0, cold: 0, total: 0 })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MemoryItem | null>(null)
  const [newAgentId, setNewAgentId] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [newTemperature, setNewTemperature] = useState('hot')
  const [submitting, setSubmitting] = useState(false)
  const limit = 50

  // Fetch stats
  useEffect(() => {
    setStatsLoading(true)
    Promise.all([
      fetch('/api/memory?temperature=hot&limit=1').then((r) => r.json()),
      fetch('/api/memory?temperature=warm&limit=1').then((r) => r.json()),
      fetch('/api/memory?temperature=cold&limit=1').then((r) => r.json()),
      fetch('/api/memory?limit=1').then((r) => r.json()),
    ])
      .then(([hotRes, warmRes, coldRes, allRes]) => {
        setStats({
          hot: hotRes.total || 0,
          warm: warmRes.total || 0,
          cold: coldRes.total || 0,
          total: allRes.total || 0,
        })
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false))
  }, [])

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput])

  // Fetch memories
  const fetchMemories = useCallback((temp: string, searchStr: string, catFilter: string, pageNum: number) => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) })
    if (temp) params.set('temperature', temp)
    if (searchStr) params.set('search', searchStr)
    if (catFilter) params.set('category', catFilter)

    fetch(`/api/memory?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) {
          setMemories(res.data || [])
          setTotal(res.total || 0)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [limit])

  useEffect(() => {
    const cancel = fetchMemories(tab, search, categoryFilter, page)
    return cancel
  }, [tab, search, categoryFilter, page, fetchMemories])

  const totalPages = Math.ceil(total / limit)
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const tempColor = (t: string) => {
    switch (t) {
      case 'hot': return 'bg-red-600/10 text-red-600'
      case 'warm': return 'bg-amber-600/10 text-amber-600'
      case 'cold': return 'bg-[#FF6A00]/10 text-[#FF6A00]'
      default: return 'bg-gray-100 text-[#64748B]'
    }
  }

  const handleAdd = async () => {
    if (!newAgentId || !newContent.trim()) return
    setSubmitting(true)
    try {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: newAgentId, content: newContent.trim(), category: newCategory, temperature: newTemperature }),
      })
      setAddOpen(false)
      setNewAgentId('')
      setNewContent('')
      setNewCategory('general')
      setNewTemperature('hot')
      fetchMemories(tab, search, categoryFilter, page)
    } catch { /* ignore */ }
    finally { setSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await fetch(`/api/memory?id=${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      fetchMemories(tab, search, categoryFilter, page)
    } catch { /* ignore */ }
  }

  const tabs: { id: TabType; label: string; icon: React.ElementType; desc: string; countKey: keyof MemoryStats; color: string; bgColor: string }[] = [
    { id: 'hot', label: 'Hot', icon: Flame, desc: 'Recently accessed', countKey: 'hot', color: 'text-red-600', bgColor: 'bg-red-600/10' },
    { id: 'warm', label: 'Warm', icon: Thermometer, desc: 'Frequently used', countKey: 'warm', color: 'text-amber-600', bgColor: 'bg-amber-600/10' },
    { id: 'cold', label: 'Cold', icon: Snowflake, desc: 'Archived', countKey: 'cold', color: 'text-[#FF6A00]', bgColor: 'bg-[#FF6A00]/10' },
  ]

  const statCards = [
    { icon: Database, label: 'Total Memories', value: stats.total, color: 'text-[#003ABC]', bgColor: 'bg-[#003ABC]/10' },
    { icon: Flame, label: 'Hot', value: stats.hot, color: 'text-red-600', bgColor: 'bg-red-600/10' },
    { icon: Thermometer, label: 'Warm', value: stats.warm, color: 'text-amber-600', bgColor: 'bg-amber-600/10' },
    { icon: Snowflake, label: 'Cold', value: stats.cold, color: 'text-[#FF6A00]', bgColor: 'bg-[#FF6A00]/10' },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-[#003ABC]" />
          <h2 className="text-xl font-semibold text-[#1E293B]">RAG Memory Center</h2>
        </div>
        <Button
          size="sm"
          className="bg-[#003ABC] text-white hover:bg-[#003ABC]/90 text-xs"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Memory
        </Button>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg bg-gray-50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className={`bg-white rounded-xl border border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow p-5 ${card.bgColor}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-[#1E293B]">{card.label}</h3>
                </div>
                <p className="text-3xl font-bold text-[#003ABC] mb-1">{card.value.toLocaleString()}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setPage(1) }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                active
                  ? 'bg-[#003ABC]/10 text-[#003ABC] border border-[#003ABC]/30'
                  : 'bg-white rounded-xl border border-[#E2E8F0] text-[#64748B] hover:text-[#1E293B]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              <Badge variant="secondary" className="text-[10px] py-0 bg-[#F8FAFC] text-[#64748B]">
                {stats[t.countKey]}
              </Badge>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <Input
            placeholder="Search memories..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
          />
        </div>
        <Select value={categoryFilter || '__all__'} onValueChange={(v) => { setCategoryFilter(v === '__all__' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[160px] bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0]">
            <SelectItem value="__all__" className="text-[#1E293B]">All Categories</SelectItem>
            <SelectItem value="general" className="text-[#1E293B]">General</SelectItem>
            <SelectItem value="learning" className="text-[#1E293B]">Learning</SelectItem>
            <SelectItem value="correction" className="text-[#1E293B]">Correction</SelectItem>
            <SelectItem value="pattern" className="text-[#1E293B]">Pattern</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-[#64748B]">
          {total > 0 ? `${from}-${to} of ${total}` : '0 items'}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <Skeleton className="h-96 rounded-lg bg-gray-50" />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                    <TableHead className="text-[#64748B]">Content Preview</TableHead>
                    <TableHead className="text-[#64748B] hidden md:table-cell">Agent</TableHead>
                    <TableHead className="text-[#64748B] hidden sm:table-cell">Category</TableHead>
                    <TableHead className="text-[#64748B]">Temp</TableHead>
                    <TableHead className="text-[#64748B] hidden lg:table-cell">Used</TableHead>
                    <TableHead className="text-[#64748B] hidden lg:table-cell">Success</TableHead>
                    <TableHead className="text-[#64748B] hidden lg:table-cell">Created</TableHead>
                    <TableHead className="text-[#64748B]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-[#64748B] py-12">No memories found</TableCell>
                    </TableRow>
                  ) : (
                    memories.map((mem) => (
                      <TableRow key={mem.id} className="border-[#E2E8F0] hover:bg-gray-50">
                        <TableCell className="text-[#1E293B] text-xs max-w-[300px] truncate">{mem.content}</TableCell>
                        <TableCell className="font-mono text-[10px] text-[#FF6A00] hidden md:table-cell">{mem.agentId.slice(0, 12)}</TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden sm:table-cell capitalize">{mem.category}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-[10px] py-0 ${tempColor(mem.temperature)}`}>
                            {mem.temperature}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden lg:table-cell">{mem.useCount}</TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden lg:table-cell">{mem.successCount}</TableCell>
                        <TableCell className="text-[#64748B] text-xs hidden lg:table-cell">{new Date(mem.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-[#64748B] hover:text-red-600"
                            onClick={() => setDeleteTarget(mem)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#64748B]">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Memory Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-white border-[#E2E8F0]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Add Memory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#64748B]">Agent ID *</Label>
              <Input
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                placeholder="AGENT-0001 or agent cuid"
                className="mt-1 bg-gray-50 border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400"
              />
            </div>
            <div>
              <Label className="text-xs text-[#64748B]">Content *</Label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Memory content..."
                rows={3}
                className="mt-1 w-full rounded-lg bg-gray-50 border border-[#E2E8F0] text-[#1E293B] placeholder:text-gray-400 p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#FF6A00]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-[#64748B]">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="mt-1 bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E2E8F0]">
                    <SelectItem value="general" className="text-[#1E293B]">General</SelectItem>
                    <SelectItem value="learning" className="text-[#1E293B]">Learning</SelectItem>
                    <SelectItem value="correction" className="text-[#1E293B]">Correction</SelectItem>
                    <SelectItem value="pattern" className="text-[#1E293B]">Pattern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-[#64748B]">Temperature</Label>
                <Select value={newTemperature} onValueChange={setNewTemperature}>
                  <SelectTrigger className="mt-1 bg-gray-50 border-[#E2E8F0] text-[#1E293B] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#E2E8F0]">
                    <SelectItem value="hot" className="text-[#1E293B]">Hot</SelectItem>
                    <SelectItem value="warm" className="text-[#1E293B]">Warm</SelectItem>
                    <SelectItem value="cold" className="text-[#1E293B]">Cold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" className="text-[#64748B]">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleAdd}
              disabled={submitting || !newAgentId || !newContent.trim()}
              className="bg-[#003ABC] text-white hover:bg-[#003ABC]/90 text-xs"
            >
              {submitting ? 'Adding...' : 'Add Memory'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent className="bg-white border-[#E2E8F0]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E293B]">Delete Memory</AlertDialogTitle>
            <AlertDialogDescription className="text-[#64748B]">
              Are you sure you want to delete this memory? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[#64748B]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}