'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  ListTodo,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  GripVertical,
  Trash2,
  Edit,
  Eye,
  Copy,
  Flag,
  CircleDot,
  LayoutGrid,
  ChevronDown,
  X,
  Send,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'review' | 'completed'
  priority: 'critical' | 'high' | 'medium' | 'low'
  createdAt: string
  dueDate: string | null
  agent?: { name: string; agentId: string }
  assignee?: { name: string; avatar?: string }
  tags: string[]
  _count?: { steps: number; outputs: number }
}

interface CreateTaskForm {
  title: string
  description: string
  priority: string
  assignee: string
  dueDate: string
  tags: string
}


const COLUMNS: { id: Task['status']; title: string; color: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'pending', title: 'Pending', color: 'border-t-amber-400', icon: CircleDot },
  { id: 'in_progress', title: 'In Progress', color: 'border-t-blue-500', icon: Clock },
  { id: 'review', title: 'In Review', color: 'border-t-purple-500', icon: Eye },
  { id: 'completed', title: 'Completed', color: 'border-t-emerald-500', icon: CheckCircle2 },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const priorityConfig: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', icon: AlertTriangle },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', icon: Flag },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Flag },
  low: { bg: 'bg-slate-50', text: 'text-slate-600', icon: Flag },
}

const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

