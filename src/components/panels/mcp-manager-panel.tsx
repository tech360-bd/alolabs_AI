'use client'

import { apiFetch } from '@/lib/api-client'
import { useState, useEffect, useCallback } from 'react'
import { Server, Plus, Play, Square, RefreshCw, Activity, Loader2, Trash2, PlugZap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

interface RawMcpServer {
  id: string
  name: string
  host: string
  port: number
  protocol: 'http' | 'https' | 'ws' | 'wss'
  status: 'connected' | 'disconnected' | 'error'
  description?: string | null
  config?: string | null
  tools?: string | null
  latencyMs?: number | null
  lastError?: string | null
  lastPingAt?: string | null
  updatedAt: string
}

interface McpServerView {
  id: string
  name: string
  endpointUrl: string
  authType: string
  capabilities: string[]
  autoStart: boolean
  status: 'connected' | 'disconnected' | 'error'
  latencyMs: number | null
  lastError: string | null
  lastPingAt: string | null
  updatedAt: string
}

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function normalizeServer(raw: RawMcpServer): McpServerView {
  const cfg = parseJsonSafe<Record<string, unknown>>(raw.config, {})
  const parsedTools = parseJsonSafe<unknown[]>(raw.tools, [])
  const capabilities = parsedTools
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'name' in item && typeof (item as { name?: unknown }).name === 'string') {
        return (item as { name: string }).name
      }
      return null
    })
    .filter((v): v is string => Boolean(v))

  return {
    id: raw.id,
    name: raw.name,
    endpointUrl: `${raw.protocol}://${raw.host}:${raw.port}`,
    authType: typeof cfg.authType === 'string' ? cfg.authType : 'none',
    capabilities,
    autoStart: Boolean(cfg.autoStart),
    status: raw.status,
    latencyMs: raw.latencyMs ?? null,
    lastError: raw.lastError ?? null,
    lastPingAt: raw.lastPingAt ?? null,
    updatedAt: raw.updatedAt,
  }
}

const capColors: Record<string, string> = {
  'file-system': 'bg-purple-100 text-purple-700',
  'web-search': 'bg-cyan-100 text-cyan-700',
  'database': 'bg-emerald-100 text-emerald-700',
  'code-execution': 'bg-amber-100 text-amber-700',
  'messaging': 'bg-pink-100 text-pink-700',
  'analytics': 'bg-orange-100 text-orange-700',
}

