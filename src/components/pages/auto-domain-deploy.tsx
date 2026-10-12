'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { useCreateForm } from '@/hooks/use-api-actions'
import TableShell from '@/components/table-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Rocket } from 'lucide-react'

export default function AutoDomainDeployPage() {
  const requests = useDataTable<any>({ endpoint: '/api/auto-deploy/requests' })
  const logs = useDataTable<any>({ endpoint: '/api/auto-deploy/logs' })
  const form = useCreateForm({ endpoint: '/api/auto-deploy/request' })

  return (
    <div className="space-y-4">
      <TableShell
        loading={requests.loading} error={requests.error} totalCount={requests.total} page={requests.page} pageSize={requests.pageSize}
        onPageChange={requests.setPage} onPageSizeChange={requests.setPageSize} searchValue={requests.search}
        onSearchChange={requests.setSearch} searchPlaceholder="Search deploy requests..."
        headerRight={<Button size="sm" onClick={form.openCreate} className="bg-orange-600 hover:bg-orange-700 text-white ml-auto"><Rocket className="h-4 w-4 mr-1" />New Deploy</Button>}
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Domain</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>SSL</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {requests.data.map((r: any) => (
                <TableRow key={r.id || r._id}>
                  <TableCell className="text-xs text-muted-foreground">{(r.id || r._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{r.domain || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{r.type || r.framework || '-'}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'deployed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}
                      className={r.status === 'deployed' ? 'bg-emerald-100 text-emerald-700' : r.status === 'deploying' ? 'bg-amber-100 text-amber-700' : ''}>
                      {r.status || 'pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.ssl ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge> : <Badge variant="outline">None</Badge>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <TableShell loading={logs.loading} error={logs.error} totalCount={logs.total} page={logs.page} pageSize={logs.pageSize} onPageChange={logs.setPage} onPageSizeChange={logs.setPageSize} searchValue={logs.search} onSearchChange={logs.setSearch} searchPlaceholder="Search logs...">
        <div className="rounded-lg border max-h-64 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>Domain</TableHead><TableHead>Event</TableHead><TableHead>Message</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.data.map((l: any, i: number) => (
                <TableRow key={l.id || i}>
                  <TableCell className="text-xs text-muted-foreground">{l.timestamp || l.createdAt ? new Date(l.timestamp || l.createdAt).toLocaleString() : '-'}</TableCell>
                  <TableCell className="text-sm">{l.domain || '-'}</TableCell>
                  <TableCell className="text-sm">{l.event || l.action || '-'}</TableCell>
                  <TableCell className="text-xs max-w-[300px] truncate">{l.message || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <Dialog open={form.open} onOpenChange={form.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Auto Deploy Domain</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Domain</Label><Input value={form.form.domain || ''} onChange={(e) => form.setForm({ ...form.form, domain: e.target.value })} placeholder="e.g. myapp.com" /></div>
            <div><Label>Framework</Label><Input value={form.form.framework || ''} onChange={(e) => form.setForm({ ...form.form, framework: e.target.value })} placeholder="e.g. nextjs, react, vue" /></div>
            <div><Label>Git Repository URL</Label><Input value={form.form.repoUrl || ''} onChange={(e) => form.setForm({ ...form.form, repoUrl: e.target.value })} placeholder="https://github.com/..." /></div>
            <div><Label>Branch</Label><Input value={form.form.branch || 'main'} onChange={(e) => form.setForm({ ...form.form, branch: e.target.value })} placeholder="main" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(() => { form.setOpen(false); requests.refresh(); logs.refresh(); })} disabled={form.loading} className="bg-orange-600 hover:bg-orange-700 text-white">
              {form.loading ? 'Requesting...' : 'Request Deploy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}