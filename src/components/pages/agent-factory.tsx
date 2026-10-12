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
import { Textarea } from '@/components/ui/textarea'
import { Plus, Play } from 'lucide-react'

export default function AgentFactoryPage() {
  const { data, total, loading, error, page, pageSize, search, setPage, setPageSize, setSearch, refresh } = useDataTable<any>({ endpoint: '/api/agent-factory/requests' })
  const form = useCreateForm({ endpoint: '/api/agent-factory/build' })

  return (
    <div className="space-y-4">
      <TableShell
        loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search}
        onSearchChange={setSearch} searchPlaceholder="Search build requests..."
        headerRight={<Button size="sm" onClick={form.openCreate} className="bg-orange-600 hover:bg-orange-700 text-white ml-auto"><Plus className="h-4 w-4 mr-1" />New Agent</Button>}
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Agent Name</TableHead><TableHead>Department</TableHead><TableHead>Status</TableHead><TableHead>Model</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((r: any) => (
                <TableRow key={r.id || r._id}>
                  <TableCell className="text-xs text-muted-foreground">{(r.id || r._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{r.name || r.agentName || '-'}</TableCell>
                  <TableCell>{r.department || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}
                      className={r.status === 'building' ? 'bg-amber-100 text-amber-700' : r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : ''}>
                      {r.status || 'pending'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.model || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <Dialog open={form.open} onOpenChange={form.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Build New Agent</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Agent Name</Label><Input value={form.form.name || ''} onChange={(e) => form.setForm({ ...form.form, name: e.target.value })} placeholder="e.g. Marketing Analyst" /></div>
            <div><Label>Department</Label><Input value={form.form.department || ''} onChange={(e) => form.setForm({ ...form.form, department: e.target.value })} placeholder="e.g. marketing" /></div>
            <div><Label>Model</Label><Input value={form.form.model || ''} onChange={(e) => form.setForm({ ...form.form, model: e.target.value })} placeholder="e.g. gpt-4, claude-3" /></div>
            <div><Label>System Prompt</Label><Textarea value={form.form.systemPrompt || ''} onChange={(e) => form.setForm({ ...form.form, systemPrompt: e.target.value })} placeholder="Describe the agent's role and behavior" rows={3} /></div>
            <div><Label>Skills (comma-separated)</Label><Input value={form.form.skills || ''} onChange={(e) => form.setForm({ ...form.form, skills: e.target.value })} placeholder="analysis, communication, coding" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-orange-600 hover:bg-orange-700 text-white">
              {form.loading ? 'Building...' : <><Play className="h-4 w-4 mr-1" />Build Agent</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}