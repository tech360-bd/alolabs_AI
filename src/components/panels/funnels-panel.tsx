'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  GitBranch,
  Plus,
  Search,
  Loader2,
  Eye,
  Users,
  TrendingUp,
  Trash2,
  Edit,
  GripVertical,
  ArrowDown,
  ExternalLink,
  BarChart3,
  X,
  Layout,
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
import { toast } from 'sonner'

interface FunnelStep {
  title: string
  content: string
  type: 'landing_page' | 'optin' | 'sales_page' | 'thank_you'
  visitors: number
  conversions: number
}

interface Funnel {
  id: string
  name: string
  description: string
  steps: FunnelStep[]
  visitors: number
  leads: number
  status: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface FunnelStats {
  total: number
  avgConversionRate: number
  totalVisitors: number
  totalLeads: number
}

const stepTypeColors: Record<string, string> = {
  landing_page: 'bg-blue-100 text-blue-700',
  optin: 'bg-amber-100 text-amber-700',
  sales_page: 'bg-purple-100 text-purple-700',
  thank_you: 'bg-emerald-100 text-emerald-700',
}

const stepTypeLabels: Record<string, string> = {
  landing_page: 'Landing Page',
  optin: 'Opt-in',
  sales_page: 'Sales Page',
  thank_you: 'Thank You',
}

export default function FunnelsPanel() {
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [stats, setStats] = useState<FunnelStats>({ total: 0, avgConversionRate: 0, totalVisitors: 0, totalLeads: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedFunnel, setSelectedFunnel] = useState<Funnel | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSteps, setFormSteps] = useState<FunnelStep[]>([])

  const fetchFunnels = useCallback(async () => {
    try {
      const res = await fetch('/api/funnels')
      const data = await res.json()
      setFunnels(data.funnels || [])
      setStats(data.stats || { total: 0, avgConversionRate: 0, totalVisitors: 0, totalLeads: 0 })
    } catch {
      toast.error('Error', { description: 'Failed to load funnels' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchFunnels() }, [fetchFunnels])

  const filteredFunnels = funnels.filter((f) => {
    if (!search) return true
    const haystack = `${f.name} ${f.description}`.toLowerCase()
    return haystack.includes(search.toLowerCase())
  })

  const getConversionRate = (f: Funnel) => {
    if (!f.visitors || f.visitors === 0) return 0
    return Math.round(((f.leads || 0) / f.visitors) * 100)
  }

  const openCreate = () => {
    setFormName(''); setFormDescription('')
    setFormSteps([
      { title: 'Landing Page', content: '', type: 'landing_page', visitors: 0, conversions: 0 },
      { title: 'Opt-in Page', content: '', type: 'optin', visitors: 0, conversions: 0 },
      { title: 'Thank You', content: '', type: 'thank_you', visitors: 0, conversions: 0 },
    ])
    setEditMode(false)
    setAddOpen(true)
  }

  const openEdit = (funnel: Funnel) => {
    setFormName(funnel.name)
    setFormDescription(funnel.description)
    setFormSteps([...funnel.steps])
    setEditMode(true)
    setAddOpen(true)
  }

  const addStep = () => {
    setFormSteps([...formSteps, { title: `Step ${formSteps.length + 1}`, content: '', type: 'landing_page', visitors: 0, conversions: 0 }])
  }

  const removeStep = (idx: number) => {
    if (formSteps.length <= 1) return
    setFormSteps(formSteps.filter((_, i) => i !== idx))
  }

  const updateStep = (idx: number, field: keyof FunnelStep, value: string | number) => {
    const updated = [...formSteps]
    ;(updated[idx] as unknown as Record<string, unknown>)[field] = value
    setFormSteps(updated)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Validation Error', { description: 'Name is required' })
      return
    }
    setSaving(true)
    try {
      if (editMode && selectedFunnel) {
        const res = await fetch('/api/funnels', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedFunnel.id, name: formName, description: formDescription, steps: formSteps }),
        })
        if (res.ok) { toast.success('Updated', { description: 'Funnel updated successfully'  }); setAddOpen(false); fetchFunnels(); if (selectedFunnel) { const data = await res.json(); setSelectedFunnel({ ...selectedFunnel, ...data }) } }
        else { const data = await res.json(); toast.error('Error', { description: data.error }) }
      } else {
        const res = await fetch('/api/funnels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, description: formDescription, steps: formSteps }),
        })
        if (res.ok) { toast.success('Created', { description: 'Funnel created successfully'  }); setAddOpen(false); fetchFunnels() }
        else { const data = await res.json(); toast.error('Error', { description: data.error }) }
      }
    } catch { toast.error('Error', { description: 'Failed to save funnel' }) }
    finally { setSaving(false) }
  }

  const handleDelete = async (funnel: Funnel) => {
    if (!confirm(`Delete funnel "${funnel.name}"?`)) return
    try {
      const res = await fetch(`/api/funnels?id=${funnel.id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Deleted', { description: 'Funnel deleted'  }); setSelectedFunnel(null); fetchFunnels() }
    } catch { toast.error('Error', { description: 'Failed to delete funnel' }) }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-24 rounded-xl" />))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl md:col-span-2" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">Funnel Builder</h2>
          <p className="text-sm text-[#64748B] mt-1">Build and optimize conversion funnels</p>
        </div>
        <Button onClick={openCreate} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
          <Plus className="w-4 h-4 mr-2" /> New Funnel
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Funnels', value: stats.total, icon: GitBranch, color: 'text-[#003ABC]', bg: 'bg-blue-50' },
          { label: 'Avg Conversion', value: `${stats.avgConversionRate}%`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Total Visitors', value: stats.totalVisitors, icon: Eye, color: 'text-[#FF6A00]', bg: 'bg-orange-50' },
          { label: 'Total Leads', value: stats.totalLeads, icon: Users, color: 'text-purple-500', bg: 'bg-purple-50' },
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: Funnel List */}
        <Card className="border-[#E2E8F0]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Funnels</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <Input placeholder="Search funnels..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[500px]">
              {filteredFunnels.length === 0 ? (
                <div className="py-12 text-center">
                  <Layout className="w-10 h-10 text-[#CBD5E1] mx-auto mb-2" />
                  <p className="text-sm text-[#94A3B8]">No funnels found.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F1F5F9]">
                  {filteredFunnels.map((funnel) => (
                    <button key={funnel.id} onClick={() => setSelectedFunnel(funnel)} className={`w-full text-left px-4 py-3 hover:bg-[#F8FAFC] transition-colors ${selectedFunnel?.id === funnel.id ? 'bg-[#F0F7FF] border-l-2 border-l-[#003ABC]' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1E293B] truncate">{funnel.name}</p>
                          <p className="text-[11px] text-[#94A3B8] mt-0.5">{funnel.steps.length} steps &bull; {funnel.visitors || 0} visitors</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${getConversionRate(funnel)}%` }} />
                            </div>
                            <span className="text-[10px] font-medium text-emerald-600">{getConversionRate(funnel)}%</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Funnel Detail / Preview */}
        <Card className="border-[#E2E8F0] md:col-span-2">
          <CardContent className="p-4 md:p-6">
            {selectedFunnel ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-[#1E293B]">{selectedFunnel.name}</h3>
                      <Badge className="text-[10px] bg-[#F1F5F9] text-[#64748B]">{selectedFunnel.status || 'draft'}</Badge>
                    </div>
                    <p className="text-xs text-[#64748B]">{selectedFunnel.description || 'No description'}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[#94A3B8]">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{selectedFunnel.visitors || 0} visitors</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{selectedFunnel.leads || 0} leads</span>
                      <span className="flex items-center gap-1 text-emerald-600"><TrendingUp className="w-3 h-3" />{getConversionRate(selectedFunnel)}% conversion</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(selectedFunnel)}><Edit className="w-4 h-4 mr-1" />Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(selectedFunnel)} className="text-red-600 border-red-200 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>

                <Separator />

                {/* Vertical Step Visualization */}
                <div>
                  <Label className="text-xs text-[#64748B] flex items-center gap-1"><GitBranch className="w-3 h-3" /> Funnel Steps</Label>
                  <div className="mt-3 space-y-0">
                    {selectedFunnel.steps.map((step, idx) => {
                      const stepRate = step.visitors > 0 ? Math.round((step.conversions / step.visitors) * 100) : 0
                      return (
                        <div key={idx}>
                          <div className="flex items-start gap-3 p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] hover:border-[#CBD5E1] transition-colors">
                            <div className="flex flex-col items-center mt-0.5">
                              <div className="w-6 h-6 rounded-full bg-[#003ABC] text-white text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                              {idx < selectedFunnel.steps.length - 1 && <div className="w-px h-8 bg-[#CBD5E1] mt-1" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <GripVertical className="w-3 h-3 text-[#CBD5E1]" />
                                <span className="text-sm font-medium text-[#1E293B]">{step.title}</span>
                                <Badge className={`text-[9px] ${stepTypeColors[step.type] || ''}`}>{stepTypeLabels[step.type] || step.type}</Badge>
                              </div>
                              {step.content && <p className="text-xs text-[#64748B] line-clamp-2 mb-2">{step.content}</p>}
                              <div className="flex items-center gap-4 text-[10px] text-[#94A3B8]">
                                <span>{step.visitors} visitors</span>
                                <span>{step.conversions} conversions</span>
                                <span className="text-emerald-600 font-medium">{stepRate}%</span>
                              </div>
                              {step.visitors > 0 && (
                                <div className="mt-1.5 h-1 bg-[#E2E8F0] rounded-full overflow-hidden w-32">
                                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${stepRate}%` }} />
                                </div>
                              )}
                            </div>
                          </div>
                          {idx < selectedFunnel.steps.length - 1 && (
                            <div className="flex justify-center py-1"><ArrowDown className="w-4 h-4 text-[#CBD5E1]" /></div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <BarChart3 className="w-12 h-12 text-[#CBD5E1] mb-3" />
                <p className="text-sm text-[#94A3B8]">Select a funnel to preview</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#003ABC]" />
              {editMode ? 'Edit Funnel' : 'New Funnel'}
            </DialogTitle>
            <DialogDescription>{editMode ? 'Update funnel configuration' : 'Create a new conversion funnel'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Name</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Funnel name..." className="mt-1" /></div>
            <div><Label>Description</Label><Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Funnel description..." rows={2} className="mt-1" /></div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#64748B] flex items-center gap-1"><GitBranch className="w-3 h-3" /> Steps</Label>
              <Button size="sm" variant="outline" onClick={addStep} className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" />Add Step</Button>
            </div>

            <div className="space-y-3">
              {formSteps.map((step, idx) => (
                <div key={idx} className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] relative">
                  <div className="flex items-center gap-2 mb-2">
                    <GripVertical className="w-4 h-4 text-[#CBD5E1]" />
                    <span className="text-xs font-semibold text-[#64748B]">Step {idx + 1}</span>
                    {formSteps.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto text-red-400 hover:text-red-600" onClick={() => removeStep(idx)}><X className="w-3 h-3" /></Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-[10px]">Title</Label><Input value={step.title} onChange={(e) => updateStep(idx, 'title', e.target.value)} className="h-8 text-sm mt-0.5" /></div>
                    <div><Label className="text-[10px]">Type</Label><Select value={step.type} onValueChange={(v) => updateStep(idx, 'type', v)}><SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="landing_page">Landing Page</SelectItem><SelectItem value="optin">Opt-in</SelectItem><SelectItem value="sales_page">Sales Page</SelectItem><SelectItem value="thank_you">Thank You</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="mt-2"><Label className="text-[10px]">Content</Label><Textarea value={step.content} onChange={(e) => updateStep(idx, 'content', e.target.value)} placeholder="Step content..." rows={2} className="mt-0.5 text-sm" /></div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#003ABC] hover:bg-[#003ABC]/90">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editMode ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
