'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Database,
  Server,
  HardDrive,
  Network,
  Wifi,
  WifiOff,
  RefreshCw,
  Activity,
  Zap,
  Settings,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceStatus {
  type: string
  name: string
  status: string
  connected: boolean
  latencyMs: number
  version: string | null
  lastPingAt: string | null
  errorCount: number
  lastError: string | null
  config: { host: string; port: number }
}

interface PingResult {
  success: boolean
  latencyMs: number
  error?: string
}

// ─── Service Config ───────────────────────────────────────────────────────────

const SERVICE_META: Record<string, {
  icon: React.ElementType
  defaultPort: number
  color: string
  description: string
}> = {
  postgresql: {
    icon: Database,
    defaultPort: 5432,
    color: '#336791',
    description: 'Relational database for structured data',
  },
  redis: {
    icon: Zap,
    defaultPort: 6379,
    color: '#DC382D',
    description: 'In-memory key-value store and cache',
  },
  qdrant: {
    icon: Network,
    defaultPort: 6333,
    color: '#DC2F5E',
    description: 'Vector database for similarity search',
  },
  minio: {
    icon: HardDrive,
    defaultPort: 9000,
    color: '#C72C48',
    description: 'S3-compatible object storage',
  },
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    connected: { label: 'Connected', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    disconnected: { label: 'Disconnected', className: 'bg-gray-100 text-gray-500 border-gray-200' },
    fallback: { label: 'Fallback', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    error: { label: 'Error', className: 'bg-red-100 text-red-700 border-red-200' },
  }
  const c = config[status] || config.disconnected
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

// ─── Connection Dialog ────────────────────────────────────────────────────────

function ConnectDialog({
  serviceType,
  onConnect,
  onDisconnect,
}: {
  serviceType: string
  onConnect: (type: string, config: Record<string, unknown>, action: string) => Promise<void>
  onDisconnect: (type: string) => Promise<void>
}) {
  const meta = SERVICE_META[serviceType]
  const Icon = meta?.icon || Server
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<'connect' | 'disconnect'>('connect')

  // Form fields
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState(String(meta?.defaultPort || 0))
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('agent_hub')
  const [user, setUser] = useState('postgres')
  const [ssl, setSsl] = useState(false)
  const [dbNum, setDbNum] = useState('0')
  const [prefix, setPrefix] = useState('alohub:')
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('localhost')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [bucket, setBucket] = useState('agent-hub')
  const [region, setRegion] = useState('us-east-1')

  const handleConnect = async () => {
    setLoading(true)
    try {
      let config: Record<string, unknown> = {}
      if (serviceType === 'postgresql') {
        config = { host, port: parseInt(port), database, user, password, ssl }
      } else if (serviceType === 'redis') {
        config = { host, port: parseInt(port), password: password || undefined, db: parseInt(dbNum), prefix }
      } else if (serviceType === 'qdrant') {
        config = { host, port: parseInt(port), api_key: apiKey || undefined }
      } else if (serviceType === 'minio') {
        config = { endpoint, port: parseInt(port), access_key: accessKey, secret_key: secretKey, ssl, bucket, region }
      }
      await onConnect(serviceType, config, 'connect')
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      await onDisconnect(serviceType)
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const renderFields = () => {
    switch (serviceType) {
      case 'postgresql':
        return (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Host</Label>
                <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="5432" type="number" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Database</Label>
              <Input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="agent_hub" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>User</Label>
                <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="postgres" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={ssl} onCheckedChange={setSsl} />
              <Label>Enable SSL/TLS</Label>
            </div>
          </div>
        )
      case 'redis':
        return (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Host</Label>
                <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="6379" type="number" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="(optional)" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>DB Index</Label>
                <Input value={dbNum} onChange={(e) => setDbNum(e.target.value)} placeholder="0" type="number" />
              </div>
              <div className="space-y-2">
                <Label>Key Prefix</Label>
                <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="alohub:" />
              </div>
            </div>
          </div>
        )
      case 'qdrant':
        return (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Host</Label>
                <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="6333" type="number" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="(optional)" />
            </div>
          </div>
        )
      case 'minio':
        return (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Endpoint</Label>
                <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="localhost" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="9000" type="number" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Access Key</Label>
                <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder="Enter access key" />
              </div>
              <div className="space-y-2">
                <Label>Secret Key</Label>
                <Input value={secretKey} onChange={(e) => setSecretKey(e.target.value)} type="password" placeholder="Enter secret key" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bucket</Label>
                <Input value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="agent-hub" />
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us-east-1" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={ssl} onCheckedChange={setSsl} />
              <Label>Enable SSL</Label>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1.5 border-[#E2E8F0] hover:bg-[#F1F5F9]"
        >
          <Settings className="w-3.5 h-3.5" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className="w-5 h-5" style={{ color: meta?.color }} />
            {meta?.description || serviceType} — Connection
          </DialogTitle>
        </DialogHeader>
        <Tabs value={action} onValueChange={(v) => setAction(v as 'connect' | 'disconnect')}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="connect" className="text-xs">Connect</TabsTrigger>
            <TabsTrigger value="disconnect" className="text-xs">Disconnect</TabsTrigger>
          </TabsList>
          <TabsContent value="connect">
            <div className="space-y-2">
              {renderFields()}
              <Button
                onClick={handleConnect}
                disabled={loading}
                className="w-full bg-[#003ABC] hover:bg-[#003ABC]/90 text-white mt-4"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wifi className="w-4 h-4 mr-2" />
                )}
                Connect to {serviceType}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="disconnect">
            <div className="space-y-4 py-4">
              <p className="text-sm text-[#64748B]">
                Disconnect from {serviceType}. Active connections will be closed.
              </p>
              <Button
                onClick={handleDisconnect}
                disabled={loading}
                variant="destructive"
                className="w-full"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <WifiOff className="w-4 h-4 mr-2" />
                )}
                Disconnect
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ─── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onPing,
  onConnect,
  onDisconnect,
  pinging,
}: {
  service: ServiceStatus
  onPing: (type: string) => Promise<void>
  onConnect: (type: string, config: Record<string, unknown>, action: string) => Promise<void>
  onDisconnect: (type: string) => Promise<void>
  pinging: boolean
}) {
  const meta = SERVICE_META[service.type]
  const Icon = meta?.icon || Server

  return (
    <Card className="bg-white border-[#E2E8F0] shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${meta?.color}15` }}
            >
              <Icon className="w-5 h-5" style={{ color: meta?.color }} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-[#1E293B]">{service.name}</CardTitle>
              <p className="text-[11px] text-[#94A3B8]">{meta?.description}</p>
            </div>
          </div>
          <StatusBadge status={service.status} />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="text-[#94A3B8]">Host</span>
            <p className="font-medium text-[#1E293B] truncate">{service.config.host}:{service.config.port}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[#94A3B8]">Latency</span>
            <p className="font-medium text-[#1E293B]">{service.latencyMs > 0 ? `${service.latencyMs}ms` : '—'}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[#94A3B8]">Version</span>
            <p className="font-medium text-[#1E293B] truncate">{service.version || '—'}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[#94A3B8]">Last Ping</span>
            <p className="font-medium text-[#1E293B]">
              {service.lastPingAt
                ? new Date(service.lastPingAt).toLocaleTimeString()
                : '—'}
            </p>
          </div>
        </div>

        {/* Error info */}
        {service.lastError && (
          <div className="rounded-md bg-red-50 border border-red-100 p-2">
            <p className="text-[11px] text-red-600 font-medium">
              Error (×{service.errorCount}): {service.lastError}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5 border-[#E2E8F0] hover:bg-[#F1F5F9]"
            onClick={() => onPing(service.type)}
            disabled={pinging}
          >
            {pinging ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Activity className="w-3 h-3" />
            )}
            Ping
          </Button>
          <ConnectDialog
            serviceType={service.type}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function InfraDashboardPanel() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [pinging, setPinging] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [pingResults, setPingResults] = useState<Record<string, PingResult> | null>(null)
  const [logs, setLogs] = useState<{ time: string; message: string; type: string }[]>([])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/infra/status')
      const data = await res.json()
      setServices(data.services || [])
    } catch {
      // Silent fail on initial load
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const addLog = useCallback((message: string, type: string) => {
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), message, type },
      ...prev,
    ].slice(0, 20))
  }, [])

  const handlePingAll = async () => {
    setPinging(true)
    setPingResults(null)
    try {
      const res = await fetch('/api/infra/ping', { method: 'POST' })
      const data = await res.json()
      setPingResults(data.results)
      // Log results
      for (const [svc, result] of Object.entries(data.results)) {
        const r = result as PingResult
        addLog(
          `${svc}: ${r.success ? `OK (${r.latencyMs}ms)` : `FAIL - ${r.error || 'unknown'}`}`,
          r.success ? 'success' : 'error'
        )
      }
      // Refresh status after ping
      await fetchStatus()
    } catch {
      addLog('Ping all failed — network error', 'error')
    } finally {
      setPinging(false)
    }
  }

  const handlePingOne = async (type: string) => {
    setPinging(true)
    try {
      const res = await fetch('/api/infra/ping', { method: 'POST' })
      const data = await res.json()
      const result = data.results[type] as PingResult | undefined
      if (result) {
        addLog(
          `${type}: ${result.success ? `OK (${result.latencyMs}ms)` : `FAIL - ${result.error || 'unknown'}`}`,
          result.success ? 'success' : 'error'
        )
      }
      await fetchStatus()
    } catch {
      addLog(`${type} ping failed`, 'error')
    } finally {
      setPinging(false)
    }
  }

  const handleConnect = async (type: string, config: Record<string, unknown>, action: string) => {
    setConnecting(type)
    try {
      const res = await fetch('/api/infra/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, config, action }),
      })
      const data = await res.json()
      if (data.success) {
        addLog(`${type} connected successfully (${data.latencyMs}ms)${data.version ? ` — ${data.version}` : ''}`, 'success')
      } else {
        addLog(`${type} connect failed: ${data.error || 'unknown'}`, 'error')
      }
      await fetchStatus()
    } catch {
      addLog(`${type} connect request failed`, 'error')
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (type: string) => {
    setConnecting(type)
    try {
      await fetch('/api/infra/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, action: 'disconnect' }),
      })
      addLog(`${type} disconnected`, 'info')
      await fetchStatus()
    } catch {
      addLog(`${type} disconnect failed`, 'error')
    } finally {
      setConnecting(null)
    }
  }

  // Stats
  const connectedCount = services.filter((s) => s.connected).length
  const totalLatency = services.reduce((sum, s) => sum + s.latencyMs, 0)

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-72 bg-gray-100 rounded-lg" />
          <div className="h-4 w-96 bg-gray-100 rounded-lg" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-52 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1E293B]">Infrastructure Services</h2>
          <p className="text-sm text-[#94A3B8] mt-0.5">
            Manage PostgreSQL, Redis, Qdrant, and MinIO connections
          </p>
        </div>
        <Button
          onClick={handlePingAll}
          disabled={pinging}
          className="bg-[#003ABC] hover:bg-[#003ABC]/90 text-white gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${pinging ? 'animate-spin' : ''}`} />
          {pinging ? 'Pinging All...' : 'Ping All Services'}
        </Button>
      </div>

      {/* Ping Results Banner */}
      {pingResults && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.entries(pingResults) as [string, PingResult][]).map(([type, result]) => {
            const meta = SERVICE_META[type]
            const Icon = meta?.icon || Server
            return (
              <div
                key={type}
                className={`flex items-center gap-3 rounded-lg p-3 border ${
                  result.success
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" style={{ color: result.success ? '#059669' : '#DC2626' }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#1E293B]">{type}</p>
                  <p className="text-[11px] text-[#64748B]">
                    {result.success ? `${result.latencyMs}ms` : result.error || 'Failed'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Service Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {services.map((service) => (
          <ServiceCard
            key={service.type}
            service={service}
            onPing={handlePingOne}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            pinging={pinging && connecting === null}
          />
        ))}
      </div>

      {/* Stats Section */}
      <Card className="bg-white border-[#E2E8F0] shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#003ABC]" />
            Aggregated Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-[#F8FAFC]">
              <p className="text-2xl font-bold text-[#003ABC]">{services.length}</p>
              <p className="text-xs text-[#94A3B8] mt-1">Total Services</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-emerald-50">
              <p className="text-2xl font-bold text-emerald-600">{connectedCount}</p>
              <p className="text-xs text-[#94A3B8] mt-1">Connected</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-[#F8FAFC]">
              <p className="text-2xl font-bold text-[#1E293B]">{totalLatency > 0 ? `${totalLatency}ms` : '—'}</p>
              <p className="text-xs text-[#94A3B8] mt-1">Total Latency</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-[#F8FAFC]">
              <p className="text-2xl font-bold text-[#FF6A00]">
                {services.reduce((sum, s) => sum + s.errorCount, 0)}
              </p>
              <p className="text-xs text-[#94A3B8] mt-1">Total Errors</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Log */}
      <Card className="bg-white border-[#E2E8F0] shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
              <Server className="w-4 h-4 text-[#003ABC]" />
              Connection Log
            </CardTitle>
            {logs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLogs([])}
                className="text-xs text-[#94A3B8] hover:text-[#1E293B]"
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-[#94A3B8] text-center py-6">
              No connection events yet. Use Connect or Ping to generate logs.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 text-xs py-1.5 px-2 rounded-md hover:bg-[#F8FAFC]"
                >
                  <span className="text-[#94A3B8] font-mono whitespace-nowrap mt-0.5">
                    {log.time}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                      log.type === 'success'
                        ? 'bg-emerald-500'
                        : log.type === 'error'
                          ? 'bg-red-500'
                          : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-[#1E293B] break-all">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}