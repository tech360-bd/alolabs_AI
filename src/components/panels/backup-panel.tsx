'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  HardDrive,
  Download,
  Upload,
  Clock,
  Settings,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface Backup {
  id: string
  key: string
  backupId: string
  type: string
  size: number
  status: string
  duration: number
  compression: boolean
  createdAt: string
  updatedAt: string
}

interface BackupConfig {
  autoBackup: boolean
  schedule: string
  retentionDays: number
  compression: boolean
}

function formatBytes(mb: number) {
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(1)} MB`
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

const statusBadge: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  completed: { variant: 'default', label: 'Completed' },
  failed: { variant: 'destructive', label: 'Failed' },
  in_progress: { variant: 'secondary', label: 'In Progress' },
  pending: { variant: 'outline', label: 'Pending' },
}

export default function BackupPanel() {
  const [backups, setBackups] = useState<Backup[]>([])
  const [config, setConfig] = useState<BackupConfig>({ autoBackup: true, schedule: 'daily', retentionDays: 30, compression: true })
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoreDialog, setRestoreDialog] = useState<Backup | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch('/api/backups')
      if (res.ok) {
        const json = await res.json()
        setBackups(json.data || [])
        if (json.config) setConfig(json.config)
      }
    } catch {
      toast.error('Error', { description: 'Failed to load backups' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchBackups() }, [fetchBackups])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/backups/create', { method: 'POST' })
      if (res.ok) {
        toast.success('Success', { description: 'Backup created successfully'  })
        fetchBackups()
      } else {
        toast.error('Error', { description: 'Failed to create backup' })
      }
    } catch {
      toast.error('Error', { description: 'Failed to create backup' })
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async () => {
    if (!restoreDialog) return
    setRestoring(restoreDialog.id)
    try {
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: restoreDialog.backupId }),
      })
      if (res.ok) {
        toast.success('Success', { description: 'Backup restored successfully'  })
        setRestoreDialog(null)
      } else {
        toast.error('Error', { description: 'Failed to restore backup' })
      }
    } catch {
      toast.error('Error', { description: 'Failed to restore backup' })
    } finally {
      setRestoring(null)
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_config', config }),
      })
      if (res.ok) {
        toast.success('Success', { description: 'Configuration saved'  })
      }
    } catch {
      toast.error('Error', { description: 'Failed to save config' })
    } finally {
      setSavingConfig(false)
    }
  }

  const lastBackup = backups[0]
  const totalSize = backups.reduce((sum, b) => sum + (b.size || 0), 0)

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <HardDrive className="h-5 w-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1E293B]">Backup & Restore</h2>
            <p className="text-xs text-[#94A3B8]">Manage system backups and restore points</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={creating}
          className="gap-1.5 bg-[#003ABC] hover:bg-[#003ABC]/90 text-white"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Create Backup Now
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-[#94A3B8]">Last Backup</p>
                <p className="text-sm font-semibold text-[#1E293B]">
                  {lastBackup ? new Date(lastBackup.createdAt).toLocaleString() : 'Never'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-[#003ABC]/10 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-[#003ABC]" />
              </div>
              <div>
                <p className="text-xs text-[#94A3B8]">Total Backup Size</p>
                <p className="text-sm font-semibold text-[#1E293B]">{formatBytes(totalSize)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-[#94A3B8]">Status</p>
                <p className="text-sm font-semibold text-emerald-600">
                  {lastBackup?.status === 'completed' ? 'Healthy' : lastBackup?.status || 'No backups'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Config Section */}
      <Card className="border-[#E2E8F0]">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-[#64748B]" />
            <CardTitle className="text-sm font-semibold text-[#1E293B]">Backup Configuration</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-[#1E293B]">Auto Backup</Label>
              <p className="text-xs text-[#94A3B8]">Automatically create backups on schedule</p>
            </div>
            <Switch
              checked={config.autoBackup}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, autoBackup: v }))}
            />
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-[#1E293B]">Schedule</Label>
              <select
                className="w-full h-9 px-3 text-sm border border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#003ABC]/20 focus:border-[#003ABC]"
                value={config.schedule}
                onChange={(e) => setConfig((c) => ({ ...c, schedule: e.target.value }))}
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-[#1E293B]">Retention (days)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={config.retentionDays}
                onChange={(e) => setConfig((c) => ({ ...c, retentionDays: parseInt(e.target.value) || 30 }))}
                className="h-9 text-sm border-[#E2E8F0]"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-[#1E293B]">Compression</Label>
              <p className="text-xs text-[#94A3B8]">Compress backups to reduce storage</p>
            </div>
            <Switch
              checked={config.compression}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, compression: v }))}
            />
          </div>
          <Button
            size="sm"
            onClick={handleSaveConfig}
            disabled={savingConfig}
            variant="outline"
            className="border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:border-[#003ABC]"
          >
            {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Backup History Table */}
      <Card className="border-[#E2E8F0]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">Backup History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-12">
              <HardDrive className="h-10 w-10 text-[#CBD5E1] mx-auto mb-3" />
              <p className="text-sm text-[#94A3B8]">No backups yet</p>
              <p className="text-xs text-[#CBD5E1] mt-1">Create your first backup to get started</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0]">
                    <TableHead className="text-xs text-[#64748B]">Date</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Type</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Size</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Status</TableHead>
                    <TableHead className="text-xs text-[#64748B]">Duration</TableHead>
                    <TableHead className="text-xs text-[#64748B] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((b) => {
                    const badge = statusBadge[b.status] || statusBadge.pending
                    return (
                      <TableRow key={b.id} className="border-[#E2E8F0]">
                        <TableCell className="text-xs text-[#1E293B]">
                          {new Date(b.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize border-[#E2E8F0] text-[#64748B]">
                            {b.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-[#1E293B]">{formatBytes(b.size || 0)}</TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-[#64748B]">{formatDuration(b.duration || 0)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRestoreDialog(b)}
                            disabled={b.status !== 'completed'}
                            className="h-7 text-xs gap-1 text-[#64748B] hover:text-[#003ABC]"
                          >
                            <Upload className="h-3 w-3" />
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <Dialog open={!!restoreDialog} onOpenChange={(open) => !open && setRestoreDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">Confirm Restore</DialogTitle>
            <DialogDescription className="text-[#64748B]">
              Are you sure you want to restore from this backup? This action will overwrite current data.
            </DialogDescription>
          </DialogHeader>
          {restoreDialog && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-[#94A3B8]" />
                <span className="text-[#64748B]">Date:</span>
                <span className="text-[#1E293B] font-medium">{new Date(restoreDialog.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <HardDrive className="h-4 w-4 text-[#94A3B8]" />
                <span className="text-[#64748B]">Size:</span>
                <span className="text-[#1E293B] font-medium">{formatBytes(restoreDialog.size || 0)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-amber-600 font-medium">This action cannot be undone</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialog(null)} className="border-[#E2E8F0] text-[#64748B]">
              Cancel
            </Button>
            <Button
              onClick={handleRestore}
              disabled={restoring !== null}
              className="bg-[#EF4444] hover:bg-[#EF4444]/90 text-white"
            >
              {restoring ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Play className="h-4 w-4 mr-1.5" />}
              Restore Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}