function HealthDot({ status }: { status: McpServerView['status'] }) {
  const color = status === 'connected' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : 'bg-gray-300'
  const pulse = status === 'connected' ? 'animate-pulse' : ''
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} ${pulse}`} />
}

export default function McpManagerPanel() {
  const [servers, setServers] = useState<McpServerView[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actioning, setActioning] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedServer, setSelectedServer] = useState<McpServerView | null>(null)

  const [callToolName, setCallToolName] = useState('')
  const [callToolArgs, setCallToolArgs] = useState('{}')
  const [callApproved, setCallApproved] = useState(false)
  const [callResult, setCallResult] = useState<string | null>(null)
  const [callingTool, setCallingTool] = useState(false)

  const [formName, setFormName] = useState('')
  const [formEndpoint, setFormEndpoint] = useState('')
  const [formAuthType, setFormAuthType] = useState('none')
  const [formCapabilities, setFormCapabilities] = useState('')
  const [formAutoStart, setFormAutoStart] = useState(false)

  const fetchServers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/mcp-servers')
      const json = await res.json()
      const rows: RawMcpServer[] = Array.isArray(json.data) ? json.data : Array.isArray(json.servers) ? json.servers : []
      setServers(rows.map(normalizeServer))
    } catch {
      toast.error('Error', { description: 'Failed to load MCP servers' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchServers()
    const interval = setInterval(fetchServers, 15000)
    return () => clearInterval(interval)
  }, [fetchServers])

  const handleAction = async (server: McpServerView, newStatus: 'connected' | 'disconnected') => {
    setActioning(server.id)
    try {
      const res = await apiFetch('/api/mcp-servers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: server.id, status: newStatus }),
      })
      if (res.ok) {
        toast.success(`Server ${newStatus}`, { description: `${server.name} marked ${newStatus}` })
        fetchServers()
      }
    } catch {
      toast.error('Error', { description: 'Action failed' })
    } finally {
      setActioning(null)
    }
  }

  const handleTest = async (server: McpServerView) => {
    setActioning(server.id)
    try {
      const res = await apiFetch('/api/mcp-servers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: server.id }),
      })
      const json = await res.json()
      if (json.reachable) {
        toast.success('MCP Probe Succeeded', {
          description: `${server.name} responded in ${json.latencyMs}ms (${json.toolCount ?? 0} tools discovered)`,
        })
      } else {
        toast.error('MCP Probe Failed', { description: json.error || 'Target did not respond cleanly' })
      }
      fetchServers()
    } catch {
      toast.error('Error', { description: 'MCP probe request failed' })
    } finally {
      setActioning(null)
    }
  }

  const openAdd = () => {
    setFormName('')
    setFormEndpoint('')
    setFormAuthType('none')
    setFormCapabilities('')
    setFormAutoStart(false)
    setAddOpen(true)
  }

  const handleAdd = async () => {
    if (!formName.trim() || !formEndpoint.trim()) {
      toast.error('Validation Error', { description: 'Name and endpoint URL are required' })
      return
    }
    let host = 'localhost'
    let port = 3000
    let protocol: 'http' | 'https' | 'ws' | 'wss' = 'https'
    try {
      const parsed = new URL(formEndpoint.trim())
      const proto = parsed.protocol.replace(':', '')
      if (proto === 'http' || proto === 'https' || proto === 'ws' || proto === 'wss') {
        protocol = proto
      }
      host = parsed.hostname
      port = parsed.port ? Number(parsed.port) : protocol === 'https' || protocol === 'wss' ? 443 : 80
    } catch {
      toast.error('Validation Error', { description: 'Enter a valid URL such as https://mcp.example.com:443' })
      return
    }

    const tools = formCapabilities
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    setSaving(true)
    try {
      const res = await apiFetch('/api/mcp-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          host,
          port,
          protocol,
          description: formEndpoint.trim(),
          config: { authType: formAuthType, autoStart: formAutoStart },
          tools,
        }),
      })
      if (res.ok) {
        toast.success('Added', { description: 'MCP server registered successfully' })
        setAddOpen(false)
        fetchServers()
      } else {
        const data = await res.json()
        toast.error('Error', { description: data.error || 'Failed to add server' })
      }
    } catch {
      toast.error('Error', { description: 'Failed to add server' })
    } finally {
      setSaving(false)
    }
  }

  const openDelete = (server: McpServerView) => {
    setSelectedServer(server)
    setDeleteOpen(true)
  }

  const openCallTool = (server: McpServerView) => {
    setSelectedServer(server)
    setCallToolName(server.capabilities[0] ?? '')
    setCallToolArgs('{}')
    setCallApproved(false)
    setCallResult(null)
    setCallOpen(true)
  }

  const handleCallTool = async () => {
    if (!selectedServer || !callToolName.trim()) {
      toast.error('Tool name is required')
      return
    }
    let parsedArgs: Record<string, unknown> = {}
    try {
      parsedArgs = JSON.parse(callToolArgs || '{}') as Record<string, unknown>
    } catch {
      toast.error('Invalid JSON arguments')
      return
    }
    setCallingTool(true)
    setCallResult(null)
    try {
      const res = await apiFetch('/api/mcp-servers/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedServer.id,
          toolName: callToolName.trim(),
          arguments: parsedArgs,
          approved: callApproved,
        }),
      })
      const json = await res.json()
      setCallResult(JSON.stringify(json, null, 2))
      if (res.ok && json.success) {
        toast.success(`MCP tool ${callToolName} executed (${json.latencyMs}ms)`)
        fetchServers()
      } else {
        toast.error(json.requiresApproval ? 'Approval required for mutating tool' : json.error || 'Tool call failed')
      }
    } catch {
      toast.error('MCP tools/call request failed')
    } finally {
      setCallingTool(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedServer) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/mcp-servers?id=${selectedServer.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Deleted', { description: 'MCP server removed' })
        setDeleteOpen(false)
        fetchServers()
      }
    } catch {
      toast.error('Error', { description: 'Failed to delete server' })
    } finally {
      setSaving(false)
    }
  }

  const connectedServers = servers.filter((s) => s.status === 'connected')
  const allCapabilities = [...new Set(servers.flatMap((s) => s.capabilities || []))]

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">MCP Server Manager</h2>
          <p className="text-sm text-[#64748B] mt-1">Manage and probe Model Context Protocol servers behind SSRF validation</p>
        </div>
        <Button onClick={openAdd} className="bg-[#0066CC] hover:bg-[#0066CC]/90">
          <Plus className="w-4 h-4 mr-2" />
          Add MCP Server
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Servers', value: servers.length, icon: Server, color: 'text-[#0066CC]' },
          { label: 'Connected', value: connectedServers.length, icon: Activity, color: 'text-emerald-600' },
          { label: 'Capabilities', value: allCapabilities.length, icon: RefreshCw, color: 'text-[#E8501A]' },
        ].map((stat) => (
          <Card key={stat.label} className="border-[#E2E8F0]">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#F8FAFC]">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#1E293B]">{stat.value}</p>
                <p className="text-xs text-[#94A3B8]">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {servers.length === 0 ? (
        <Card className="border-[#E2E8F0]">
          <CardContent className="py-16 text-center">
            <Server className="w-12 h-12 text-[#CBD5E1] mx-auto mb-3" />
            <p className="text-sm text-[#94A3B8]">No MCP servers registered. Add your first server.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.map((server) => (
            <Card key={server.id} className="border-[#E2E8F0] hover:shadow-sm transition-shadow">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[#F8FAFC] shrink-0">
                      <Server className="w-5 h-5 text-[#0066CC]" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold text-[#1E293B] truncate">{server.name}</CardTitle>
                      <p className="text-xs text-[#94A3B8] font-mono truncate">{server.endpointUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <HealthDot status={server.status} />
                    <Badge
                      variant={server.status === 'connected' ? 'default' : 'secondary'}
                      className={`text-[10px] ${
                        server.status === 'connected'
                          ? 'bg-emerald-100 text-emerald-700'
                          : server.status === 'error'
                            ? 'bg-red-100 text-red-700'
                            : ''
                      }`}
                    >
                      {server.status === 'connected' ? 'Connected' : server.status === 'error' ? 'Error' : 'Disconnected'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {server.capabilities.map((cap) => (
                    <Badge
                      key={cap}
                      variant="secondary"
                      className={`text-[10px] ${capColors[cap] || 'bg-gray-100 text-gray-600'}`}
                    >
                      {cap}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>Auth: {server.authType}</span>
                  <div className="flex items-center gap-2">
                    {typeof server.latencyMs === 'number' && <span>{server.latencyMs} ms</span>}
                    {server.autoStart && <Badge variant="outline" className="text-[10px]">Auto-Start</Badge>}
                  </div>
                </div>

                {server.lastError && (
                  <p className="text-[11px] text-red-600 truncate" title={server.lastError}>
                    {server.lastError}
                  </p>
                )}

                {server.lastPingAt && (
                  <p className="text-[10px] text-[#94A3B8]">
                    Last probe: {new Date(server.lastPingAt).toLocaleString()}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F1F5F9]">
                  {server.status !== 'connected' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      disabled={actioning === server.id}
                      onClick={() => handleAction(server, 'connected')}
                    >
                      {actioning === server.id ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 mr-1" />
                      )}
                      Enable
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      disabled={actioning === server.id}
                      onClick={() => handleAction(server, 'disconnected')}
                    >
                      <Square className="w-3 h-3 mr-1" />
                      Disable
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    disabled={actioning === server.id}
                    onClick={() => handleTest(server)}
                  >
                    <PlugZap className="w-3 h-3 mr-1" />
                    Test Connection
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => openCallTool(server)}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Call Tool
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 ml-auto"
                    onClick={() => openDelete(server)}
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#0066CC]" />
              Add MCP Server
            </DialogTitle>
            <DialogDescription>Register a new Model Context Protocol server</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Server Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Browse MCP Server" className="mt-1" />
            </div>
            <div>
              <Label>Endpoint URL</Label>
              <Input value={formEndpoint} onChange={(e) => setFormEndpoint(e.target.value)} placeholder="https://mcp.example.com:443" className="mt-1" />
            </div>
            <div>
              <Label>Auth Type</Label>
              <Select value={formAuthType} onValueChange={setFormAuthType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="api-key">API Key</SelectItem>
                  <SelectItem value="oauth">OAuth 2.0</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Capabilities / Tools (comma-separated)</Label>
              <Input value={formCapabilities} onChange={(e) => setFormCapabilities(e.target.value)} placeholder="browser.inspect_page, repo.read_file" className="mt-1" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formAutoStart} onCheckedChange={setFormAutoStart} />
              <Label>Auto-start on system boot</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-[#0066CC] hover:bg-[#0066CC]/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={callOpen} onOpenChange={setCallOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-4 h-4 text-[#0066CC]" />
              Call MCP Tool — {selectedServer?.name}
            </DialogTitle>
            <DialogDescription>
              Invoke JSON-RPC tools/call behind SSRF validation, risk gating, and audit logging.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Tool Name</Label>
              <Input
                value={callToolName}
                onChange={(e) => setCallToolName(e.target.value)}
                placeholder="e.g., repo.read_file"
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <Label>Arguments (JSON)</Label>
              <Input
                value={callToolArgs}
                onChange={(e) => setCallToolArgs(e.target.value)}
                placeholder='{"path":"README.md"}'
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={callApproved} onCheckedChange={setCallApproved} />
              <Label className="text-xs">Explicit human approval for mutating/write tools</Label>
            </div>
            {callResult && (
              <pre className="text-[11px] bg-slate-50 border border-slate-200 rounded p-2.5 max-h-48 overflow-auto whitespace-pre-wrap break-all">
                {callResult}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallOpen(false)}>Close</Button>
            <Button onClick={handleCallTool} disabled={callingTool} className="bg-[#0066CC] hover:bg-[#0066CC]/90">
              {callingTool && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Execute Tool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove MCP Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &quot;{selectedServer?.name}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
