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
import { Plus, Wrench } from 'lucide-react'

export default function SkillFactoryPage() {
  const { data, total, loading, error, page, pageSize, search, setPage, setPageSize, setSearch, refresh } = useDataTable<any>({ endpoint: '/api/skill-factory/requests' })
  const form = useCreateForm({ endpoint: '/api/skill-factory/build' })

  return (
    <div className="space-y-4">
      <TableShell
        loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search}
        onSearchChange={setSearch} searchPlaceholder="Search skill builds..."
        headerRight={<Button size="sm" onClick={form.openCreate} className="bg-teal-600 hover:bg-teal-700 text-white ml-auto"><Plus className="h-4 w-4 mr-1" />New Skill</Button>}
      >
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Skill Name</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Version</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((r: any) => (
                <TableRow key={r.id || r._id}>
                  <TableCell className="text-xs text-muted-foreground">{(r.id || r._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{r.name || r.skillName || '-'}</TableCell>
                  <TableCell><Badge variant="outline">{r.category || '-'}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}
                      className={r.status === 'building' ? 'bg-amber-100 text-amber-700' : r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : ''}>
                      {r.status || 'pending'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.version || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <Dialog open={form.open} onOpenChange={form.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Build New Skill</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Skill Name</Label><Input value={form.form.name || ''} onChange={(e) => form.setForm({ ...form.form, name: e.target.value })} placeholder="e.g. Data Analysis Pro" /></div>
            <div><Label>Category</Label><Input value={form.form.category || ''} onChange={(e) => form.setForm({ ...form.form, category: e.target.value })} placeholder="e.g. analysis, communication" /></div>
            <div><Label>Version</Label><Input value={form.form.version || '1.0.0'} onChange={(e) => form.setForm({ ...form.form, version: e.target.value })} placeholder="1.0.0" /></div>
            <div><Label>Description</Label><Textarea value={form.form.description || ''} onChange={(e) => form.setForm({ ...form.form, description: e.target.value })} placeholder="What this skill does" rows={3} /></div>
            <div><Label>Instructions / Prompt</Label><Textarea value={form.form.instructions || ''} onChange={(e) => form.setForm({ ...form.form, instructions: e.target.value })} placeholder="Detailed skill instructions" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-teal-600 hover:bg-teal-700 text-white">
              {form.loading ? 'Building...' : <><Wrench className="h-4 w-4 mr-1" />Build Skill</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}