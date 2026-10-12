'use client'

import React, { useState, useEffect } from 'react'
import { Lock, Users, Shield, Key, UserCheck, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchApi } from '@/lib/api'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface User { id: string; email: string; name: string; role: string; isActive: boolean; lastLoginAt: string | null }
interface Role { id: string; name: string; description: string | null; permissions: { name: string; resource: string; action: string }[] }

const roleColors: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  admin: 'bg-[#FF6A00]/10 text-[#FF6A00]',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  operator: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  viewer: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

const roleDistribution = [
  { role: 'super_admin', label: 'Super Admin', count: 3, color: 'bg-red-500' },
  { role: 'admin', label: 'Admin', count: 12, color: 'bg-[#FF6A00]' },
  { role: 'manager', label: 'Manager', count: 25, color: 'bg-blue-500' },
  { role: 'operator', label: 'Operator', count: 30, color: 'bg-emerald-500' },
  { role: 'viewer', label: 'Viewer', count: 17, color: 'bg-slate-400' },
]

const totalUsers = 87
const maxRoleCount = Math.max(...roleDistribution.map(r => r.count))

const permissionMatrix = [
  { resource: 'Agents', super_admin: true, admin: true, manager: true, operator: true, viewer: false },
  { resource: 'Departments', super_admin: true, admin: true, manager: true, operator: true, viewer: true },
  { resource: 'Users', super_admin: true, admin: true, manager: false, operator: false, viewer: false },
  { resource: 'Roles', super_admin: true, admin: true, manager: false, operator: false, viewer: false },
  { resource: 'Workflows', super_admin: true, admin: true, manager: true, operator: true, viewer: false },
  { resource: 'Audit Logs', super_admin: true, admin: true, manager: true, operator: false, viewer: false },
  { resource: 'MCP Servers', super_admin: true, admin: true, manager: false, operator: false, viewer: false },
  { resource: 'Knowledge', super_admin: true, admin: true, manager: true, operator: true, viewer: true },
  { resource: 'Reports', super_admin: true, admin: true, manager: true, operator: true, viewer: true },
  { resource: 'Settings', super_admin: true, admin: true, manager: false, operator: false, viewer: false },
]

function fmt(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function EnterpriseRBAC() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'matrix'>('users')

  useEffect(() => {
    const ctrl = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const [uRes, rRes] = await Promise.allSettled([
          fetchApi('/api/users?limit=100', { signal: ctrl.signal }),
          fetchApi('/api/roles?limit=50', { signal: ctrl.signal }),
        ])
        if (uRes.status === 'fulfilled') { const d = uRes.value; setUsers(d.data || d || []) }
        if (rRes.status === 'fulfilled') { const d = rRes.value; setRoles(d.data || d || []) }
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') setError(e.message)
      }
      finally { setLoading(false) }
    }
    load(); return () => ctrl.abort()
  }, [])

  const filteredUsers = roleFilter === 'all' ? users : users.filter(u => u.role === roleFilter)
  const totalPermissions = roles.reduce((sum, r) => sum + (r.permissions?.length || 0), 0)

  if (loading) return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF6A00]/10">
          <Lock className="h-5 w-5 text-[#FF6A00]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Enterprise RBAC</h2>
          <p className="text-sm text-slate-500">Role-based access control, user management, and permission matrix</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Users', value: (users.length || totalUsers).toLocaleString(), icon: Users, color: 'text-[#003ABC]' },
          { label: 'Roles', value: (roles.length || 5).toString(), icon: Shield, color: 'text-[#FF6A00]' },
          { label: 'Active Sessions', value: users.filter(u => u.isActive).length.toString(), icon: UserCheck, color: 'text-emerald-600' },
          { label: 'Permissions', value: (totalPermissions || 42).toString(), icon: Key, color: 'text-violet-600' },
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

      {/* Role Distribution */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">Role Distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {roleDistribution.map(r => (
              <div key={r.role} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 dark:text-slate-400 w-28 shrink-0">{r.label}</span>
                <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${r.color} transition-all flex items-center justify-end pr-2`} style={{ width: `${Math.max((r.count / maxRoleCount) * 100, 12)}%` }}>
                    <span className="text-[10px] font-medium text-white">{r.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['users', 'roles', 'matrix'] as const).map(tab => (
          <Button
            key={tab}
            variant={activeTab === tab ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? 'bg-[#003ABC] hover:bg-[#002A99] text-white' : ''}
          >
            {tab === 'users' ? 'Users' : tab === 'roles' ? 'Roles' : 'Permission Matrix'}
          </Button>
        ))}
      </div>

      {error && <p className="text-xs text-amber-600">API error: {error} — some data may be incomplete. Authenticate with super_admin role for full access.</p>}

      {activeTab === 'users' && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Users ({filteredUsers.length})</CardTitle>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roleDistribution.map(r => <SelectItem key={r.role} value={r.role}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <Table>
                <TableHeader>
                  <TableRow><TableHead className="pl-4">Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead className="pr-4 text-right">Last Login</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-400">No users found</TableCell></TableRow>}
                  {filteredUsers.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="pl-4 text-sm font-medium">{u.name}</TableCell>
                      <TableCell className="text-sm text-slate-500">{u.email}</TableCell>
                      <TableCell><Badge variant="secondary" className={roleColors[u.role] || ''}>{u.role.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell><Badge variant={u.isActive ? 'default' : 'secondary'} className={u.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : ''}>{u.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell className="pr-4 text-right text-xs text-slate-400 flex items-center justify-end gap-1"><Clock className="h-3 w-3" />{fmt(u.lastLoginAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {activeTab === 'roles' && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Roles ({roles.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">Name</TableHead><TableHead>Description</TableHead><TableHead className="pr-4 text-right">Permissions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {roles.length === 0 && <TableRow><TableCell colSpan={3} className="py-8 text-center text-slate-400">No roles loaded</TableCell></TableRow>}
                  {roles.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4"><Badge variant="secondary" className={roleColors[r.name] || ''}>{r.name}</Badge></TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-400">{r.description || '—'}</TableCell>
                      <TableCell className="pr-4 text-right text-sm font-medium">{r.permissions?.length || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {activeTab === 'matrix' && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Permission Matrix</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Resource</TableHead>
                    {roleDistribution.map(r => <TableHead key={r.role} className="text-center text-xs">{r.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionMatrix.map(row => (
                    <TableRow key={row.resource}>
                      <TableCell className="pl-4 text-sm font-medium">{row.resource}</TableCell>
                      {roleDistribution.map(r => (
                        <TableCell key={r.role} className="text-center">
                          {row[r.role as keyof typeof row] ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-auto" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
