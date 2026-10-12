'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Download,
  Eye,
  Filter,
  Search,
  Image as ImageIcon,
  Video,
  Music,
  FileBarChart,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface OutputItem {
  id: string
  taskId: string
  type: string
  content: string
  filePath: string | null
  createdAt: string
  task?: { agentId?: string; agent?: { name?: string; department?: string }; status?: string }
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  text: { icon: FileText, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10', label: 'Text' },
  file: { icon: FileText, color: 'text-[#64748B]', bg: 'bg-gray-100', label: 'File' },
  image: { icon: ImageIcon, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Image' },
  video: { icon: Video, color: 'text-red-600', bg: 'bg-red-50', label: 'Video' },
  audio: { icon: Music, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Audio' },
  report: { icon: FileBarChart, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Report' },
}

export default function OutputCenterPanel() {
  const [outputs, setOutputs] = useState<OutputItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [viewOutput, setViewOutput] = useState<OutputItem | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const fetchOutputs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', search })
      if (typeFilter) params.set('type', typeFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/outputs?${params}`)
      if (res.ok) {
        const json = await res.json()
        setOutputs(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Error', { description: 'Failed to load outputs' })
    } finally {
      setLoading(false)
    }
  }, [page, search, typeFilter, statusFilter, toast])

  useEffect(() => { fetchOutputs() }, [fetchOutputs])

  const filteredOutputs = outputs.filter((o) => {
    if (dateFrom && new Date(o.createdAt) < new Date(dateFrom)) return false
    if (dateTo && new Date(o.createdAt) > new Date(dateTo + 'T23:59:59')) return false
    return true
  })

  const typeCounts = outputs.reduce((acc, o) => {
    acc[o.type] = (acc[o.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1E293B]">Output Center</h2>
            <p className="text-xs text-[#94A3B8]">{total} total outputs</p>
          </div>
        </div>
      </div>

      {/* Type Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Object.entries(typeConfig).map(([key, cfg]) => (
          <Card
            key={key}
            className={`border-[#E2E8F0] cursor-pointer transition-all hover:shadow-sm ${typeFilter === key ? 'ring-2 ring-[#003ABC]/30 border-[#003ABC]/40' : ''}`}
            onClick={() => setTypeFilter(typeFilter === key ? '' : key)}
          >
            <CardContent className="p-3 text-center">
              <div className={`h-8 w-8 rounded-lg ${cfg.bg} flex items-center justify-center mx-auto mb-1.5`}>
                <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
              </div>
              <p className="text-sm font-bold text-[#1E293B]">{typeCounts[key] || 0}</p>
              <p className="text-[10px] text-[#94A3B8]">{cfg.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-[#E2E8F0]">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <Input
                placeholder="Search outputs..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9 h-9 text-sm border-[#E2E8F0]"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[140px] h-9 text-sm border-[#E2E8F0]">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-[#94A3B8]" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Types</SelectItem>
                {Object.entries(typeConfig).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full sm:w-[150px] h-9 text-sm border-[#E2E8F0]"
              placeholder="From date"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full sm:w-[150px] h-9 text-sm border-[#E2E8F0]"
              placeholder="To date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Outputs Table */}
      <Card className="border-[#E2E8F0]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Outputs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : filteredOutputs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-10 w-10 text-[#CBD5E1] mx-auto mb-3" />
              <p className="text-sm text-[#94A3B8]">No outputs found</p>
              <p className="text-xs text-[#CBD5E1] mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0]">
                    <TableHead className="text-xs text-[#64748B]">Type</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Agent</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Task</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Preview</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Timestamp</TableHead>
                    <TableHead className="text-xs text-[#64748B] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOutputs.map((o) => {
                    const cfg = typeConfig[o.type] || typeConfig.text
                    const Icon = cfg.icon
                    return (
                      <TableRow key={o.id} className="border-[#E2E8F0]">
                        <TableCell>
                          <div className={`h-7 w-7 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                            <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-[#1E293B]">
                          {o.task?.agent?.name || o.task?.agentId?.slice(0, 8) || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B] max-w-[100px] truncate">
                          {o.taskId.slice(0, 12)}...
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B] max-w-[200px] truncate">
                          {o.content.slice(0, 80)}{o.content.length > 80 ? '...' : ''}
                        </TableCell>
                        <TableCell className="text-xs text-[#94A3B8]">
                          {new Date(o.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewOutput(o)}
                              className="h-7 w-7 p-0 text-[#64748B] hover:text-[#003ABC] hover:bg-[#003ABC]/5"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {o.type === 'file' && o.filePath && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-[#64748B] hover:text-[#003ABC] hover:bg-[#003ABC]/5"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Output Dialog */}
      <Dialog open={!!viewOutput} onOpenChange={(open) => !open && setViewOutput(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B] flex items-center gap-2">
              {(() => {
                if (!viewOutput) return null
                const cfg = typeConfig[viewOutput.type] || typeConfig.text
                return <><cfg.icon className={`h-4 w-4 ${cfg.color}`} /> {cfg.label} Output</>
              })()}
            </DialogTitle>
          </DialogHeader>
          {viewOutput && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-[#94A3B8] uppercase">Task ID</p>
                  <p className="text-xs text-[#1E293B] font-mono">{viewOutput.taskId}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#94A3B8] uppercase">Agent</p>
                  <p className="text-xs text-[#1E293B]">{viewOutput.task?.agent?.name || viewOutput.task?.agentId || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#94A3B8] uppercase">Type</p>
                  <Badge variant="outline" className="text-[10px] capitalize border-[#E2E8F0] text-[#64748B]">
                    {viewOutput.type}
                  </Badge>
                </div>
                <div>
                  <p className="text-[10px] text-[#94A3B8] uppercase">Created</p>
                  <p className="text-xs text-[#1E293B]">{new Date(viewOutput.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-[#94A3B8] uppercase mb-1.5">Content</p>
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4">
                  <pre className="text-xs text-[#1E293B] whitespace-pre-wrap break-words max-h-96 overflow-y-auto font-mono">
                    {viewOutput.content}
                  </pre>
                </div>
              </div>
              {viewOutput.filePath && (
                <div>
                  <p className="text-[10px] text-[#94A3B8] uppercase mb-1.5">File Path</p>
                  <p className="text-xs text-[#1E293B] font-mono bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2">
                    {viewOutput.filePath}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}