'use client'

import React, { useState } from 'react'
import { Globe, Server, Clock, BarChart3, Activity, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface EndpointGroup {
  name: string; count: number; avgLatency: number; errorRate: number; status: 'healthy' | 'degraded' | 'down'
}

const endpointGroups: EndpointGroup[] = [
  { name: 'Auth', count: 12, avgLatency: 32, errorRate: 0.02, status: 'healthy' },
  { name: 'Agents', count: 18, avgLatency: 67, errorRate: 0.08, status: 'healthy' },
  { name: 'CRM', count: 15, avgLatency: 45, errorRate: 0.05, status: 'healthy' },
  { name: 'Workflows', count: 12, avgLatency: 52, errorRate: 0.03, status: 'healthy' },
  { name: 'Enterprise', count: 9, avgLatency: 38, errorRate: 0.01, status: 'healthy' },
  { name: 'System', count: 25, avgLatency: 28, errorRate: 0.04, status: 'healthy' },
  { name: 'Billing', count: 8, avgLatency: 41, errorRate: 0.06, status: 'healthy' },
  { name: 'Media', count: 6, avgLatency: 89, errorRate: 0.12, status: 'degraded' },
  { name: 'Education', count: 10, avgLatency: 35, errorRate: 0.02, status: 'healthy' },
  { name: 'Analytics', count: 7, avgLatency: 73, errorRate: 0.04, status: 'healthy' },
  { name: 'Notifications', count: 5, avgLatency: 22, errorRate: 0.01, status: 'healthy' },
  { name: 'Search', count: 4, avgLatency: 156, errorRate: 0.09, status: 'degraded' },
]

const statusColors: Record<string, string> = {
  healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  degraded: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  down: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
}

const hourlyRates = [820, 650, 420, 380, 350, 410, 780, 1200, 1450, 1520, 1480, 1350, 1290, 1400, 1380, 1450, 1500, 1620, 1580, 1350, 1100, 920, 870, 830]
const maxRate = Math.max(...hourlyRates)

export default function ApiGateway() {
  const [view, setView] = useState<'table' | 'chart'>('table')

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#003ABC]/10">
          <Globe className="h-5 w-5 text-[#003ABC]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">API Gateway</h2>
          <p className="text-sm text-slate-500">Central routing, rate limiting, and request management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Endpoints', value: '268', icon: Server, color: 'text-[#003ABC]' },
          { label: 'Uptime', value: '99.9%', icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Avg Latency', value: '45ms', icon: Clock, color: 'text-[#FF6A00]' },
          { label: 'Requests/day', value: '1.2M', icon: BarChart3, color: 'text-violet-600' },
        ].map((s, i) => (
          <Card key={i} className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-slate-500">{s.label}</p><p className={`text-2xl font-bold ${s.color}`}>{s.value}</p></div>
                <s.icon className="h-5 w-5 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant={view === 'table' ? 'default' : 'outline'} size="sm" onClick={() => setView('table')} className={view === 'table' ? 'bg-[#003ABC] hover:bg-[#002A99] text-white' : ''}>Endpoint Groups</Button>
        <Button variant={view === 'chart' ? 'default' : 'outline'} size="sm" onClick={() => setView('chart')} className={view === 'chart' ? 'bg-[#003ABC] hover:bg-[#002A99] text-white' : ''}>Request Rate</Button>
      </div>

      {view === 'table' ? (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Endpoint Groups ({endpointGroups.reduce((s, g) => s + g.count, 0)} endpoints)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <Table>
                <TableHeader>
                  <TableRow><TableHead className="pl-4">Group</TableHead><TableHead className="text-right">Endpoints</TableHead><TableHead className="text-right">Avg Latency</TableHead><TableHead className="text-right">Error Rate</TableHead><TableHead className="pr-4 text-right">Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {endpointGroups.map(g => (
                    <TableRow key={g.name}>
                      <TableCell className="pl-4"><div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-slate-400" /><span className="text-sm font-medium">{g.name}</span></div></TableCell>
                      <TableCell className="text-right text-sm">{g.count}</TableCell>
                      <TableCell className="text-right text-sm">{g.avgLatency}ms</TableCell>
                      <TableCell className="text-right text-sm">{g.errorRate}%</TableCell>
                      <TableCell className="pr-4 text-right"><Badge variant="secondary" className={statusColors[g.status]}>{g.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Hourly Request Rate (24h)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-48">
              {hourlyRates.map((rate, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-slate-500">{rate >= 1000 ? `${(rate / 1000).toFixed(1)}K` : rate}</span>
                  <div
                    className="w-full rounded-t-sm bg-[#003ABC] transition-all hover:bg-[#FF6A00]"
                    style={{ height: `${Math.max((rate / maxRate) * 160, 4)}px` }}
                    title={`${i}:00 — ${rate} req/h`}
                  />
                  <span className="text-[10px] text-slate-400">{i}h</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
