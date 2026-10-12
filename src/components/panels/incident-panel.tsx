'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  Plus,
  Search,
  Clock,
  ShieldAlert,
  CheckCircle,
  Loader2,
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
import { toast } from 'sonner'

interface TimelineEntry {
  status: string
  timestamp: string
  note: string
}

interface Incident {
  id: string
  incidentId: string
  type: string
  severity: string
  description: string
  assignedDept: string
  status: string
  resolution: string
  timeline: TimelineEntry[]
  createdAt: string
  updatedAt: string
}

interface Stats {
  active: number
  investigating: number
  resolved: number
  total: number
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const statusColors: Record<string, string> = {
  active: 'bg-red-100 text-red-700',
  investigating: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
}

const TYPES = ['security_breach', 'data_leak', 'unauthorized_access', 'service_outage', 'performance', 'compliance', 'other']
const SEVERITIES = ['critical', 'high', 'medium', 'low']
const DEPARTMENTS = ['security', 'engineering', 'devops', 'legal', 'hr', 'management', 'unassigned']

export default function IncidentPanel() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [stats, setStats] = useState<Stats>({ active: 0, investigating: 0, resolved: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [saving, setSaving] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)

  // Resolve dialog
  const [resolveOpen, setResolveOpen] = useState(false)
  const [resolveText, setResolveText] = useState('')
  const [resolveIncident, setResolveIncident] = useState<Incident | null>(null)

  const [formType, setFormType] = useState('security_breach')
  const [formSeverity, setFormSeverity] = useState('medium')
  const [formDescription, setFormDescription] = useState('')
  const [formDept, setFormDept] = useState('security')

  const fetchIncidents = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (tab !== 'all') params.set('status', tab)
      const res = await fetch(`/api/incidents?${params}`)
      const data = await res.json()
      setIncidents(data.incidents || [])
      setStats(data.stats || { active: 0, investigating: 0, resolved: 0, total: 0 })
    } catch {
      toast.error('Error', { description: 'Failed to load incidents' })
    } finally {
      setLoading(false)
    }
  }, [tab, toast])

  useEffect(() => {
    fetchIncidents()
  }, [fetchIncidents])

  // Also fetch all for stats
  const fetchAllStats = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents')
      const data = await res.json()
      setStats(data.stats || { active: 0, investigating: 0, resolved: 0, total: 0 })
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchAllStats()
  }, [fetchAllStats])

  const openAdd = () => {
    setFormType('security_breach')
    setFormSeverity('medium')
    setFormDescription('')
    setFormDept('security')
    setAddOpen(true)
  }

  const handleAdd = async () => {
    if (!formDescription.trim()) {
      toast.error('Validation Error', { description: 'Description is required' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          severity: formSeverity,
          description: formDescription,
          assignedDept: formDept,
        }),
      })
      if (res.ok) {
        toast.success('Reported', { description: 'Incident has been reported'  })
        setAddOpen(false)
        fetchIncidents()
        fetchAllStats()
      } else {
        const data = await res.json()
        toast.error('Error', { description: data.error })
      }
    } catch {
      toast.error('Error', { description: 'Failed to report incident' })
    } finally {
      setSaving(false)
    }
  }

  const openDetail = (incident: Incident) => {
    setSelectedIncident(incident)
    setDetailOpen(true)
  }

  const openResolve = (incident: Incident) => {
    setResolveIncident(incident)
    setResolveText('')
    setResolveOpen(true)
  }

  const handleResolve = async () => {
    if (!resolveIncident || !resolveText.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/incidents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resolveIncident.id, status: 'resolved', resolution: resolveText }),
      })
      if (res.ok) {
        toast.success('Resolved', { description: 'Incident marked as resolved'  })
        setResolveOpen(false)
        setDetailOpen(false)
        fetchIncidents()
        fetchAllStats()
      }
    } catch {
      toast.error('Error', { description: 'Failed to resolve incident' })
    } finally {
      setSaving(false)
    }
  }

  const handleInvestigate = async (incident: Incident) => {
    setSaving(true)
    try {
      const res = await fetch('/api/incidents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: incident.id, status: 'investigating' }),
      })
      if (res.ok) {
        toast.success('Investigating', { description: 'Incident status updated'  })
        fetchIncidents()
        fetchAllStats()
      }
    } catch {
      toast.error('Error', { description: 'Failed to update status' })
    } finally {
      setSaving(false)
    }
  }

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
          <h2 className="text-2xl font-bold text-[#1E293B]">Incident Center</h2>
          <p className="text-sm text-[#64748B] mt-1">Track and manage security incidents</p>
        </div>
        <Button onClick={openAdd} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
          <Plus className="w-4 h-4 mr-2" />
          Report Incident
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active', value: stats.active, icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-50' },
          { label: 'Investigating', value: stats.investigating, icon: Search, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Total', value: stats.total, icon: AlertTriangle, color: 'text-[#003ABC]', bg: 'bg-blue-50' },
        ].map((stat) => (
          <Card key={stat.label} className="border-[#E2E8F0]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
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

      {/* Tabs + Table */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#F1F5F9]">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="investigating">Investigating</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border-[#E2E8F0]">
            <CardContent className="p-0">
              {incidents.length === 0 ? (
                <div className="py-12 text-center">
                  <ShieldAlert className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
                  <p className="text-sm text-[#94A3B8]">No incidents found.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <table className="w-full">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                      <tr>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3">ID</th>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3">Severity</th>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden md:table-cell">Type</th>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden lg:table-cell">Description</th>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden sm:table-cell">Assigned</th>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3">Status</th>
                        <th className="text-left text-xs font-semibold text-[#64748B] px-4 py-3 hidden xl:table-cell">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidents.map((incident) => (
                        <tr
                          key={incident.id}
                          className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                          onClick={() => openDetail(incident)}
                        >
                          <td className="px-4 py-3">
                            <span className="text-xs font-mono font-semibold text-[#003ABC]">{incident.incidentId}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={`text-[10px] ${severityColors[incident.severity] || ''}`}>
                              {incident.severity}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-[#64748B] capitalize">{incident.type?.replace(/_/g, ' ')}</span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-xs text-[#1E293B] truncate block max-w-[250px]">{incident.description}</span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-xs text-[#64748B] capitalize">{incident.assignedDept}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={`text-[10px] ${statusColors[incident.status] || ''}`}>
                              {incident.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <span className="text-xs text-[#94A3B8]">
                              {new Date(incident.createdAt).toLocaleDateString()}
                            </span>
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

      {/* Report Incident Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#003ABC]" />
              Report Incident
            </DialogTitle>
            <DialogDescription>Report a new security or operational incident</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={formSeverity} onValueChange={setFormSeverity}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Assigned Department</Label>
              <Select value={formDept} onValueChange={setFormDept}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Describe the incident in detail..." rows={5} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          {selectedIncident && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <DialogTitle className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-500" />
                    {selectedIncident.incidentId}
                  </DialogTitle>
                  <Badge className={`text-[10px] ${severityColors[selectedIncident.severity]}`}>
                    {selectedIncident.severity}
                  </Badge>
                  <Badge className={`text-[10px] ${statusColors[selectedIncident.status]}`}>
                    {selectedIncident.status}
                  </Badge>
                </div>
                <DialogDescription>
                  {selectedIncident.type?.replace(/_/g, ' ')} • Assigned to{' '}
                  <span className="capitalize">{selectedIncident.assignedDept}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-[#64748B]">Description</Label>
                  <p className="text-sm text-[#1E293B] mt-1 bg-[#F8FAFC] p-3 rounded-lg">
                    {selectedIncident.description}
                  </p>
                </div>

                {selectedIncident.resolution && (
                  <div>
                    <Label className="text-xs text-[#64748B]">Resolution</Label>
                    <p className="text-sm text-emerald-700 mt-1 bg-emerald-50 p-3 rounded-lg">
                      {selectedIncident.resolution}
                    </p>
                  </div>
                )}

                <Separator />

                <div>
                  <Label className="text-xs text-[#64748B] flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Timeline
                  </Label>
                  <div className="mt-2 space-y-3">
                    {(selectedIncident.timeline || []).map((entry, idx) => (
                      <div key={idx} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
                            entry.status === 'resolved' ? 'bg-emerald-500' :
                            entry.status === 'investigating' ? 'bg-amber-400' : 'bg-red-500'
                          }`} />
                          {idx < (selectedIncident.timeline || []).length - 1 && (
                            <div className="w-px flex-1 bg-[#E2E8F0] mt-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-3">
                          <p className="text-sm text-[#1E293B]">{entry.note}</p>
                          <p className="text-[10px] text-[#94A3B8] mt-0.5">
                            {new Date(entry.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                  <span>Created: {new Date(selectedIncident.createdAt).toLocaleString()}</span>
                  <span>•</span>
                  <span>Updated: {new Date(selectedIncident.updatedAt).toLocaleString()}</span>
                </div>

                {/* Actions */}
                {selectedIncident.status !== 'resolved' && (
                  <div className="flex gap-2">
                    {selectedIncident.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleInvestigate(selectedIncident)}
                        disabled={saving}
                        className="text-amber-600 border-amber-200 hover:bg-amber-50"
                      >
                        <Search className="w-4 h-4 mr-1" />
                        Start Investigation
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openResolve(selectedIncident)}
                      className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Resolve
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Resolve Incident</DialogTitle>
            <DialogDescription>Provide resolution details for {resolveIncident?.incidentId}</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Resolution</Label>
            <Textarea
              value={resolveText}
              onChange={(e) => setResolveText(e.target.value)}
              placeholder="Describe how the incident was resolved..."
              rows={4}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={saving || !resolveText.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}