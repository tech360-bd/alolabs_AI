'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  OctagonAlert,
  Power,
  WifiOff,
  ShieldOff,
  Lock,
  Ban,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
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

interface EmergencyToggle {
  key: string
  label: string
  enabled: boolean
  updatedAt: string | null
}

interface ActivityEntry {
  id: string
  level: string
  message: string
  createdAt: string
}

const toggleIcons: Record<string, React.ElementType> = {
  emergency_stop_communication: WifiOff,
  emergency_stop_gpu: Power,
  emergency_disable_paid: Ban,
  emergency_readonly: Lock,
  emergency_revoke_sessions: ShieldOff,
  emergency_stop_queues: AlertTriangle,
  emergency_block_apikeys: ShieldOff,
  emergency_global_stop: OctagonAlert,
}

const toggleDescriptions: Record<string, string> = {
  emergency_stop_communication: 'Blocks all outbound emails, webhooks, and external API calls',
  emergency_stop_gpu: 'Immediately terminates all running GPU inference jobs',
  emergency_disable_paid: 'Suspends all billable services and third-party integrations',
  emergency_readonly: 'Puts the entire system in read-only mode, no writes allowed',
  emergency_revoke_sessions: 'Invalidates all active user sessions immediately',
  emergency_stop_queues: 'Halts all background job queues and workers',
  emergency_block_apikeys: 'Revokes all company API keys, blocking external access',
  emergency_global_stop: 'Activates ALL emergency measures simultaneously',
}

