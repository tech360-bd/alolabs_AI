'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi, buildQueryString } from '@/lib/api'
import TableShell from '@/components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function TaskStepsPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [selectedTask, setSelectedTask] = useState<string>('')
  const [steps, setSteps] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [stepsLoading, setStepsLoading] = useState(false)

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetchApi<any>(`/api/tasks?limit=100${buildQueryString({ search: search || undefined })}`)
      setTasks(res.data ?? (Array.isArray(res) ? res : []))
    } catch { /* ignore */ }
  }, [search])

  useEffect(() => { loadTasks() }, [loadTasks])

  const loadSteps = useCallback(async () => {
    if (!selectedTask) { setSteps([]); setTotal(0); setLoading(false); return }
    setStepsLoading(true)
    try {
      const res = await fetchApi<any>(`/api/tasks/${selectedTask}/steps?limit=50`)
      const list = res.data ?? (Array.isArray(res) ? res : [])
      setSteps(list)
      setTotal(res.total ?? list.length)
    } catch {
      setSteps([])
      setTotal(0)
    } finally {
      setStepsLoading(false)
      setLoading(false)
    }
  }, [selectedTask])

  useEffect(() => { loadSteps() }, [loadSteps])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select a Task</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <select
              value={selectedTask}
              onChange={(e) => { setSelectedTask(e.target.value); setPage(1) }}
              className="h-9 flex-1 max-w-md rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">-- Select a task --</option>
              {tasks.map((t: any) => (
                <option key={t.id || t._id} value={t.id || t._id}>{t.title || t.name || (t.id || t._id)}</option>
              ))}
            </select>
            <input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </CardContent>
      </Card>

      {!selectedTask && <p className="text-sm text-muted-foreground text-center py-8">Select a task above to view its steps.</p>}

      {selectedTask && (
        <TableShell loading={stepsLoading} error="" totalCount={total} page={page} pageSize={10} onPageChange={setPage} onPageSizeChange={() => {}} searchValue="" onSearchChange={() => {}} noDataMessage="No steps found for this task.">
          <div className="rounded-lg border max-h-96 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Step #</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Output</TableHead><TableHead>Duration</TableHead></TableRow></TableHeader>
              <TableBody>
                {steps.map((s: any, i: number) => (
                  <TableRow key={s.id || s._id || i}>
                    <TableCell className="font-medium">{s.stepNumber ?? s.order ?? i + 1}</TableCell>
                    <TableCell>{s.name || s.title || `Step ${s.stepNumber ?? i + 1}`}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'completed' ? 'default' : s.status === 'failed' ? 'destructive' : 'secondary'}
                        className={s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : s.status === 'running' ? 'bg-amber-100 text-amber-700' : ''}>
                        {s.status || 'pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{s.output || s.result || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.duration ? `${s.duration}ms` : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TableShell>
      )}
    </div>
  )
}