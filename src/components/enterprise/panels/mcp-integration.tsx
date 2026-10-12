'use client'

import React, { useState, useEffect } from 'react'
import { Server, Wrench, Plug, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface McpServer {
  id: string; name: string; status: string; description?: string
  tools?: unknown[]; protocol?: string; host?: string; port?: number
  latencyMs?: number
}

const statusColors: Record<string, string> = {
  connected: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  disconnected: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
}

export default function McpIntegration() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ctrl = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const data = await fetchApi(`/api/mcp-servers?limit=50`, { signal: ctrl.signal })
        setServers(data.data || data || [])
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setError(e.message)
          setServers([])
        }
      }
      finally { setLoading(false) }
    }
    load(); return () => ctrl.abort()
  }, [])

  const connected = servers.filter(s => s.status === 'connected').length
  const toolsArr: unknown[][] = servers.map(s => {
    if (Array.isArray(s.tools)) return s.tools
    if (typeof s.tools === 'string') {
      try { return JSON.parse(s.tools) } catch { return [] }
    }
    return []
  })
  const totalTools = toolsArr.reduce((sum, t) => sum + t.length, 0)

  if (loading) return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#003ABC]/10">
          <Server className="h-5 w-5 text-[#003ABC]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">MCP Integration</h2>
          <p className="text-sm text-slate-500">Model Context Protocol server connections and tool integrations</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-400">
          API returned {error} — showing static data. Authenticate to see live MCP servers.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: 'Connected Servers', value: connected.toLocaleString(), icon: Wifi, color: 'text-emerald-600' },
          { label: 'Active Tools', value: totalTools.toLocaleString(), icon: Wrench, color: 'text-[#FF6A00]' },
          { label: 'Total Integrations', value: servers.length.toLocaleString(), icon: Plug, color: 'text-[#003ABC]' },
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {servers.length === 0 && !error && (
          <div className="col-span-full py-12 text-center">
            <Server className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500">No MCP servers configured</p>
            <p className="text-sm text-slate-400 mt-1">Connect MCP servers to enable external tool integrations</p>
          </div>
        )}
        {servers.map(srv => {
          const tools = Array.isArray(srv.tools) ? srv.tools : (typeof srv.tools === 'string' ? (() => { try { return JSON.parse(srv.tools) } catch { return [] } })() : [])
          return (
            <Card key={srv.id} className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {srv.status === 'connected' ? <Wifi className="h-4 w-4 text-emerald-500" /> : srv.status === 'error' ? <WifiOff className="h-4 w-4 text-red-500" /> : <WifiOff className="h-4 w-4 text-slate-400" />}
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">{srv.name}</p>
                  </div>
                  <Badge variant="secondary" className={statusColors[srv.status] || statusColors.disconnected}>{srv.status}</Badge>
                </div>
                {srv.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2">{srv.description}</p>}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{tools.length} tools</span>
                  <span>{srv.protocol || 'http'}://{srv.host || 'localhost'}:{srv.port || 3000}</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
