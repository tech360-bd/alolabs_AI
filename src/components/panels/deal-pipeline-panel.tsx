'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  GitBranch, DollarSign, TrendingUp, Search, ChevronLeft,
  X, BarChart3, Target, ArrowUpRight, Clock, User, Calendar,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Deal {
  id: string
  contactId: string
  pipelineId: string
  stageId: string
  title: string
  value: number
  currency: string
  probability: number
  expectedClose?: string
  actualClose?: string
  lostReason?: string
  status: string
  createdAt: string
  contact?: { id: string; firstName: string; lastName: string; email: string }
  pipeline?: { id: string; name: string }
  stage?: { id: string; name: string; color: string }
}

interface Pipeline {
  id: string
  name: string
  description?: string
  isDefault: boolean
  sortOrder: number
  status: string
  totalValue: number
  stages: PipelineStageData[]
  _count?: { deals: number }
}

interface PipelineStageData {
  id: string
  pipelineId: string
  name: string
  color: string
  sortOrder: number
  probability: number
  createdAt: string
  dealCount: number
  totalValue: number
  deals?: Deal[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(val: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(val)
}

function formatDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(d?: string) {
  if (!d) return null
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return diff
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DealPipelinePanel() {
  // ── State ──
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('')
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stageDeals, setStageDeals] = useState<Record<string, Deal[]>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch pipelines ──
  const fetchPipelines = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/crm/pipelines')
      if (!res.ok) throw new Error('Failed to fetch pipelines')
      const json = await res.json()
      const data: Pipeline[] = json.data || []
      setPipelines(data)
      // Auto-select default or first pipeline
      if (data.length > 0) {
        const defaultPipeline = data.find(p => p.isDefault) || data[0]
        setSelectedPipelineId(defaultPipeline.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch deals per stage ──
  const fetchStageDeals = useCallback(async (pipelineId: string, searchTerm: string) => {
    if (!pipelineId) return
    try {
      const params = new URLSearchParams()
      params.set('pipelineId', pipelineId)
      params.set('status', 'active')
      params.set('limit', '100')
      if (searchTerm) params.set('search', searchTerm)
      const res = await fetch(`/api/crm/deals?${params}`)
      if (!res.ok) return
      const json = await res.json()
      const deals: Deal[] = json.data || []
      // Group by stage
      const grouped: Record<string, Deal[]> = {}
      deals.forEach(d => {
        const key = d.stageId
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(d)
      })
      setStageDeals(grouped)
    } catch (err) {
      console.error(err)
    }
  }, [])

  // ── Initial load ──
  useEffect(() => {
    fetchPipelines()
  }, [fetchPipelines])

  // ── Load deals when pipeline changes ──
  useEffect(() => {
    fetchStageDeals(selectedPipelineId, search)
  }, [selectedPipelineId, fetchStageDeals])

  // ── Search debounce ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchStageDeals(selectedPipelineId, search)
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, selectedPipelineId, fetchStageDeals])

  // ── Computed ──
  const currentPipeline = pipelines.find(p => p.id === selectedPipelineId)
  const stages = currentPipeline?.stages || []
  const totalPipelineValue = stages.reduce((sum, s) => sum + (s.totalValue || 0), 0)
  const totalDealCount = stages.reduce((sum, s) => sum + (s.dealCount || 0), 0)
  const weightedValue = stages.reduce((sum, s) => {
    const deals = stageDeals[s.id] || []
    return sum + deals.reduce((dsum, d) => dsum + d.value * (d.probability / 100), 0)
  }, 0)

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1E293B] flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-[#003ABC]" />
            Deal Pipeline
          </h2>
          <p className="text-sm text-[#64748B] mt-0.5">
            Visualize and manage your sales pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pipelines.length > 0 && (
            <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
              <SelectTrigger className="w-[200px] h-9 border-[#E2E8F0] text-[#1E293B] text-sm">
                <SelectValue placeholder="Select Pipeline" />
              </SelectTrigger>
              <SelectContent className="bg-white border-[#E2E8F0]">
                {pipelines.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-[#1E293B]">
                    {p.name} {p.isDefault ? '(Default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#003ABC]/10 flex items-center justify-center flex-shrink-0">
                <GitBranch className="w-5 h-5 text-[#003ABC]" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Total Deals</p>
                <p className="text-xl font-bold text-[#1E293B]">{totalDealCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Pipeline Value</p>
                <p className="text-xl font-bold text-[#1E293B]">{formatCurrency(totalPipelineValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Target className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Weighted Value</p>
                <p className="text-xl font-bold text-[#1E293B]">{formatCurrency(weightedValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">Stages</p>
                <p className="text-xl font-bold text-[#1E293B]">{stages.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="bg-white border-[#E2E8F0]">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <Input
              placeholder="Search deals by title or contact name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 border-[#E2E8F0] focus:border-[#003ABC] focus:ring-[#003ABC]/20 text-[#1E293B] placeholder:text-[#94A3B8]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && !loading && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <X className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700">Error loading pipeline</p>
              <p className="text-xs text-red-500">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchPipelines}
              className="border-red-200 text-red-700 hover:bg-red-100 text-xs h-8">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg bg-gray-100" />
              <Skeleton className="h-4 w-20 bg-gray-100" />
              <div className="space-y-2">
                <Skeleton className="h-24 w-full rounded-xl bg-gray-100" />
                <Skeleton className="h-24 w-full rounded-xl bg-gray-100" />
                <Skeleton className="h-20 w-full rounded-xl bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && pipelines.length === 0 && (
        <Card className="bg-white border-[#E2E8F0]">
          <CardContent className="py-16 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-[#F1F5F9] flex items-center justify-center mb-4">
              <GitBranch className="w-8 h-8 text-[#94A3B8]" />
            </div>
            <p className="text-sm font-medium text-[#1E293B]">No pipelines found</p>
            <p className="text-xs text-[#64748B] mt-1">Create a pipeline to start tracking deals</p>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Kanban Board */}
      {!loading && !error && stages.length > 0 && (
        <div className="flex flex-col xl:flex-row gap-6">
          {/* Kanban Columns */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-4 overflow-x-auto pb-4 xl:overflow-x-visible xl:pb-0">
              {stages.map((stage) => {
                const deals = stageDeals[stage.id] || []
                const stageValue = deals.reduce((sum, d) => sum + d.value, 0)
                return (
                  <div key={stage.id} className="flex-shrink-0 w-[280px] xl:flex-shrink xl:w-auto xl:flex-1">
                    {/* Column Header */}
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <h3 className="text-sm font-semibold text-[#1E293B] truncate">{stage.name}</h3>
                      <Badge variant="secondary" className="ml-auto text-[10px] bg-[#F1F5F9] text-[#64748B] border-0 h-5 px-1.5">
                        {deals.length}
                      </Badge>
                    </div>

                    {/* Column Value */}
                    <div className="flex items-center gap-1 mb-3 px-1">
                      <DollarSign className="w-3 h-3 text-[#94A3B8]" />
                      <span className="text-xs text-[#64748B] font-medium">{formatCurrency(stageValue)}</span>
                      <span className="text-[10px] text-[#94A3B8] ml-1">· {stage.probability}%</span>
                    </div>

                    {/* Cards */}
                    <div className="space-y-2.5 min-h-[200px]">
                      {deals.length === 0 ? (
                        <div className="rounded-xl border-2 border-dashed border-[#E2E8F0] p-6 flex items-center justify-center">
                          <p className="text-xs text-[#94A3B8]">No deals</p>
                        </div>
                      ) : (
                        deals.map((deal) => (
                          <Card
                            key={deal.id}
                            className={`bg-white border-[#E2E8F0] cursor-pointer transition-all hover:shadow-md hover:border-[#003ABC]/20 ${
                              selectedDeal?.id === deal.id ? 'ring-2 ring-[#003ABC]/30 border-[#003ABC]/30' : ''
                            }`}
                            onClick={() => setSelectedDeal(deal)}
                          >
                            <CardContent className="p-3.5 space-y-2.5">
                              {/* Deal Title */}
                              <p className="text-sm font-medium text-[#1E293B] leading-snug line-clamp-2">
                                {deal.title}
                              </p>

                              {/* Value & Probability */}
                              <div className="flex items-center justify-between">
                                <span className="text-base font-bold text-[#1E293B]">
                                  {formatCurrency(deal.value, deal.currency)}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] border-0 h-5 px-1.5"
                                  style={{ backgroundColor: `${stage.color}15`, color: stage.color }}
                                >
                                  {deal.probability}%
                                </Badge>
                              </div>

                              {/* Contact */}
                              {deal.contact && (
                                <div className="flex items-center gap-1.5 text-[#64748B]">
                                  <User className="w-3 h-3" />
                                  <span className="text-xs truncate">
                                    {deal.contact.firstName} {deal.contact.lastName}
                                  </span>
                                </div>
                              )}

                              {/* Expected Close */}
                              {deal.expectedClose && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-[#94A3B8]">
                                    <Calendar className="w-3 h-3" />
                                    <span className="text-[11px]">{formatDate(deal.expectedClose)}</span>
                                  </div>
                                  {(() => {
                                    const days = daysUntil(deal.expectedClose)
                                    if (days === null) return null
                                    return (
                                      <span className={`text-[10px] font-medium ${
                                        days < 0 ? 'text-red-500' : days <= 7 ? 'text-amber-600' : 'text-[#94A3B8]'
                                      }`}>
                                        {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`}
                                      </span>
                                    )
                                  })()}
                                </div>
                              )}

                              {/* Probability Bar */}
                              <Progress value={deal.probability} className="h-1 [&>div]:bg-[#003ABC]" />
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Deal Detail Sidebar */}
          {selectedDeal && (
            <div className="w-full xl:w-[340px] flex-shrink-0">
              <Card className="bg-white border-[#E2E8F0] sticky top-6">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-[#1E293B]">Deal Details</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F1F5F9]"
                      onClick={() => setSelectedDeal(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Title & Value */}
                  <div>
                    <h3 className="text-base font-semibold text-[#1E293B] leading-snug">
                      {selectedDeal.title}
                    </h3>
                    <p className="text-2xl font-bold text-[#1E293B] mt-1">
                      {formatCurrency(selectedDeal.value, selectedDeal.currency)}
                    </p>
                  </div>

                  {/* Stage Badge */}
                  {selectedDeal.stage && (
                    <Badge
                      className="text-xs border-0 px-3 py-1"
                      style={{ backgroundColor: `${selectedDeal.stage.color}20`, color: selectedDeal.stage.color }}
                    >
                      {selectedDeal.stage.name}
                    </Badge>
                  )}

                  <Separator className="bg-[#E2E8F0]" />

                  {/* Probability */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Win Probability</p>
                      <span className="text-sm font-bold text-[#1E293B]">{selectedDeal.probability}%</span>
                    </div>
                    <Progress value={selectedDeal.probability} className="h-2 [&>div]:bg-[#003ABC]" />
                    <p className="text-xs text-[#94A3B8] mt-1">
                      Weighted: {formatCurrency(selectedDeal.value * (selectedDeal.probability / 100), selectedDeal.currency)}
                    </p>
                  </div>

                  <Separator className="bg-[#E2E8F0]" />

                  {/* Contact */}
                  {selectedDeal.contact && (
                    <div>
                      <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">Contact</p>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-[#F8FAFC]">
                        <div className="w-9 h-9 rounded-full bg-[#003ABC]/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-[#003ABC]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1E293B]">
                            {selectedDeal.contact.firstName} {selectedDeal.contact.lastName}
                          </p>
                          <p className="text-xs text-[#64748B] truncate">{selectedDeal.contact.email}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div>
                    <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">Timeline</p>
                    <div className="space-y-2">
                      {selectedDeal.expectedClose && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs text-[#94A3B8]">Expected Close</p>
                            <p className="text-sm text-[#1E293B]">{formatDate(selectedDeal.expectedClose)}</p>
                          </div>
                        </div>
                      )}
                      {selectedDeal.actualClose && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-xs text-[#94A3B8]">Actual Close</p>
                            <p className="text-sm text-[#1E293B]">{formatDate(selectedDeal.actualClose)}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#F1F5F9] flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="w-3.5 h-3.5 text-[#64748B]" />
                        </div>
                        <div>
                          <p className="text-xs text-[#94A3B8]">Created</p>
                          <p className="text-sm text-[#1E293B]">{formatDate(selectedDeal.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-[#E2E8F0]" />

                  {/* Status */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#94A3B8]">Status</span>
                    <Badge className={`${selectedDeal.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'} text-xs border-0`}>
                      {selectedDeal.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}