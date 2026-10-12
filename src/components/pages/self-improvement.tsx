'use client'

import { useDataTable } from '@/hooks/use-data-table'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SelfImprovementPage() {
  const reports = useDataTable<any>({ endpoint: '/api/self-improvement/reports' })
  const suggestions = useDataTable<any>({ endpoint: '/api/self-improvement/suggestions' })

  return (
    <div className="space-y-4">
      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Learning Reports</TabsTrigger>
          <TabsTrigger value="suggestions">Automation Suggestions</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4">
          <TableShell loading={reports.loading} error={reports.error} totalCount={reports.total} page={reports.page} pageSize={reports.pageSize} onPageChange={reports.setPage} onPageSizeChange={reports.setPageSize} searchValue={reports.search} onSearchChange={reports.setSearch} searchPlaceholder="Search reports...">
            <div className="rounded-lg border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Topic</TableHead><TableHead>Score</TableHead><TableHead>Insights</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {reports.data.map((r: any) => (
                    <TableRow key={r.id || r._id}>
                      <TableCell className="text-xs text-muted-foreground">{(r.id || r._id || '').slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">{r.topic || r.title || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, r.score || 0)}%` }} /></div>
                          <span className="text-xs">{r.score ?? '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{r.insights || r.summary || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableShell>
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          <TableShell loading={suggestions.loading} error={suggestions.error} totalCount={suggestions.total} page={suggestions.page} pageSize={suggestions.pageSize} onPageChange={suggestions.setPage} onPageSizeChange={suggestions.setPageSize} searchValue={suggestions.search} onSearchChange={suggestions.setSearch} searchPlaceholder="Search suggestions...">
            <div className="rounded-lg border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Description</TableHead><TableHead>Type</TableHead><TableHead>Impact</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {suggestions.data.map((s: any) => (
                    <TableRow key={s.id || s._id}>
                      <TableCell className="text-xs text-muted-foreground">{(s.id || s._id || '').slice(0, 8)}</TableCell>
                      <TableCell className="font-medium max-w-[250px] truncate">{s.description || s.title || '-'}</TableCell>
                      <TableCell><Badge variant="outline">{s.type || '-'}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={s.impact === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}>{s.impact || '-'}</Badge></TableCell>
                      <TableCell><Badge variant={s.status === 'applied' ? 'default' : 'secondary'} className={s.status === 'applied' ? 'bg-emerald-100 text-emerald-700' : ''}>{s.status || 'pending'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableShell>
        </TabsContent>
      </Tabs>
    </div>
  )
}