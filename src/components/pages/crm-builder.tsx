'use client'

import { useCreateForm } from '@/hooks/use-api-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Users } from 'lucide-react'
import { useApiGet } from '@/hooks/use-api-actions'
import { Skeleton } from '@/components/ui/skeleton'

export default function CrmBuilderPage() {
  const form = useCreateForm({ endpoint: '/api/crm-builder/projects' })
  const { data: projects, loading, refresh } = useApiGet<any[]>('/api/crm-builder/projects')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-rose-500" />
          <h2 className="text-lg font-semibold">CRM SaaS Builder</h2>
        </div>
        <Button size="sm" onClick={form.openCreate} className="bg-rose-600 hover:bg-rose-700 text-white"><Plus className="h-4 w-4 mr-1" />New CRM</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(projects ?? []).map((p: any) => (
            <Card key={p.id || p._id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{p.name || p.projectName || '-'}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">{p.description || '-'}</p>
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-slate-100">{p.status || 'draft'}</span>
                  <span className="text-muted-foreground">{p.modules ?? 0} modules</span>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!projects || projects.length === 0) && !loading && (
            <Card className="col-span-full"><CardContent className="py-8 text-center text-sm text-muted-foreground">No CRM projects yet. Create one to get started.</CardContent></Card>
          )}
        </div>
      )}

      <Dialog open={form.open} onOpenChange={form.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create CRM Project</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Project Name</Label><Input value={form.form.name || ''} onChange={(e) => form.setForm({ ...form.form, name: e.target.value })} placeholder="e.g. Sales Tracker CRM" /></div>
            <div><Label>Description</Label><Textarea value={form.form.description || ''} onChange={(e) => form.setForm({ ...form.form, description: e.target.value })} placeholder="Describe your CRM" rows={3} /></div>
            <div><Label>Modules (comma-separated)</Label><Input value={form.form.modules || ''} onChange={(e) => form.setForm({ ...form.form, modules: e.target.value })} placeholder="contacts, deals, tasks, reports" /></div>
            <div><Label>Primary Color</Label><Input type="color" value={form.form.color || '#e11d48'} onChange={(e) => form.setForm({ ...form.form, color: e.target.value })} className="h-9 w-16 p-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => form.setOpen(false)}>Cancel</Button>
            <Button onClick={() => form.submit().then(refresh)} disabled={form.loading} className="bg-rose-600 hover:bg-rose-700 text-white">
              {form.loading ? 'Creating...' : 'Create CRM'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}