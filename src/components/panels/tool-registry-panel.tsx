'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wrench, Plus, Search, Shield, AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { toast } from 'sonner'

interface Tool {
  id: string
  name: string
  category: string
  description: string
  riskLevel: string
  allowedDepartments: string[]
  blockedDepartments: string[]
  status: string
  updatedAt: string
}

const CATEGORIES = [
  { value: 'ai_model', label: 'AI Model' },
  { value: 'database', label: 'Database' },
  { value: 'api', label: 'API' },
  { value: 'file', label: 'File' },
  { value: 'web', label: 'Web' },
  { value: 'communication', label: 'Communication' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'security', label: 'Security' },
]

const categoryColors: Record<string, string> = {
  ai_model: 'bg-[#003ABC]/10 text-[#003ABC]',
  database: 'bg-emerald-100 text-emerald-700',
  api: 'bg-[#FF6A00]/10 text-[#FF6A00]',
  file: 'bg-purple-100 text-purple-700',
  web: 'bg-cyan-100 text-cyan-700',
  communication: 'bg-pink-100 text-pink-700',
  analytics: 'bg-amber-100 text-amber-700',
  security: 'bg-red-100 text-red-700',
}

const riskColors: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
}

export default function ToolRegistryPanel() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [saving, setSaving] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)

  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('api')
  const [formDescription, setFormDescription] = useState('')
  const [formRiskLevel, setFormRiskLevel] = useState('low')
  const [formAllowed, setFormAllowed] = useState('')
  const [formBlocked, setFormBlocked] = useState('')

  const fetchTools = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterCategory) params.set('category', filterCategory)
      if (search) params.set('search', search)
      const res = await fetch(`/api/tools?${params}`)
      const data = await res.json()
      setTools(data.tools || [])
    } catch {
      toast.error('Error', { description: 'Failed to load tools' })
    } finally {
      setLoading(false)
    }
  }, [filterCategory, search, toast])

  useEffect(() => {
    fetchTools()
  }, [fetchTools])

  const openAdd = () => {
    setFormName('')
    setFormCategory('api')
    setFormDescription('')
    setFormRiskLevel('low')
    setFormAllowed('')
    setFormBlocked('')
    setAddOpen(true)
  }

  const handleAdd = async () => {
    if (!formName.trim()) {
      toast.error('Validation Error', { description: 'Name is required' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          category: formCategory,
          description: formDescription,
          riskLevel: formRiskLevel,
          allowedDepartments: formAllowed.split(',').map((d) => d.trim()).filter(Boolean),
          blockedDepartments: formBlocked.split(',').map((d) => d.trim()).filter(Boolean),
        }),
      })
      if (res.ok) {
        toast.success('Registered', { description: 'Tool registered successfully'  })
        setAddOpen(false)
        fetchTools()
      } else {
        const data = await res.json()
        toast.error('Error', { description: data.error })
      }
    } catch {
      toast.error('Error', { description: 'Failed to register tool' })
    } finally {
      setSaving(false)
    }
  }

  const openDelete = (tool: Tool) => {
    setSelectedTool(tool)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!selectedTool) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tools?id=${selectedTool.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Deleted', { description: 'Tool removed from registry'  })
        setDeleteOpen(false)
        fetchTools()
      }
    } catch {
      toast.error('Error', { description: 'Failed to delete tool' })
    } finally {
      setSaving(false)
    }
  }

  const activeTools = tools.filter((t) => t.status === 'active')
  const highRiskTools = tools.filter((t) => t.riskLevel === 'high')
  const uniqueCategories = [...new Set(tools.map((t) => t.category))]

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">Tool Registry</h2>
          <p className="text-sm text-[#64748B] mt-1">Manage all tools available to AI agents</p>
        </div>
        <Button onClick={openAdd} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
          <Plus className="w-4 h-4 mr-2" />
          Register Tool
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Tools', value: tools.length, icon: Wrench, color: 'text-[#003ABC]' },
          { label: 'Active', value: activeTools.length, icon: Shield, color: 'text-emerald-600' },
          { label: 'High Risk', value: highRiskTools.length, icon: AlertTriangle, color: 'text-red-500' },
          { label: 'Categories', value: uniqueCategories.length, icon: Wrench, color: 'text-[#FF6A00]' },
        ].map((stat) => (
          <Card key={stat.label} className="border-[#E2E8F0]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#F8FAFC]">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#1E293B]">{stat.value}</p>
                <p className="text-xs text-[#94A3B8]">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white border-[#E2E8F0]"
          />
        </div>
        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[180px] bg-white border-[#E2E8F0]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-[#E2E8F0]">
        <CardContent className="p-0">
          {tools.length === 0 ? (
            <div className="py-12 text-center">
              <Wrench className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
              <p className="text-sm text-[#94A3B8]">No tools registered yet.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3">Name</th>
                    <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden md:table-cell">Category</th>
                    <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden sm:table-cell">Risk</th>
                    <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden lg:table-cell">Allowed Depts</th>
                    <th className="text-right text-xs font-semibold text-[#64748B] px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((tool) => (
                    <tr key={tool.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-[#94A3B8] flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-[#1E293B]">{tool.name}</p>
                            <p className="text-xs text-[#94A3B8] truncate max-w-[200px]">{tool.description}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge className={`text-[10px] ${categoryColors[tool.category] || 'bg-gray-100 text-gray-700'}`}>
                          {tool.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge className={`text-[10px] ${riskColors[tool.riskLevel] || ''}`}>
                          {tool.riskLevel}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(tool.allowedDepartments || []).slice(0, 3).map((dept) => (
                            <Badge key={dept} variant="secondary" className="text-[10px]">{dept}</Badge>
                          ))}
                          {(tool.allowedDepartments || []).length > 3 && (
                            <Badge variant="secondary" className="text-[10px]">+{(tool.allowedDepartments || []).length - 3}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDelete(tool)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#003ABC]" />
              Register Tool
            </DialogTitle>
            <DialogDescription>Add a new tool to the agent tool registry</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Tool Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Web Search API" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Risk Level</Label>
                <Select value={formRiskLevel} onValueChange={setFormRiskLevel}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Describe what this tool does..." rows={3} className="mt-1" />
            </div>
            <div>
              <Label>Allowed Departments (comma-separated)</Label>
              <Input value={formAllowed} onChange={(e) => setFormAllowed(e.target.value)} placeholder="engineering, marketing" className="mt-1" />
            </div>
            <div>
              <Label>Blocked Departments (comma-separated)</Label>
              <Input value={formBlocked} onChange={(e) => setFormBlocked(e.target.value)} placeholder="hr, legal" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Tool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{selectedTool?.name}&quot; from the registry?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}