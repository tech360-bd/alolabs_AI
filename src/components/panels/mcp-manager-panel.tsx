'use client'

import { useState, useEffect, useCallback } from 'react'
import { Server, Plus, Play, Square, RefreshCw, Activity, Loader2, Trash2 } from 'lucide-react'
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

interface McpServer {
  id: string
  name: string
  endpointUrl: string
  authType: string
  capabilities: string[]
  autoStart: boolean
  status: string
  lastHeartbeat: string | null
  updatedAt: string
}

const capColors: Record<string, string> = {
  'file-system': 'bg-purple-100 text-purple-700',
  'web-search': 'bg-cyan-100 text-cyan-700',
  'database': 'bg-emerald-100 text-emerald-700',
  'code-execution': 'bg-amber-100 text-amber-700',
  'messaging': 'bg-pink-100 text-pink-700',
  'analytics': 'bg-orange-100 text-orange-700',
}

function HealthDot({ status }: { status: string }) {
  const color = status === 'active' ? 'bg-emerald-500' : status === 'starting' ? 'bg-amber-400' : 'bg-gray-300'
  const pulse = status === 'active' ? 'animate-pulse' : ''
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} ${pulse}`} />
}

export default function McpManagerPanel() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actioning, setActioning] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null)

  const [formName, setFormName] = useState('')
  const [formEndpoint, setFormEndpoint] = useState('')
  const [formAuthType, setFormAuthType] = useState('none')
  const [formCapabilities, setFormCapabilities] = useState('')
  const [formAutoStart, setFormAutoStart] = useState(false)

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp-servers')
      const data = await res.json()
      setServers(data.servers || [])
    } catch {
      toast.error('Error', { description: 'Failed to load MCP servers' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchServers()
    const interval = setInterval(fetchServers, 15000)
    return () => clearInterval(interval)
  }, [fetchServers])

  const handleAction = async (server: McpServer, newStatus: string) => {
    setActioning(server.id)
    try {
      const res = await fetch('/api/mcp-servers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: server.id, status: newStatus }),
      })
      if (res.ok) {
        const label = newStatus === 'active' ? 'started' : newStatus === 'stopped' ? 'stopped' : 'restarting'
        toast.success(`Server ${label}`, { description: `${server.name} is now ${label}` })
        // If restarting, set to active after a delay
        if (newStatus === 'restarting') {
          setTimeout(async () => {
            await fetch('/api/mcp-servers', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: server.id, status: 'active' }),
            })
            fetchServers()
          }, 1500)
        } else {
          fetchServers()
        }
      }
    } catch {
      toast.error('Error', { description: 'Action failed' })
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
    setSaving(true)
    try {
      const res = await fetch('/api/mcp-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          endpointUrl: formEndpoint,
          authType: formAuthType,
          capabilities: formCapabilities,
          autoStart: formAutoStart,
        }),
      })
      if (res.ok) {
        toast.success('Added', { description: 'MCP server registered successfully'  })
        setAddOpen(false)
        fetchServers()
      } else {
        const data = await res.json()
        toast.error('Error', { description: data.error })
      }
    } catch {
      toast.error('Error', { description: 'Failed to add server' })
    } finally {
      setSaving(false)
    }
  }

  const openDelete = (server: McpServer) => {
    setSelectedServer(server)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!selectedServer) return
    setSaving(true)
    try {
      const res = await fetch(`/api/mcp-servers?id=${selectedServer.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Deleted', { description: 'MCP server removed'  })
        setDeleteOpen(false)
        fetchServers()
      }
    } catch {
      toast.error('Error', { description: 'Failed to delete server' })
    } finally {
      setSaving(false)
    }
  }

  const activeServers = servers.filter((s) => s.status === 'active')
  const allCapabilities = [...new Set(servers.flatMap((s) => s.capabilities || []))]

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">MCP Server Manager</h2>
          <p className="text-sm text-[#64748B] mt-1">Manage Model Context Protocol servers</p>
        </div>
        <Button onClick={openAdd} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
          <Plus className="w-4 h-4 mr-2" />
          Add MCP Server
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Servers', value: servers.length, icon: Server, color: 'text-[#003ABC]' },
          { label: 'Active', value: activeServers.length, icon: Activity, color: 'text-emerald-600' },
          { label: 'Capabilities', value: allCapabilities.length, icon: RefreshCw, color: 'text-[#FF6A00]' },
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

      {/* Server Cards */}
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
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#F8FAFC]">
                      <Server className="w-5 h-5 text-[#003ABC]" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#1E293B]">{server.name}</CardTitle>
                      <p className="text-xs text-[#94A3B8] font-mono truncate max-w-[220px]">{server.endpointUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <HealthDot status={server.status} />
                    <Badge
                      variant={server.status === 'active' ? 'default' : 'secondary'}
                      className={`text-[10px] ${server.status === 'active' ? 'bg-emerald-100 text-emerald-700' : ''}`}
                    >
                      {server.status === 'active' ? 'Running' : server.status === 'starting' ? 'Starting' : server.status === 'restarting' ? 'Restarting' : 'Stopped'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                {/* Capabilities */}
                <div className="flex flex-wrap gap-1.5">
                  {(server.capabilities || []).map((cap) => (
                    <Badge
                      key={cap}
                      variant="secondary"
                      className={`text-[10px] ${capColors[cap] || 'bg-gray-100 text-gray-600'}`}
                    >
                      {cap}
                    </Badge>
                  ))}
                </div>

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>Auth: {server.authType}</span>
                  {server.autoStart && <Badge variant="outline" className="text-[10px]">Auto-Start</Badge>}
                </div>

                {server.lastHeartbeat && (
                  <p className="text-[10px] text-[#CBD5E1]">
                    Last heartbeat: {new Date(server.lastHeartbeat).toLocaleString()}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-[#F1F5F9]">
                  {server.status !== 'active' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      disabled={actioning === server.id}
                      onClick={() => handleAction(server, 'active')}
                    >
                      {actioning === server.id ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 mr-1" />
                      )}
                      Start
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      disabled={actioning === server.id}
                      onClick={() => handleAction(server, 'stopped')}
                    >
                      <Square className="w-3 h-3 mr-1" />
                      Stop
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    disabled={actioning === server.id || server.status !== 'active'}
                    onClick={() => handleAction(server, 'restarting')}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Restart
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

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#003ABC]" />
              Add MCP Server
            </DialogTitle>
            <DialogDescription>Register a new Model Context Protocol server</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Server Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., File System Server" className="mt-1" />
            </div>
            <div>
              <Label>Endpoint URL</Label>
              <Input value={formEndpoint} onChange={(e) => setFormEndpoint(e.target.value)} placeholder="http://localhost:3001/mcp" className="mt-1" />
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
              <Label>Capabilities (comma-separated)</Label>
              <Input value={formCapabilities} onChange={(e) => setFormCapabilities(e.target.value)} placeholder="file-system, web-search, database" className="mt-1" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formAutoStart} onCheckedChange={setFormAutoStart} />
              <Label>Auto-start on system boot</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-[#003ABC] hover:bg-[#003ABC]/90">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
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