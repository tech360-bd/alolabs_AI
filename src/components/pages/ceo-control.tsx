'use client'

import { useApiGet } from '@/hooks/use-api-actions'
import { useDataTable } from '@/hooks/use-data-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApproveAction } from '@/hooks/use-api-actions'
import { Button } from '@/components/ui/button'
import { Check, X, Loader2, Crown, TrendingUp, Target } from 'lucide-react'
import TableShell from '@/components/table-shell'

export default function CeoControlPage() {
  const { data: summary, loading: sumLoading } = useApiGet<any>('/api/ceo/summary')
  const { data: kpis, loading: kpiLoading } = useApiGet<any[]>('/api/ceo/kpis')
  const { data: deptPerf, loading: deptLoading } = useApiGet<any[]>('/api/ceo/department-performance')
  const approvals = useDataTable<any>({ endpoint: '/api/approvals', defaultParams: { status: 'pending' } })
  const { acting, act } = useApproveAction()

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" />Executive Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {sumLoading ? <div className="h-16 animate-pulse bg-slate-200 rounded" /> : (
            <p className="text-sm text-muted-foreground">{summary?.summary || summary?.text || 'No executive summary available. Connect to API for real-time insights.'}</p>
          )}
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiLoading ? (
          [...Array(4)].map((_, i) => <Card key={i}><CardContent className="pt-6"><div className="h-12 animate-pulse bg-slate-200 rounded" /></CardContent></Card>)
        ) : (
          (kpis ?? []).map((k: any, i: number) => {
            const trend = k.trend || k.change || 0
            const color = trend >= 0 ? 'text-emerald-600' : 'text-rose-600'
            return (
              <Card key={k.id || i}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{k.name || k.label || `KPI ${i + 1}`}</p>
                      <p className="text-2xl font-bold mt-0.5">{k.value ?? '-'}</p>
                    </div>
                    <div className="text-right">
                      <TrendingUp className={`h-4 w-4 ${color}`} />
                      <p className={`text-xs font-medium ${color}`}>{trend >= 0 ? '+' : ''}{trend}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
        {(!kpis || kpis.length === 0) && !kpiLoading && (
          <Card className="col-span-full"><CardContent className="py-4 text-center text-sm text-muted-foreground">No KPI data available.</CardContent></Card>
        )}
      </div>

      {/* Department Performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-emerald-500" />Department Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {deptLoading ? <div className="h-32 animate-pulse bg-slate-200 rounded" /> : (
            <div className="space-y-3">
              {(deptPerf ?? []).map((d: any, i: number) => (
                <div key={d.id || i} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-28 truncate">{d.department || d.name || '-'}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, d.score || d.performance || 0)}%` }} />
                  </div>
                  <span className="text-xs font-medium w-8 text-right">{d.score ?? d.performance ?? '-'}</span>
                </div>
              ))}
              {(!deptPerf || deptPerf.length === 0) && !deptLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">No department data available.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Approvals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pending Approvals</CardTitle>
        </CardHeader>
        <CardContent>
          <TableShell loading={approvals.loading} error={approvals.error} totalCount={approvals.total} page={approvals.page} pageSize={approvals.pageSize} onPageChange={approvals.setPage} onPageSizeChange={() => {}} searchValue="" onSearchChange={() => {}} noDataMessage="No pending approvals.">
            <div className="rounded-lg border max-h-64 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Requester</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {approvals.data.map((a: any) => {
                    const id = a.id || a._id
                    return (
                      <TableRow key={id}>
                        <TableCell className="font-medium text-sm">{a.type || a.actionType || '-'}</TableCell>
                        <TableCell className="text-sm">{a.requester || a.agentId || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{a.description || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => act('/api/approvals', id, 'approve', approvals.refresh)} disabled={acting === id} className="text-emerald-600 hover:bg-emerald-50">
                              {acting === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => act('/api/approvals', id, 'reject', approvals.refresh)} disabled={acting === id} className="text-rose-600 hover:bg-rose-50">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </TableShell>
        </CardContent>
      </Card>
    </div>
  )
}