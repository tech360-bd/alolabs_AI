'use client'

import { useDataTable } from '@/hooks/use-data-table'
import { fetchApi } from '@/lib/api'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Globe } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function OpenclawToolsPage() {
  const skills = useDataTable<any>({ endpoint: '/api/openclaw/skills' })
  const { toast } = useToast()

  const validate = async (id: string) => {
    try {
      await fetchApi(`/api/openclaw/skills/${id}/validate`, { method: 'POST' })
      toast({ title: 'Validation started' })
      skills.refresh()
    } catch (e: any) {
      toast({ title: 'Validation failed', description: e.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <TableShell loading={skills.loading} error={skills.error} totalCount={skills.total} page={skills.page} pageSize={skills.pageSize} onPageChange={skills.setPage} onPageSizeChange={skills.setPageSize} searchValue={skills.search} onSearchChange={skills.setSearch} searchPlaceholder="Search private skills...">
        <div className="rounded-lg border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">ID</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Validated</TableHead><TableHead>Private</TableHead><TableHead>Version</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {skills.data.map((s: any) => {
                const id = s.id || s._id
                return (
                  <TableRow key={id}>
                    <TableCell className="text-xs text-muted-foreground">{(id || '').slice(0, 8)}</TableCell>
                    <TableCell className="font-medium flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-teal-500" />{s.name || '-'}</TableCell>
                    <TableCell><Badge variant="outline">{s.category || '-'}</Badge></TableCell>
                    <TableCell>
                      {s.validated ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                    </TableCell>
                    <TableCell>{s.isPrivate !== false ? <Badge className="bg-amber-100 text-amber-700">Private</Badge> : <Badge variant="outline">Public</Badge>}</TableCell>
                    <TableCell className="text-xs">{s.version || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => validate(id)}>Validate</Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </TableShell>
    </div>
  )
}