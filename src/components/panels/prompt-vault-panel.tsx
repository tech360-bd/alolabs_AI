'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Plus,
  FileText,
  Shield,
  Search,
  Loader2,
  Trash2,
  Pencil,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

interface Prompt {
  id: string
  name: string
  category: string
  version: string
  locked: boolean
  createdAt: string
  updatedAt: string
  contentPreview: string
}

const CATEGORIES = [
  { value: 'system_prompts', label: 'System Prompts' },
  { value: 'agent_prompts', label: 'Agent Prompts' },
  { value: 'skill_prompts', label: 'Skill Prompts' },
  { value: 'workflow_prompts', label: 'Workflow Prompts' },
  { value: 'brand_prompts', label: 'Brand Prompts' },
]

const categoryColors: Record<string, string> = {
  system_prompts: 'bg-[#003ABC]/10 text-[#003ABC]',
  agent_prompts: 'bg-[#FF6A00]/10 text-[#FF6A00]',
  skill_prompts: 'bg-emerald-100 text-emerald-700',
  workflow_prompts: 'bg-purple-100 text-purple-700',
  brand_prompts: 'bg-pink-100 text-pink-700',
}

export default function PromptVaultPanel() {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [saving, setSaving] = useState(false)

  // Dialogs
  const [addOpen, setAddOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [revealContent, setRevealContent] = useState(false)
  const [fullContent, setFullContent] = useState('')

  // Form
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('system_prompts')
  const [formContent, setFormContent] = useState('')
  const [formVersion, setFormVersion] = useState('1.0.0')

  const fetchPrompts = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (tab !== 'all') params.set('category', tab)
      if (search) params.set('search', search)
      const res = await fetch(`/api/prompts?${params}`)
      const data = await res.json()
      setPrompts(data.prompts || [])
    } catch {
      toast.error('Error', { description: 'Failed to load prompts' })
    } finally {
      setLoading(false)
    }
  }, [tab, search, toast])

  useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts])

  const openAdd = () => {
    setFormName('')
    setFormCategory('system_prompts')
    setFormContent('')
    setFormVersion('1.0.0')
    setAddOpen(true)
  }

  const handleAdd = async () => {
    if (!formName.trim() || !formContent.trim()) {
      toast.error('Validation Error', { description: 'Name and content are required' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, category: formCategory, content: formContent, version: formVersion }),
      })
      if (res.ok) {
        toast.success('Created', { description: 'Prompt created successfully'  })
        setAddOpen(false)
        fetchPrompts()
      } else {
        const data = await res.json()
        toast.error('Error', { description: data.error })
      }
    } catch {
      toast.error('Error', { description: 'Failed to create prompt' })
    } finally {
      setSaving(false)
    }
  }

  const openView = async (prompt: Prompt) => {
    setSelectedPrompt(prompt)
    setRevealContent(false)
    setFullContent('')
    // Fetch full content from settings
    try {
      const res = await fetch('/api/prompts')
      const data = await res.json()
      // Find in all prompts - we need the full content from a direct settings query
      // For now we'll just use the preview
      setFullContent(prompt.contentPreview)
    } catch {
      setFullContent(prompt.contentPreview)
    }
    setViewOpen(true)
  }

  const openEdit = (prompt: Prompt) => {
    if (prompt.locked) {
      toast.error('Locked', { description: 'Unlock this prompt before editing' })
      return
    }
    setSelectedPrompt(prompt)
    setFormName(prompt.name)
    setFormCategory(prompt.category)
    setFormContent(prompt.contentPreview)
    setFormVersion(prompt.version)
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!selectedPrompt) return
    setSaving(true)
    try {
      const res = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPrompt.id, content: formContent, version: formVersion }),
      })
      if (res.ok) {
        toast.success('Updated', { description: 'Prompt updated successfully'  })
        setEditOpen(false)
        fetchPrompts()
      } else {
        const data = await res.json()
        toast.error('Error', { description: data.error })
      }
    } catch {
      toast.error('Error', { description: 'Failed to update prompt' })
    } finally {
      setSaving(false)
    }
  }

  const toggleLock = async (prompt: Prompt) => {
    try {
      const res = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: prompt.id, locked: !prompt.locked }),
      })
      if (res.ok) {
        toast.success(prompt.locked ? 'Unlocked' : 'Locked', { description: `Prompt ${prompt.locked ? 'unlocked' : 'locked'}` })
        fetchPrompts()
      }
    } catch {
      toast.error('Error', { description: 'Failed to toggle lock' })
    }
  }

  const openDelete = (prompt: Prompt) => {
    if (prompt.locked) {
      toast.error('Locked', { description: 'Unlock this prompt before deleting' })
      return
    }
    setSelectedPrompt(prompt)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!selectedPrompt) return
    setSaving(true)
    try {
      const res = await fetch(`/api/prompts?id=${selectedPrompt.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Deleted', { description: 'Prompt deleted successfully'  })
        setDeleteOpen(false)
        fetchPrompts()
      } else {
        const data = await res.json()
        toast.error('Error', { description: data.error })
      }
    } catch {
      toast.error('Error', { description: 'Failed to delete prompt' })
    } finally {
      setSaving(false)
    }
  }

  const filteredPrompts = tab === 'all' ? prompts : prompts

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">Prompt Vault</h2>
          <p className="text-sm text-[#64748B] mt-1">Secure storage for system, agent, and workflow prompts</p>
        </div>
        <Button onClick={openAdd} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
          <Plus className="w-4 h-4 mr-2" />
          Add Prompt
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
        <Input
          placeholder="Search prompts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-white border-[#E2E8F0]"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#F1F5F9]">
          <TabsTrigger value="all">All</TabsTrigger>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border-[#E2E8F0]">
            <CardContent className="p-0">
              {filteredPrompts.length === 0 ? (
                <div className="py-12 text-center">
                  <Shield className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-sm text-[#94A3B8]">No prompts found. Create your first prompt.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <table className="w-full">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                      <tr>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3">Name</th>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden md:table-cell">Category</th>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden sm:table-cell">Version</th>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden lg:table-cell">Updated</th>
                        <th className="text-center text-xs font-semibold text-[#64748B] px-4 py-3">Lock</th>
                        <th className="text-right text-xs font-semibold text-[#64748B] px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPrompts.map((prompt) => (
                        <tr key={prompt.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-[#94A3B8] flex-shrink-0" />
                              <span className="text-sm font-medium text-[#1E293B] truncate max-w-[200px]">{prompt.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <Badge className={`text-[10px] ${categoryColors[prompt.category] || 'bg-gray-100 text-gray-700'}`}>
                              {prompt.category.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-xs text-[#64748B] font-mono">v{prompt.version}</span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-xs text-[#94A3B8]">
                              {new Date(prompt.updatedAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleLock(prompt)}>
                              {prompt.locked ? (
                                <Lock className="w-3.5 h-3.5 text-red-500" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-[#94A3B8]" />
                              )}
                            </Button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openView(prompt)}>
                                <Eye className="w-3.5 h-3.5 text-[#64748B]" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(prompt)} disabled={prompt.locked}>
                                <Pencil className="w-3.5 h-3.5 text-[#64748B]" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDelete(prompt)} disabled={prompt.locked}>
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Prompt Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#003ABC]" />
              Add Prompt
            </DialogTitle>
            <DialogDescription>Create a new prompt template in the vault</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Prompt Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Customer Support Greeting" className="mt-1" />
            </div>
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
              <Label>Version</Label>
              <Input value={formVersion} onChange={(e) => setFormVersion(e.target.value)} placeholder="1.0.0" className="mt-1" />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Enter your prompt content here..."
                rows={8}
                className="mt-1 font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Prompt Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#003ABC]" />
              {selectedPrompt?.name}
            </DialogTitle>
            <DialogDescription>
              <Badge className={`text-[10px] mr-2 ${categoryColors[selectedPrompt?.category || '']}`}>
                {selectedPrompt?.category?.replace(/_/g, ' ') || ''}
              </Badge>
              Version {selectedPrompt?.version}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-[#64748B]">Prompt Content</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevealContent(!revealContent)}
                className="text-xs"
              >
                {revealContent ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                {revealContent ? 'Mask' : 'Reveal'}
              </Button>
            </div>
            <div className="bg-[#F8FAFC] rounded-lg p-4 min-h-[120px]">
              <p className="text-sm font-mono whitespace-pre-wrap break-words">
                {revealContent ? fullContent : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Prompt Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-[#FF6A00]" />
              Edit Prompt
            </DialogTitle>
            <DialogDescription>Update the prompt content and version</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Version</Label>
              <Input value={formVersion} onChange={(e) => setFormVersion(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={8}
                className="mt-1 font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prompt</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedPrompt?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}