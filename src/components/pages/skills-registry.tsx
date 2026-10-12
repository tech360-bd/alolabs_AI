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
import { Plus, Trash2, Pencil } from 'lucide-react'

export default function SkillsRegistryPage() {
  const { data, total, loading, error, page, pageSize, search, filters, setPage, setPageSize, setSearch, setFilter, refresh } = useDataTable<any>({ endpoint: '/api/skills' })
  const form = useCreateForm({ endpoint: '/api/skills' })
  const del = useDelete()

  const filtersEl = (
    <div className="flex gap-2 ml-auto">
      <select value={filters.category || ''} onChange={(e) => setFilter('category', e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">All Categories</option>
        <option value="communication">Communication</option>
        <option value="analysis">Analysis</option>
        <option value="development">Development</option>
        <option value="automation">Automation</option>
      </select>
      <select value={filters.status || ''} onChange={(e) => setFilter('status', e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="draft">Draft</option>
      </select>
      <Button size="sm" onClick={form.openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="h-4 w-4 mr-1" />New Skill</Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <TableShell loading={loading} error={error} totalCount={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search skills..." headerRight={filtersEl}>
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Version</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((s: any) => (
                <TableRow key={s.id || s._id}>
                  <TableCell className="text-xs text-muted-foreground">{(s.id || s._id || '').slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{s.name || s.skillName}</TableCell>
                  <TableCell><Badge variant="outline">{s.category || '-'}</Badge></TableCell>
                  <TableCell><Badge variant={s.status === 'active' ? 'default' : 'secondary'} className={s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : s.status === 'draft' ? 'bg-amber-100 text-amber-700' : ''}>{s.status || 'unknown'}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.version || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => form.openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del.deleteItem('/api/skills', s.id || s._id, refresh)} disabled={del.deleting === (s.id || s._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TableShell>

      <Dialog open={form.open} onOpenChange={form.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.editingId ? 'Edit Skill' : 'Create Skill'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input value={form.form.name || ''} onChange={(e) => form.setForm({ ...form.form, name: e.target.value })} placeholder="Skill name" /></div>
            <div><Label>Category</Label><Input value={form.form.category || ''} onChange={(e) => form.setForm({ ...form.form, category: e.target.value })} placeholder="e.g. communication" /></div>
            <div><Label>Version</Label><Input value={form.form.version || ''} onChange={(e) => form.setForm({ ...form.form, version: e.target.value })} placeholder="e.g. 1.0.0" /></div>
            <div><Label>Description</Label><Input value={form.form.description || ''} onChange={(e) => form.setForm({ ...form.form, description: e.target.value })} placeholder="Skill description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {form.loading ? 'Saving...' : form.editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}