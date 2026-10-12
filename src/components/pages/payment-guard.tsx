'use client'

import { useDataTable } from '@/hooks/use-data-table'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiGet } from '@/hooks/use-api-actions'
import { CreditCard, Ban } from 'lucide-react'

export default function PaymentGuardPage() {
  const logs = useDataTable<any>({ endpoint: '/api/payment-guard/logs' })
  const { data: blocked, loading: blockedLoading } = useApiGet<any[]>('/api/payment-guard/blocked')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-amber-500" />Blocked APIs</CardTitle></CardHeader>
        <CardContent>
          {blockedLoading ? <div className="h-6 w-48 animate-pulse bg-slate-200 rounded" /> : (
            <div className="flex flex-wrap gap-2">
              {(blocked ?? []).map((b: any, i: number) => (
                <Badge key={b.id || i} variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                  <Ban className="h-3 w-3 mr-1" />
                  {b.api || b.name || b.endpoint || `API ${i + 1}`}
                </Badge>
              ))}
              {(!blocked || blocked.length === 0) && <span className="text-sm text-muted-foreground">No blocked APIs.</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <TableShell loading={logs.loading} error={logs.error} totalCount={logs.total} page={logs.page} pageSize={logs.pageSize} onPageChange={logs.setPage} onPageSizeChange={logs.setPageSize} searchValue={logs.search} onSearchChange={logs.setSearch} searchPlaceholder="Search payment logs...">
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>API / Service</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead>Timestamp</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.data.map((l: any) => (
                <TableRow key={l.id || l._id}>
                  <TableCell className="text-xs text-muted-foreground">{(l.id || l._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{l.api || l.service || l.endpoint || '-'}</TableCell>
                  <TableCell>{l.amount ? `$${l.amount}` : '-'}</TableCell>
                  <TableCell><Badge variant={l.status === 'blocked' ? 'destructive' : 'default'} className={l.status === 'blocked' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}>{l.status || 'unknown'}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{l.reason || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.timestamp || l.createdAt ? new Date(l.timestamp || l.createdAt).toLocaleString() : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>
    </div>
  )
}