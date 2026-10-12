'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { useCreateForm, useDelete } from '@/hooks/use-api-actions'
import TableShell from '@/components/table-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Pencil, Server } from 'lucide-react'

export default function ServerAutomationPage() {
  const { data, total, loading, error, page, pageSize, search, setPage, setPageSize, setSearch, refresh } = useDataTable<any>({ endpoint: '/api/server-automation/deployments' })
  const form = useCreateForm({ endpoint: '/api/server-automation/deploy' })
  const del = useDelete()

  return (
    <div className="space-y-4">
      <TableShell
        loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search}
        onSearchChange={setSearch} searchPlaceholder="Search deployments..."
        headerRight={<Button size="sm" onClick={form.openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white ml-auto"><Plus className="h-4 w-4 mr-1" />Deploy</Button>}
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Domain</TableHead><TableHead>Server</TableHead><TableHead>Status</TableHead><TableHead>Environment</TableHead><TableHead>Timestamp</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((d: any) => (
                <TableRow key={d.id || d._id}>
                  <TableCell className="text-xs text-muted-foreground">{(d.id || d._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium flex items-center gap-1.5"><Server className="h-3.5 w-3.5" />{d.domain || '-'}</TableCell>
                  <TableCell className="text-sm">{d.server || d.host || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={d.status === 'deployed' ? 'default' : d.status === 'failed' ? 'destructive' : 'secondary'}
                      className={d.status === 'deployed' ? 'bg-emerald-100 text-emerald-700' : d.status === 'deploying' ? 'bg-amber-100 text-amber-700' : ''}>
                      {d.status || 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant="outline">{d.environment || '-'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.timestamp || d.createdAt ? new Date(d.timestamp || d.createdAt).toLocaleString() : '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/server-automation/deployments', d.id || d._id, refresh)} disabled={del.deleting === (d.id || d._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <Dialog open={form.open} onOpenChange={form.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deploy to Server</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Domain</Label><Input value={form.form.domain || ''} onChange={(e) => form.setForm({ ...form.form, domain: e.target.value })} placeholder="e.g. app.example.com" /></div>
            <div><Label>Server / Host</Label><Input value={form.form.server || ''} onChange={(e) => form.setForm({ ...form.form, server: e.target.value })} placeholder="e.g. 192.168.1.100" /></div>
            <div><Label>Environment</Label>
              <select value={form.form.environment || 'production'} onChange={(e) => form.setForm({ ...form.form, environment: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div><Label>Branch / Tag</Label><Input value={form.form.branch || ''} onChange={(e) => form.setForm({ ...form.form, branch: e.target.value })} placeholder="e.g. main" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {form.loading ? 'Deploying...' : 'Deploy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}