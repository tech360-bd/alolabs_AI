'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { fetchApi } from '@/lib/api'
import { Bot, ListTodo, Building2, Zap, ArrowRight } from 'lucide-react'

interface StatData {
  agents: number
  tasks: number
  departments: number
  commands: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatData | null>(null)
  const [recentCommands, setRecentCommands] = useState<any[]>([])
  const [recentTasks, setRecentTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [s, c, t] = await Promise.allSettled([
          fetchApi<StatData>('/api/stats'),
          fetchApi<any[]>('/api/commands?limit=5'),
          fetchApi<any[]>('/api/tasks?limit=5'),
        ])
        if (s.status === 'fulfilled') setStats(s.value)
        if (c.status === 'fulfilled') setRecentCommands(c.value)
        if (t.status === 'fulfilled') setRecentTasks(t.value)
        if (s.status === 'rejected' && c.status === 'rejected' && t.status === 'rejected') {
          setError('Failed to load dashboard data')
        }
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-rose-200">
        <CardContent className="pt-6">
          <p className="text-rose-600 text-sm">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">Make sure the API server is running and you are authenticated.</p>
        </CardContent>
      </Card>
    )
  }

  const statCards = [
    { title: 'Total Agents', value: stats?.agents ?? 0, icon: <Bot className="h-5 w-5" />, color: 'from-amber-500 to-orange-500' },
    { title: 'Active Tasks', value: stats?.tasks ?? 0, icon: <ListTodo className="h-5 w-5" />, color: 'from-emerald-500 to-teal-500' },
    { title: 'Departments', value: stats?.departments ?? 0, icon: <Building2 className="h-5 w-5" />, color: 'from-rose-500 to-pink-500' },
    { title: 'Commands Run', value: stats?.commands ?? 0, icon: <Zap className="h-5 w-5" />, color: 'from-orange-500 to-red-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} className="relative overflow-hidden">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white shadow-lg`}>
                  {card.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Commands</CardTitle>
          </CardHeader>
          <CardContent>
            {recentCommands.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent commands</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {recentCommands.map((cmd: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <ArrowRight className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      <span className="text-sm truncate">{cmd.command || cmd.name || cmd.type || 'Command'}</span>
                    </div>
                    <Badge variant={cmd.status === 'completed' ? 'default' : 'secondary'} className="flex-shrink-0 text-xs">
                      {cmd.status || 'pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent tasks</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {recentTasks.map((task: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <ListTodo className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      <span className="text-sm truncate">{task.title || task.name || 'Task'}</span>
                    </div>
                    <Badge variant={task.status === 'completed' ? 'default' : task.status === 'failed' ? 'destructive' : 'secondary'} className="flex-shrink-0 text-xs">
                      {task.status || 'pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}