'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { useApiGet } from '@/hooks/use-api-actions'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HeartPulse, Activity } from 'lucide-react'

const statusColor = (s: string) => {
  if (s === 'healthy' || s === 'up' || s === 'ok') return 'bg-emerald-100 text-emerald-700'
  if (s === 'degraded' || s === 'warning') return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
}

export default function AiHealthPage() {
  const checks = useDataTable<any>({ endpoint: '/api/ai-health/checks' })
  const { data: services, loading: svcLoading } = useApiGet<any[]>('/api/ai-health/services')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {svcLoading ? (
          [...Array(4)].map((_, i) => <Card key={i}><CardContent className="pt-6"><div className="h-12 animate-pulse bg-slate-200 rounded" /></CardContent></Card>)
        ) : (
          (services ?? []).map((s: any, i: number) => (
            <Card key={s.id || i}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{s.name || `Service ${i + 1}`}</p>
                    <p className="text-lg font-bold mt-0.5">{s.uptime || '99.9'}%</p>
                  </div>
                  <Badge className={statusColor(s.status)}>{s.status || 'unknown'}</Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
        {(!services || services.length === 0) && !svcLoading && (
          <Card className="col-span-full"><CardContent className="py-6 text-center text-sm text-muted-foreground">No service status data available.</CardContent></Card>
        )}
      </div>

      <TableShell loading={checks.loading} error={checks.error} totalCount={checks.total} page={checks.page} pageSize={checks.pageSize} onPageChange={checks.setPage} onPageSizeChange={checks.setPageSize} searchValue={checks.search} onSearchChange={checks.setSearch} searchPlaceholder="Search health checks...">
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Service</TableHead><TableHead>Status</TableHead><TableHead>Response Time</TableHead><TableHead>Message</TableHead><TableHead>Timestamp</TableHead></TableRow></TableHeader>
            <TableBody>
              {checks.data.map((c: any) => (
                <TableRow key={c.id || c._id}>
                  <TableCell className="text-xs text-muted-foreground">{(c.id || c._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />{c.service || c.name || '-'}</TableCell>
                  <TableCell><Badge className={statusColor(c.status)}>{c.status || '-'}</Badge></TableCell>
                  <TableCell className="text-xs">{c.responseTime ? `${c.responseTime}ms` : '-'}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{c.message || c.error || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.timestamp || c.createdAt ? new Date(c.timestamp || c.createdAt).toLocaleString() : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>
    </div>
  )
}