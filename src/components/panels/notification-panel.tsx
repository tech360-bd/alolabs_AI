'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  BellRing,
  CheckCheck,
  AlertTriangle,
  Info,
  CheckCircle,
  Loader2,
  ShieldAlert,
  Activity,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

interface Notification {
  id: string
  key: string
  type: string
  title: string
  message: string
  read: boolean
  priority?: string
  createdAt: string
  updatedAt: string
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string; borderColor: string }> = {
  approval_required: { icon: CheckCircle, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  security_alert: { icon: ShieldAlert, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  system_update: { icon: Info, color: 'text-[#003ABC]', bgColor: 'bg-[#003ABC]/5', borderColor: 'border-[#003ABC]/20' },
  job_completed: { icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  agent_alert: { icon: Activity, color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
  usage_warning: { icon: AlertTriangle, color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
}

function NotificationSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-[#E2E8F0]">
          <Skeleton className="h-9 w-9 rounded-full bg-gray-100 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 bg-gray-100" />
            <Skeleton className="h-3 w-full bg-gray-100" />
            <Skeleton className="h-3 w-1/4 bg-gray-100" />
          </div>
          <Skeleton className="h-2.5 w-2.5 rounded-full bg-gray-100 flex-shrink-0 mt-1" />
        </div>
      ))}
    </div>
  )
}

function NotificationCard({ notification, onMarkRead }: { notification: Notification; onMarkRead: (id: string) => void }) {
  const config = typeConfig[notification.type] || typeConfig.system_update
  const Icon = config.icon

  const timeAgo = (dateStr: string) => {
    const now = new Date()
    const date = new Date(dateStr)
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer hover:shadow-sm ${
        notification.read
          ? 'bg-white border-[#E2E8F0] opacity-75'
          : `${config.bgColor} ${config.borderColor} border`
      }`}
      onClick={() => !notification.read && onMarkRead(notification.id)}
    >
      <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${config.bgColor}`}>
        <Icon className={`h-4 w-4 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium truncate ${notification.read ? 'text-[#64748B]' : 'text-[#1E293B]'}`}>
            {notification.title}
          </p>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal border-[#E2E8F0] text-[#94A3B8] flex-shrink-0">
            {notification.type.replace(/_/g, ' ')}
          </Badge>
        </div>
        <p className="text-xs text-[#64748B] mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-[10px] text-[#94A3B8] mt-1">{timeAgo(notification.createdAt)}</p>
      </div>
      {!notification.read && (
        <div className="h-2.5 w-2.5 rounded-full bg-[#FF6A00] flex-shrink-0 mt-1.5" />
      )}
    </div>
  )
}

export default function NotificationPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [activeTab, setActiveTab] = useState('unread')

  const fetchNotifications = useCallback(async () => {
    try {
      const tabParam = activeTab === 'unread' ? 'unread' : activeTab === 'alerts' ? 'alerts' : activeTab === 'system' ? 'system' : ''
      const res = await fetch(`/api/notifications?tab=${tabParam}`)
      if (res.ok) {
        const json = await res.json()
        setNotifications(json.data || [])
      }
    } catch {
      toast.error('Error', { description: 'Failed to load notifications' })
    } finally {
      setLoading(false)
    }
  }, [activeTab, toast])

  useEffect(() => {
    setLoading(true)
    fetchNotifications()
  }, [fetchNotifications])

  const handleMarkRead = async (id: string) => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    } catch {
      toast.error('Error', { description: 'Failed to mark as read' })
    }
  }

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      toast.success('Success', { description: 'All notifications marked as read'  })
    } catch {
      toast.error('Error', { description: 'Failed to mark all as read' })
    } finally {
      setMarkingAll(false)
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#003ABC]/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-[#003ABC]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#1E293B]">Notification Center</h2>
            <p className="text-xs text-[#94A3B8]">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="gap-1.5 text-xs border-[#E2E8F0] text-[#64748B] hover:text-[#003ABC] hover:border-[#003ABC]"
          >
            {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Mark All Read
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Unread', value: notifications.filter((n) => !n.read).length, icon: BellRing, color: 'text-[#FF6A00]', bg: 'bg-[#FF6A00]/10' },
          { label: 'Alerts', value: notifications.filter((n) => ['security_alert', 'usage_warning', 'agent_alert'].includes(n.type)).length, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
          { label: 'System', value: notifications.filter((n) => n.type === 'system_update').length, icon: Info, color: 'text-[#003ABC]', bg: 'bg-[#003ABC]/10' },
          { label: 'Total', value: notifications.length, icon: Bell, color: 'text-[#64748B]', bg: 'bg-gray-100' },
        ].map((stat) => (
          <Card key={stat.label} className="border-[#E2E8F0]">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1E293B]">{stat.value}</p>
                <p className="text-[10px] text-[#94A3B8]">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Card className="border-[#E2E8F0]">
        <CardHeader className="pb-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-[#F1F5F9] h-9">
              {[
                { value: 'unread', label: 'Unread' },
                { value: 'all', label: 'All' },
                { value: 'alerts', label: 'Alerts' },
                { value: 'system', label: 'System' },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="text-xs data-[state=active]:bg-white data-[state=active]:text-[#003ABC] data-[state=active]:shadow-sm"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <NotificationSkeleton />
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-10 w-10 text-[#CBD5E1] mx-auto mb-3" />
              <p className="text-sm text-[#94A3B8]">No notifications</p>
              <p className="text-xs text-[#CBD5E1] mt-1">
                {activeTab === 'unread' ? 'You\'re all caught up!' : 'No notifications in this category'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {notifications.map((n) => (
                <NotificationCard key={n.id} notification={n} onMarkRead={handleMarkRead} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}