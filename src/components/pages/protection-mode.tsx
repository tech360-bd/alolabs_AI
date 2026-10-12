'use client'

import { useDataTable } from '@/hooks/use-data-table'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiGet } from '@/hooks/use-api-actions'
import { ShieldAlert, ShieldCheck } from 'lucide-react'

export default function ProtectionModePage() {
  const logs = useDataTable<any>({ endpoint: '/api/protection/logs' })
  const { data: rules, loading: rulesLoading } = useApiGet<any[]>('/api/protection/rules')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-rose-500" />Protection Rules</CardTitle></CardHeader>
        <CardContent>
          {rulesLoading ? <div className="h-6 w-48 animate-pulse bg-slate-200 rounded" /> : (
            <div className="flex flex-wrap gap-2">
              {(rules ?? []).map((r: any, i: number) => (
                <Badge key={r.id || i} variant={r.active !== false ? 'default' : 'secondary'} className={r.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  {r.name || r.rule || `Rule ${i + 1}`}
                </Badge>
              ))}
              {(!rules || rules.length === 0) && <span className="text-sm text-muted-foreground">No protection rules configured.</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <TableShell loading={logs.loading} error={logs.error} totalCount={logs.total} page={logs.page} pageSize={logs.pageSize} onPageChange={logs.setPage} onPageSizeChange={logs.setPageSize} searchValue={logs.search} onSearchChange={logs.setSearch} searchPlaceholder="Search blocked actions...">
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Action</TableHead><TableHead>Agent</TableHead><TableHead>Reason</TableHead><TableHead>Rule</TableHead><TableHead>Timestamp</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.data.map((l: any) => (
                <TableRow key={l.id || l._id}>
                  <TableCell className="text-xs text-muted-foreground">{(l.id || l._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium text-rose-600">{l.action || l.type || '-'}</TableCell>
                  <TableCell className="text-sm">{l.agentId || l.agent || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{l.reason || l.message || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{l.rule || l.ruleId || '-'}</Badge></TableCell>
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