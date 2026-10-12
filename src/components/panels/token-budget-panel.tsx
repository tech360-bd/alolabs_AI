'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Wallet,
  RefreshCw,
  Plus,
  TrendingUp,
  CalendarDays,
  DollarSign,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TokenBudget {
  id: string
  companyId: string
  companyName?: string
  monthlyBudget: number
  monthlyUsed: number
  dailyBudget: number
  dailyUsed: number
  periodStart: string
  periodEnd: string
}

interface TokenUsageEntry {
  id: string
  companyId?: string
  agentName: string
  modelName: string
  tokensUsed: number
  costUsd: number
  createdAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function budgetBarColor(pct: number): string {
  if (pct > 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-amber-500'
  return 'bg-green-500'
}

function budgetBadgeColor(pct: number): string {
  if (pct > 100) return 'bg-red-100 text-red-700 border-red-200'
  if (pct >= 80) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-green-100 text-green-700 border-green-200'
}

function budgetLabel(pct: number): string {
  if (pct > 100) return 'Over Budget'
  if (pct >= 80) return 'Near Limit'
  return 'On Track'
}

function formatCurrency(val: number): string {
  return `$${val.toFixed(4)}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TokenBudgetPanel() {
  const [budgets, setBudgets] = useState<TokenBudget[]>([])
  const [usage, setUsage] = useState<TokenUsageEntry[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string; slug: string }[]>([])
  const [selectedCompany, setSelectedCompany] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [usageForm, setUsageForm] = useState({
    agentName: '',
    modelName: '',
    tokensUsed: '',
    costUsd: '',
  })

  const loadData = useCallback(() => {
    const params = selectedCompany ? `?companyId=${selectedCompany}` : ''

    Promise.all([
      fetch('/api/companies').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/token-budget${params}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/token-usage${params}`).then((r) => r.json()).catch(() => []),
    ])
      .then(([compRes, budgetRes, usageRes]) => {
        const compData = compRes.data || []
        setCompanies(compData)

        const budgetData = Array.isArray(budgetRes) ? budgetRes : budgetRes.data || budgetRes.budgets || []
        setBudgets(budgetData)

        const rawUsage = Array.isArray(usageRes) ? usageRes : usageRes.data || usageRes.records || []
        const usageData = rawUsage.map((u: Record<string, unknown>) => ({
          id: u.id,
          companyId: u.companyId,
          agentName: u.agentId || 'Unknown',
          modelName: u.model || 'unknown',
          tokensUsed: u.totalTokens || 0,
          costUsd: u.costEstimate || 0,
          createdAt: u.createdAt,
        }))
        setUsage(usageData)
      })
      .finally(() => setLoading(false))
  }, [selectedCompany])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRecordUsage = async () => {
    if (!usageForm.agentName || !usageForm.tokensUsed) return
    try {
      await fetch('/api/token-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: usageForm.agentName,
          modelName: usageForm.modelName || 'unknown',
          tokensUsed: parseInt(usageForm.tokensUsed) || 0,
          costUsd: parseFloat(usageForm.costUsd) || 0,
          ...(selectedCompany ? { companyId: selectedCompany } : {}),
        }),
      })
      setDialogOpen(false)
      setUsageForm({ agentName: '', modelName: '', tokensUsed: '', costUsd: '' })
      loadData()
    } catch {
      // ignore
    }
  }

  // Find the active budget (first one, or filtered)
  const activeBudget = budgets[0] || null
  const monthlyPct = activeBudget ? (activeBudget.monthlyBudget > 0 ? (activeBudget.monthlyUsed / activeBudget.monthlyBudget) * 100 : 0) : 0
  const dailyPct = activeBudget ? (activeBudget.dailyBudget > 0 ? (activeBudget.dailyUsed / activeBudget.dailyBudget) * 100 : 0) : 0
  const monthlyRemaining = activeBudget ? Math.max(0, activeBudget.monthlyBudget - activeBudget.monthlyUsed) : 0
  const dailyRemaining = activeBudget ? Math.max(0, activeBudget.dailyBudget - activeBudget.dailyUsed) : 0

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#1E293B]">Token Budget</h2>
            <p className="text-xs text-[#94A3B8]">Monitor and manage token spending across companies</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCompany || '__all__'} onValueChange={(v) => setSelectedCompany(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-[200px] border-[#E2E8F0] text-[#1E293B] text-xs rounded-lg">
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#E2E8F0]">
              <SelectItem value="__all__">All Companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={loadData} variant="outline" className="rounded-lg border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC]">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-lg bg-[#003ABC] hover:bg-[#003ABC]/90 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Record Usage
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E2E8F0] sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-[#1E293B]">Record Token Usage</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Agent Name</Label>
                  <Input
                    placeholder="e.g. agent-crm-001"
                    value={usageForm.agentName}
                    onChange={(e) => setUsageForm((f) => ({ ...f, agentName: e.target.value }))}
                    className="border-[#E2E8F0] text-[#1E293B]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#1E293B] text-sm">Model</Label>
                  <Input
                    placeholder="e.g. gpt-4o, claude-3.5"
                    value={usageForm.modelName}
                    onChange={(e) => setUsageForm((f) => ({ ...f, modelName: e.target.value }))}
                    className="border-[#E2E8F0] text-[#1E293B]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#1E293B] text-sm">Tokens Used</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={usageForm.tokensUsed}
                      onChange={(e) => setUsageForm((f) => ({ ...f, tokensUsed: e.target.value }))}
                      className="border-[#E2E8F0] text-[#1E293B]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#1E293B] text-sm">Cost (USD)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="0.0000"
                      value={usageForm.costUsd}
                      onChange={(e) => setUsageForm((f) => ({ ...f, costUsd: e.target.value }))}
                      className="border-[#E2E8F0] text-[#1E293B]"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className="rounded-lg border-[#E2E8F0] text-[#1E293B]">Cancel</Button>
                </DialogClose>
                <Button onClick={handleRecordUsage} disabled={!usageForm.agentName || !usageForm.tokensUsed} className="rounded-lg bg-[#003ABC] hover:bg-[#003ABC]/90 text-white">
                  Record
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Budget Cards */}
      {activeBudget ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Monthly Budget */}
          <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#003ABC]/10 flex items-center justify-center">
                    <CalendarDays className="w-4 h-4 text-[#003ABC]" />
                  </div>
                  <CardTitle className="text-sm font-semibold text-[#1E293B]">Monthly Budget</CardTitle>
                </div>
                <Badge variant="secondary" className={`text-[10px] py-0 border ${budgetBadgeColor(monthlyPct)}`}>
                  {budgetLabel(monthlyPct)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-[#1E293B]">
                    {activeBudget.monthlyUsed.toLocaleString()}
                    <span className="text-sm font-normal text-[#94A3B8] ml-1">/ {activeBudget.monthlyBudget.toLocaleString()} tokens</span>
                  </p>
                </div>
                <p className="text-xs text-[#64748B]">{monthlyPct.toFixed(1)}%</p>
              </div>
              <div className="relative h-3 bg-[#F1F5F9] rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${budgetBarColor(monthlyPct)}`}
                  style={{ width: `${Math.min(monthlyPct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-[#94A3B8]">Remaining: {monthlyRemaining.toLocaleString()}</span>
                <span className="text-[10px] text-[#94A3B8]">
                  {activeBudget.periodStart ? `${new Date(activeBudget.periodStart).toLocaleDateString()} — ${new Date(activeBudget.periodEnd).toLocaleDateString()}` : ''}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Daily Budget */}
          <Card className="bg-white border-[#E2E8F0] rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#FF6A00]/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-[#FF6A00]" />
                  </div>
                  <CardTitle className="text-sm font-semibold text-[#1E293B]">Daily Budget</CardTitle>
                </div>
                <Badge variant="secondary" className={`text-[10px] py-0 border ${budgetBadgeColor(dailyPct)}`}>
                  {budgetLabel(dailyPct)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-[#1E293B]">
                    {activeBudget.dailyUsed.toLocaleString()}
                    <span className="text-sm font-normal text-[#94A3B8] ml-1">/ {activeBudget.dailyBudget.toLocaleString()} tokens</span>
                  </p>
                </div>
                <p className="text-xs text-[#64748B]">{dailyPct.toFixed(1)}%</p>
              </div>
              <div className="relative h-3 bg-[#F1F5F9] rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${budgetBarColor(dailyPct)}`}
                  style={{ width: `${Math.min(dailyPct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-[#94A3B8]">Remaining: {dailyRemaining.toLocaleString()}</span>
                <span className="text-[10px] text-[#94A3B8]">Resets at midnight UTC</span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="bg-white border-[#E2E8F0] rounded-xl p-8 text-center">
          <Wallet className="w-10 h-10 text-[#94A3B8] mx-auto mb-3" />
          <p className="text-[#64748B] text-sm">No budget data available</p>
          <p className="text-[#94A3B8] text-xs mt-1">Create a token budget via the API to get started</p>
        </Card>
      )}

      {/* Recent Token Usage Table */}
      <Card className="bg-white border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#64748B]" />
            <h3 className="text-sm font-semibold text-[#1E293B]">Recent Token Usage</h3>
          </div>
          <Badge variant="secondary" className="text-[10px] bg-[#F8FAFC] text-[#64748B]">
            {usage.length} records
          </Badge>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="bg-[#F8FAFC] hover:bg-[#F8FAFC] border-[#E2E8F0]">
                <TableHead className="text-[#64748B] font-medium text-xs">Agent</TableHead>
                <TableHead className="text-[#64748B] font-medium text-xs">Model</TableHead>
                <TableHead className="text-[#64748B] font-medium text-xs text-right">Tokens</TableHead>
                <TableHead className="text-[#64748B] font-medium text-xs text-right">Cost</TableHead>
                <TableHead className="text-[#64748B] font-medium text-xs">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-[#94A3B8] py-12 text-xs">No usage records found</TableCell>
                </TableRow>
              ) : (
                usage.map((entry) => (
                  <TableRow key={entry.id} className="border-[#E2E8F0]/50 hover:bg-[#F8FAFC]">
                    <TableCell className="text-[#1E293B] text-xs font-medium">{entry.agentName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] py-0 bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]">
                        {entry.modelName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#1E293B] text-xs font-mono text-right">{entry.tokensUsed.toLocaleString()}</TableCell>
                    <TableCell className="text-[#1E293B] text-xs font-mono text-right">{formatCurrency(entry.costUsd)}</TableCell>
                    <TableCell className="text-[#94A3B8] text-xs whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}