const isOverdue = (dueDate: string | null) => {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

const getDueDateLabel = (dueDate: string | null) => {
  if (!dueDate) return null
  const d = new Date(dueDate)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'text-red-600' }
  if (days === 0) return { label: 'Due today', color: 'text-amber-600' }
  if (days <= 3) return { label: `${days}d left`, color: 'text-amber-600' }
  return { label: `${days}d left`, color: 'text-[#64748B]' }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [createForm, setCreateForm] = useState<CreateTaskForm>({ title: '', description: '', priority: 'medium', assignee: '', dueDate: '', tags: '' })

  useEffect(() => {
    fetch('/api/tasks?page=1&limit=50')
      .then((r) => r.json())
      .then((res) => {
        const apiTasks = (res.logs || []).map((t: Record<string, unknown>) => ({
          ...t,
          description: String(t.description ?? ''),
          status: ['pending', 'in_progress', 'review', 'completed'].includes(t.status as string) ? t.status : 'pending',
          priority: ['critical', 'high', 'medium', 'low'].includes(t.priority as string) ? t.priority : 'medium',
          tags: [],
          assignee: undefined,
          dueDate: null,
        })) as Task[]
        setTasks(apiTasks)
        setTotal(res.pagination?.total || apiTasks.length)
      })
      .catch(() => {
        setTasks([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredTasks = useMemo(() => {
    let result = tasks
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.tags?.some((tag) => tag.toLowerCase().includes(q)))
    }
    if (priorityFilter !== 'all') {
      result = result.filter((t) => t.priority === priorityFilter)
    }
    return result
  }, [tasks, search, priorityFilter])

  const columnTasks = useMemo(() => {
    const grouped: Record<string, Task[]> = { pending: [], in_progress: [], review: [], completed: [] }
    filteredTasks.forEach((t) => { if (grouped[t.status]) grouped[t.status].push(t) })
    return grouped
  }, [filteredTasks])

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    if (selectedTasks.size === filteredTasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(filteredTasks.map((t) => t.id)))
    }
  }, [filteredTasks, selectedTasks])

  const handleBulkDelete = () => {
    toast.success(`${selectedTasks.size} tasks deleted`)
    setSelectedTasks(new Set())
  }

  const handleBulkStatus = (status: string) => {
    toast.success(`${selectedTasks.size} tasks moved to ${status}`)
    setSelectedTasks(new Set())
  }

  const handleCreate = () => {
    if (!createForm.title.trim()) return
    toast.success(`Task "${createForm.title}" created`)
    setShowCreateDialog(false)
    setCreateForm({ title: '', description: '', priority: 'medium', assignee: '', dueDate: '', tags: '' })
  }

  const moveTask = (taskId: string, newStatus: Task['status']) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))
    toast.success(`Task moved to ${COLUMNS.find((c) => c.id === newStatus)?.title}`)
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[500px] rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#003ABC] to-[#0077FF] flex items-center justify-center">
            <ListTodo className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#1E293B]">Tasks</h2>
            <p className="text-sm text-[#64748B]">{total} total · {tasks.filter((t) => t.status === 'pending').length} pending</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedTasks.size > 0 && (
            <div className="flex items-center gap-2 mr-2">
              <Badge variant="secondary" className="bg-[#003ABC]/10 text-[#003ABC] text-xs">{selectedTasks.size} selected</Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs border-[#E2E8F0]">
                    <ArrowRight className="w-3 h-3 mr-1" /> Move To
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleBulkStatus('pending')}>Pending</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkStatus('in_progress')}>In Progress</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkStatus('review')}>In Review</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkStatus('completed')}>Completed</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={handleBulkDelete}>
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            </div>
          )}
          <Button variant="outline" size="icon" className={`h-9 w-9 ${viewMode === 'kanban' ? 'bg-[#003ABC]/10 border-[#003ABC]/30 text-[#003ABC]' : 'border-[#E2E8F0] text-[#64748B]'}`} onClick={() => setViewMode('kanban')}>
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button size="sm" className="bg-[#FF6A00] hover:bg-[#E5600A] text-white gap-1.5" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-3.5 h-3.5" /> New Task
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-white border-[#E2E8F0]" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'critical', 'high', 'medium', 'low'].map((p) => (
            <Button key={p} variant={priorityFilter === p ? 'default' : 'outline'} size="sm" className={`h-7 text-[11px] px-2.5 ${priorityFilter === p ? 'bg-[#003ABC] text-white hover:bg-[#003ABC]/90' : 'border-[#E2E8F0] text-[#64748B] hover:text-[#1E293B]'}`} onClick={() => setPriorityFilter(p)}>
              {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
            </Button>
          ))}
          {selectedTasks.size > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-[#64748B]" onClick={selectAll}>
              {selectedTasks.size === filteredTasks.length ? 'Deselect All' : 'Select All'}
            </Button>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const ColumnIcon = col.icon
          const colTasks = columnTasks[col.id] || []
          return (
            <div key={col.id} className="space-y-3">
              {/* Column Header */}
              <div className={`flex items-center justify-between p-3 rounded-t-xl bg-white border border-[#E2E8F0] ${col.color} border-b-0`}>
                <div className="flex items-center gap-2">
                  <ColumnIcon className="w-4 h-4 text-[#64748B]" />
                  <h3 className="text-sm font-semibold text-[#1E293B]">{col.title}</h3>
                  <Badge variant="secondary" className="bg-slate-100 text-[#64748B] text-[10px] px-1.5 h-5 min-w-[20px] flex items-center justify-center">{colTasks.length}</Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-[#94A3B8]"><ChevronDown className="w-3.5 h-3.5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { const t = tasks.find((x) => x.status === col.id); if (t) moveTask(t.id, 'completed') }}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Complete all
                    </DropdownMenuItem>
                    <DropdownMenuItem><Eye className="w-3.5 h-3.5 mr-1.5" /> View details</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Task Cards */}
              <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto rounded-b-xl border border-[#E2E8F0] border-t-0 bg-slate-50/50 p-2">
                {colTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-[#94A3B8]">No tasks</p>
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const pCfg = priorityConfig[task.priority] || priorityConfig.low
                    const PIcon = pCfg.icon
                    const dueInfo = getDueDateLabel(task.dueDate)
                    const overdue = isOverdue(task.dueDate) && task.status !== 'completed'
                    return (
                      <div
                        key={task.id}
                        className={`bg-white rounded-lg border border-[#E2E8F0] p-3 space-y-2.5 hover:shadow-md transition-all cursor-pointer group ${selectedTasks.has(task.id) ? 'ring-2 ring-[#003ABC]/30' : ''} ${overdue ? 'border-l-2 border-l-red-400' : ''}`}
                        onClick={() => setSelectedTask(task)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <button onClick={(e) => { e.stopPropagation(); toggleSelect(task.id) }} className="mt-0.5">
                              <Checkbox checked={selectedTasks.has(task.id)} className="data-[state=checked]:bg-[#003ABC] data-[state=checked]:border-[#003ABC] h-4 w-4" />
                            </button>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[#1E293B] leading-snug">{task.title}</p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#94A3B8] hover:text-[#1E293B] transition-opacity">
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem><Edit className="w-3.5 h-3.5 mr-1.5" /> Edit</DropdownMenuItem>
                              <DropdownMenuItem><Copy className="w-3.5 h-3.5 mr-1.5" /> Duplicate</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {col.id !== 'completed' && COLUMNS.filter((c) => c.id !== col.id).map((c) => (
                                <DropdownMenuItem key={c.id} onClick={(e) => { e.stopPropagation(); moveTask(task.id, c.id) }}>
                                  <ArrowRight className="w-3.5 h-3.5 mr-1.5" /> Move to {c.title}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600"><Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {/* Priority + Due Date */}
                        <div className="flex items-center gap-2 flex-wrap pl-6">
                          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${pCfg.bg} ${pCfg.text}`}>
                            <PIcon className="w-3 h-3" /> {task.priority}
                          </div>
                          {task.agent && (
                            <span className="text-[10px] text-[#94A3B8] bg-slate-50 px-1.5 py-0.5 rounded">{task.agent.name}</span>
                          )}
                          {dueInfo && (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] ${dueInfo.color}`}>
                              <Calendar className="w-3 h-3" /> {dueInfo.label}
                            </span>
                          )}
                        </div>
                        {/* Assignee + Tags */}
                        <div className="flex items-center justify-between pl-6">
                          <div className="flex items-center gap-1.5">
                            {task.tags?.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 text-[#64748B] border-[#E2E8F0]">{tag}</Badge>
                            ))}
                            {(task.tags?.length || 0) > 2 && (
                              <span className="text-[9px] text-[#94A3B8]">+{task.tags!.length - 2}</span>
                            )}
                          </div>
                          {task.assignee && (
                            <Avatar className="w-6 h-6">
                              <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-[9px] font-medium">{getInitials(task.assignee.name)}</AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Task Detail Sheet */}
      <Sheet open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedTask && (
            <>
              <SheetHeader>
                <SheetTitle className="text-[#1E293B] text-lg">{selectedTask.title}</SheetTitle>
                <SheetDescription className="text-[#64748B]">Task details and actions</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Status & Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[11px] text-[#94A3B8] mb-1">Status</p>
                    <Badge className={`${COLUMNS.find((c) => c.id === selectedTask.status)?.color?.replace('border-t-', 'bg-').replace('-400', '-100') || ''} text-[11px]`}>
                      {COLUMNS.find((c) => c.id === selectedTask.status)?.title || selectedTask.status}
                    </Badge>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[11px] text-[#94A3B8] mb-1">Priority</p>
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${priorityConfig[selectedTask.priority]?.bg} ${priorityConfig[selectedTask.priority]?.text}`}>
                      {selectedTask.priority}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <p className="text-xs font-medium text-[#1E293B] mb-1.5">Description</p>
                  <p className="text-sm text-[#64748B] leading-relaxed">{selectedTask.description || 'No description provided.'}</p>
                </div>

                <Separator />

                {/* Details */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-[#94A3B8]" />
                    <div>
                      <p className="text-[11px] text-[#94A3B8]">Assignee</p>
                      <p className="text-sm text-[#1E293B]">{selectedTask.assignee?.name || 'Unassigned'}</p>
                    </div>
                  </div>
                  {selectedTask.agent && (
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-[#94A3B8]" />
                      <div>
                        <p className="text-[11px] text-[#94A3B8]">Assigned Agent</p>
                        <p className="text-sm text-[#1E293B]">{selectedTask.agent.name}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-[#94A3B8]" />
                    <div>
                      <p className="text-[11px] text-[#94A3B8]">Due Date</p>
                      <p className={`text-sm ${isOverdue(selectedTask.dueDate) ? 'text-red-600' : 'text-[#1E293B]'}`}>
                        {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : 'No due date'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-[#94A3B8]" />
                    <div>
                      <p className="text-[11px] text-[#94A3B8]">Created</p>
                      <p className="text-sm text-[#1E293B]">{new Date(selectedTask.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                {selectedTask.tags && selectedTask.tags.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-[#1E293B] mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[11px] border-[#E2E8F0] text-[#64748B]">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Actions */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#1E293B] mb-2">Move To</p>
                  <div className="grid grid-cols-2 gap-2">
                    {COLUMNS.filter((c) => c.id !== selectedTask.status).map((col) => (
                      <Button key={col.id} variant="outline" size="sm" className="h-8 text-xs border-[#E2E8F0] text-[#64748B] hover:text-[#1E293B]" onClick={() => { moveTask(selectedTask.id, col.id); setSelectedTask(null) }}>
                        <ArrowRight className="w-3 h-3 mr-1" /> {col.title}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Task Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Create New Task</DialogTitle>
            <DialogDescription className="text-[#64748B]">Add a new task to the board.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Title</Label>
              <Input placeholder="Task title..." value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} className="bg-white border-[#E2E8F0]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Description</Label>
              <Textarea placeholder="Describe the task..." value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} className="bg-white border-[#E2E8F0] min-h-[80px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-[#1E293B]">Priority</Label>
                <Select value={createForm.priority} onValueChange={(v) => setCreateForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger className="bg-white border-[#E2E8F0]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-[#1E293B]">Due Date</Label>
                <Input type="date" value={createForm.dueDate} onChange={(e) => setCreateForm((f) => ({ ...f, dueDate: e.target.value }))} className="bg-white border-[#E2E8F0]" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-[#1E293B]">Tags (comma-separated)</Label>
              <Input placeholder="e.g. frontend, bugfix" value={createForm.tags} onChange={(e) => setCreateForm((f) => ({ ...f, tags: e.target.value }))} className="bg-white border-[#E2E8F0]" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="text-[#64748B]">Cancel</Button>
            <Button className="bg-[#FF6A00] hover:bg-[#E5600A] text-white gap-1.5" onClick={handleCreate} disabled={!createForm.title.trim()}>
              <Send className="w-3.5 h-3.5" /> Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}