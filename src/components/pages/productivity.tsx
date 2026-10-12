'use client'

import { useDataTable } from '@/hooks/use-data-table'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useApiGet } from '@/hooks/use-api-actions'

export default function ProductivityPage() {
  const reports = useDataTable<any>({ endpoint: '/api/productivity/reports' })
  const { data: summary, loading: sumLoading } = useApiGet<any>('/api/productivity/summary')

  const scoreColor = (s: number) => {
    if (s >= 80) return 'text-emerald-600'
    if (s >= 50) return 'text-amber-600'
    return 'text-rose-600'
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Overall Score</CardTitle></CardHeader>
          <CardContent>
            {sumLoading ? <div className="h-8 w-16 animate-pulse bg-slate-200 rounded" /> : (
              <p className={`text-3xl font-bold ${scoreColor(summary?.overallScore ?? 0)}`}>{summary?.overallScore ?? '-'}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tasks Completed</CardTitle></CardHeader>
          <CardContent>
            {sumLoading ? <div className="h-8 w-16 animate-pulse bg-slate-200 rounded" /> : (
              <p className="text-3xl font-bold">{summary?.tasksCompleted ?? '-'}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Time/Task</CardTitle></CardHeader>
          <CardContent>
            {sumLoading ? <div className="h-8 w-16 animate-pulse bg-slate-200 rounded" /> : (
              <p className="text-3xl font-bold">{summary?.avgTime ? `${summary.avgTime}m` : '-'}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <TableShell loading={reports.loading} error={reports.error} totalCount={reports.total} page={reports.page} pageSize={reports.pageSize} onPageChange={reports.setPage} onPageSizeChange={reports.setPageSize} searchValue={reports.search} onSearchChange={reports.setSearch} searchPlaceholder="Search reports...">
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Agent/Department</TableHead><TableHead>Score</TableHead><TableHead>Tasks Done</TableHead><TableHead>Efficiency</TableHead><TableHead>Period</TableHead></TableRow></TableHeader>
            <TableBody>
              {reports.data.map((r: any) => (
                <TableRow key={r.id || r._id}>
                  <TableCell className="text-xs text-muted-foreground">{(r.id || r._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{r.agent || r.department || r.name || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, r.score || 0)}%` }} /></div>
                      <span className={`text-xs font-medium ${scoreColor(r.score || 0)}`}>{r.score ?? '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell>{r.tasksDone ?? r.tasksCompleted ?? '-'}</TableCell>
                  <TableCell>{r.efficiency ? `${r.efficiency}%` : '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.period || (r.startDate ? `${new Date(r.startDate).toLocaleDateString()} - ${new Date(r.endDate).toLocaleDateString()}` : '-')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>
    </div>
  )
}