export default function EmergencyPanel() {
  const [toggles, setToggles] = useState<EmergencyToggle[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [confirmGlobal, setConfirmGlobal] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/emergency')
      const data = await res.json()
      setToggles(data.toggles || [])
      setActivity(data.activity || [])
    } catch {
      toast.error('Error', { description: 'Failed to load emergency state' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleToggle = async (key: string, enabled: boolean) => {
    if (key === 'emergency_global_stop') {
      setConfirmGlobal(true)
      return
    }
    setToggling(key)
    try {
      const res = await fetch('/api/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: key, enabled }),
      })
      if (res.ok) {
        if (enabled) {
          toast.error('Activated', { description: `${toggleDescriptions[key]?.slice(0, 60) || key} has been enabled` })
        } else {
          toast.success('Deactivated', { description: `${toggleDescriptions[key]?.slice(0, 60) || key} has been disabled` })
        }
        fetchData()
      }
    } catch {
      toast.error('Error', { description: 'Failed to toggle' })
    } finally {
      setToggling(null)
    }
  }

  const handleGlobalConfirm = async (enable: boolean) => {
    setConfirmGlobal(false)
    setToggling('emergency_global_stop')
    try {
      // Toggle all switches
      await Promise.all(
        toggles.map((t) =>
          fetch('/api/emergency', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: t.key, enabled: enable }),
          })
        )
      )
      if (enable) {
        toast.error('GLOBAL EMERGENCY ACTIVATED', { description: 'All emergency measures are now active' })
      } else {
        toast.success('All Emergencies Cleared', { description: 'System returned to normal operation' })
      }
      fetchData()
    } catch {
      toast.error('Error', { description: 'Failed to execute global action' })
    } finally {
      setToggling(null)
    }
  }

  const globalEnabled = toggles.find((t) => t.key === 'emergency_global_stop')?.enabled ?? false
  const activeCount = toggles.filter((t) => t.enabled).length

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[#1E293B]">Emergency Controls</h2>
        <p className="text-sm text-[#64748B] mt-1">Critical system controls for emergency situations. Use with extreme caution.</p>
      </div>

      {/* Global Emergency Button */}
      <Card className={`border-2 ${globalEnabled ? 'border-red-500 bg-red-50/50' : 'border-[#E2E8F0]'}`}>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${globalEnabled ? 'bg-red-500' : 'bg-red-100'}`}>
                <OctagonAlert className={`w-8 h-8 ${globalEnabled ? 'text-white' : 'text-red-600'}`} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-600">GLOBAL EMERGENCY STOP</h3>
                <p className="text-sm text-[#64748B]">
                  {globalEnabled ? 'All emergency measures are ACTIVE' : `${activeCount} of 8 measures active`}
                </p>
              </div>
            </div>
            <Button
              size="lg"
              variant={globalEnabled ? 'outline' : 'destructive'}
              className="min-w-[200px] text-base font-bold"
              onClick={() => setConfirmGlobal(true)}
              disabled={toggling === 'emergency_global_stop'}
            >
              {toggling === 'emergency_global_stop' ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : globalEnabled ? (
                'DEACTIVATE ALL'
              ) : (
                <>
                  <OctagonAlert className="w-5 h-5 mr-2" />
                  ACTIVATE ALL
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Toggle Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {toggles
          .filter((t) => t.key !== 'emergency_global_stop')
          .map((toggle) => {
            const Icon = toggleIcons[toggle.key] || AlertTriangle
            const isToggling = toggling === toggle.key
            return (
              <Card
                key={toggle.key}
                className={`transition-all duration-200 ${
                  toggle.enabled
                    ? 'border-red-300 bg-red-50/30 shadow-sm'
                    : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div className={`p-2 rounded-lg ${toggle.enabled ? 'bg-red-100' : 'bg-gray-100'}`}>
                      <Icon className={`w-5 h-5 ${toggle.enabled ? 'text-red-600' : 'text-[#64748B]'}`} />
                    </div>
                    <Switch
                      checked={toggle.enabled}
                      disabled={isToggling}
                      onCheckedChange={(checked) => handleToggle(toggle.key, checked)}
                      className="data-[state=checked]:bg-red-500"
                    />
                  </div>
                  <CardTitle className="text-sm font-semibold mt-2 text-[#1E293B] leading-tight">
                    {toggle.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-xs text-[#94A3B8] leading-relaxed mb-2">
                    {toggleDescriptions[toggle.key] || 'Emergency control'}
                  </p>
                  <div className="flex items-center justify-between">
                    <Badge variant={toggle.enabled ? 'destructive' : 'secondary'} className="text-[10px]">
                      {toggle.enabled ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                    {isToggling && <Loader2 className="w-3 h-3 animate-spin text-[#94A3B8]" />}
                  </div>
                  {toggle.updatedAt && (
                    <p className="text-[10px] text-[#CBD5E1] mt-2">
                      Last: {new Date(toggle.updatedAt).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
      </div>

      {/* Activity Log */}
      <Card className="border-[#E2E8F0]">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold text-[#1E293B]">Emergency Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {activity.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-4 text-center">No emergency activity recorded</p>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-2">
                {activity.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-[#F1F5F9] last:border-0">
                    <Badge
                      variant={entry.level === 'error' ? 'destructive' : 'secondary'}
                      className="text-[10px] mt-0.5 flex-shrink-0"
                    >
                      {entry.level.toUpperCase()}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1E293B] break-words">{entry.message}</p>
                      <p className="text-[10px] text-[#CBD5E1] mt-0.5">
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Global Confirmation Dialog */}
      <AlertDialog open={confirmGlobal} onOpenChange={setConfirmGlobal}>
        <AlertDialogContent className="border-red-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <OctagonAlert className="w-6 h-6" />
              {globalEnabled ? 'Deactivate All Emergency Measures' : 'Activate Global Emergency Stop'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {globalEnabled
                ? 'This will deactivate ALL emergency measures and return the system to normal operation. Are you sure?'
                : 'This will activate ALL 8 emergency measures simultaneously. All external communication, GPU jobs, paid services, and API keys will be blocked. This is a CRITICAL action.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleGlobalConfirm(!globalEnabled)}
              className={globalEnabled ? '' : 'bg-red-600 hover:bg-red-700'}
            >
              {globalEnabled ? 'Deactivate All' : 'Yes, Activate All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}