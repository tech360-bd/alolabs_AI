'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Users,
  UserCheck,
  UserX,
  Search,
  Eye,
  ShieldCheck,
  Building2,
  Clock,
  Mail,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ── Types ───────────────────────────────────────────────────────────────────

interface UserItem {
  id: string
  name: string
  email: string
  role: string
  companyId: string
  companyName: string
  status: 'active' | 'disabled' | 'invited'
  lastLogin: string | null
  createdAt: string
  agentCount: number
  taskCount: number
}

interface CompanyOption {
  id: string
  name: string
}

const ROLE_COLORS: Record<string, string> = {
  'super_admin': 'bg-red-100 text-red-700 border-red-200',
  'admin': 'bg-purple-100 text-purple-700 border-purple-200',
  'manager': 'bg-blue-100 text-blue-700 border-blue-200',
  'member': 'bg-green-100 text-green-700 border-green-200',
  'viewer': 'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  disabled: 'bg-red-500',
  invited: 'bg-amber-500',
}

// ── Component ───────────────────────────────────────────────────────────────

export default function UserManagementPanel() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Detail dialog
  const [detailUser, setDetailUser] = useState<UserItem | null>(null)

  // Toggle
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Data fetch ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, companiesRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/companies'),
      ])
      const usersData = await usersRes.json()
      const companiesData = await companiesRes.json()
      setUsers(usersData.data || [])
      setCompanies(companiesData.data || [])
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleToggle = async (user: UserItem) => {
    setTogglingId(user.id)
    try {
      await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          action: user.status === 'active' ? 'disable' : 'enable',
        }),
      })
      fetchData()
    } catch {
      // silently handle
    } finally {
      setTogglingId(null)
    }
  }

  // ── Filtering ──────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    let result = users
    if (companyFilter !== 'all') {
      result = result.filter((u) => u.companyId === companyFilter)
    }
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((u) => u.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.companyName.toLowerCase().includes(q),
      )
    }
    return result
  }, [users, companyFilter, roleFilter, statusFilter, search])

  // ── Stats ──────────────────────────────────────────────────────────────

  const totalUsers = users.length
  const activeUsers = users.filter((u) => u.status === 'active').length
  const disabledUsers = users.filter((u) => u.status === 'disabled').length
  const adminUsers = users.filter((u) => u.role === 'admin' || u.role === 'super_admin').length

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
        <Skeleton className="h-8 w-56 bg-slate-200" />
        <Skeleton className="h-4 w-80 bg-slate-100" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-slate-100" />
          ))}
        </div>
        <Skeleton className="h-10 w-full bg-slate-100" />
        <Skeleton className="h-96 rounded-xl bg-slate-100" />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-[#1E293B]">User Management</h2>
        <p className="text-sm text-[#64748B] mt-1">
          Manage users across all companies, roles, and access levels
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: totalUsers, icon: Users },
          { label: 'Active', value: activeUsers, icon: UserCheck, color: 'text-green-500' },
          { label: 'Disabled', value: disabledUsers, icon: UserX, color: 'text-red-500' },
          { label: 'Admins', value: adminUsers, icon: ShieldCheck, color: 'text-purple-500' },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-[#F8FAFC] flex items-center justify-center shrink-0">
              <s.icon className={`w-5 h-5 ${s.color ?? 'text-[#003ABC]'}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1E293B]">{s.value}</p>
              <p className="text-xs text-[#64748B]">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white border-[#E2E8F0] focus-visible:ring-[#003ABC]"
          />
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[180px] bg-white border-[#E2E8F0]">
            <SelectValue placeholder="All Companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[160px] bg-white border-[#E2E8F0]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="super_admin">Super Admin</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-white border-[#E2E8F0]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-[#94A3B8]">
          {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                <TableHead className="text-[#64748B] font-medium">User</TableHead>
                <TableHead className="text-[#64748B] font-medium">Role</TableHead>
                <TableHead className="text-[#64748B] font-medium">Company</TableHead>
                <TableHead className="text-[#64748B] font-medium">Status</TableHead>
                <TableHead className="text-[#64748B] font-medium">Last Login</TableHead>
                <TableHead className="text-[#64748B] font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-[#94A3B8]">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="border-[#E2E8F0]">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-[#E2E8F0]">
                          <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-xs font-bold">
                            {user.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-[#1E293B]">{user.name}</p>
                          <p className="text-xs text-[#94A3B8] flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 ${ROLE_COLORS[user.role] || 'bg-slate-100 text-slate-600'}`}
                      >
                        {user.role.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#64748B] text-sm">
                      {user.companyName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[user.status] || ''}`} />
                        <span className="text-sm text-[#1E293B] capitalize">{user.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#94A3B8] text-sm">
                      {user.lastLogin ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(user.lastLogin).toLocaleDateString()}
                        </span>
                      ) : (
                        'Never'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailUser(user)}
                          className="text-[#003ABC] hover:text-[#002A99] hover:bg-[#003ABC]/5"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {user.role !== 'super_admin' && (
                          <div className="flex items-center gap-2 ml-2">
                            <Switch
                              checked={user.status === 'active'}
                              disabled={togglingId === user.id}
                              onCheckedChange={() => handleToggle(user)}
                              className="data-[state=checked]:bg-[#003ABC]"
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── User Detail Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!detailUser} onOpenChange={(open) => !open && setDetailUser(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">User Details</DialogTitle>
            <DialogDescription className="text-[#64748B]">
              Detailed information about this user account
            </DialogDescription>
          </DialogHeader>

          {detailUser && (
            <div className="space-y-4 py-2">
              {/* Avatar + Name */}
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border-2 border-[#E2E8F0]">
                  <AvatarFallback className="bg-[#003ABC]/10 text-[#003ABC] text-lg font-bold">
                    {detailUser.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold text-[#1E293B]">{detailUser.name}</h3>
                  <p className="text-sm text-[#64748B]">{detailUser.email}</p>
                </div>
              </div>

              <Separator className="bg-[#E2E8F0]" />

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[#94A3B8] text-xs">Role</Label>
                  <Badge
                    variant="outline"
                    className={`text-xs px-2 py-0.5 ${ROLE_COLORS[detailUser.role] || ''}`}
                  >
                    {detailUser.role.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <Label className="text-[#94A3B8] text-xs">Status</Label>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[detailUser.status] || ''}`} />
                    <span className="text-sm text-[#1E293B] capitalize">{detailUser.status}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[#94A3B8] text-xs">Company</Label>
                  <div className="flex items-center gap-1.5 text-sm text-[#1E293B]">
                    <Building2 className="w-3.5 h-3.5 text-[#94A3B8]" />
                    {detailUser.companyName}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[#94A3B8] text-xs">Last Login</Label>
                  <div className="flex items-center gap-1.5 text-sm text-[#1E293B]">
                    <Clock className="w-3.5 h-3.5 text-[#94A3B8]" />
                    {detailUser.lastLogin
                      ? new Date(detailUser.lastLogin).toLocaleString()
                      : 'Never'}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[#94A3B8] text-xs">Agents</Label>
                  <p className="text-sm text-[#1E293B]">{detailUser.agentCount} agents</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[#94A3B8] text-xs">Tasks</Label>
                  <p className="text-sm text-[#1E293B]">{detailUser.taskCount} tasks</p>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-[#94A3B8] text-xs">Member Since</Label>
                  <p className="text-sm text-[#1E293B]">
                    {new Date(detailUser.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailUser(null)}
              className="border-[#E2E8F0] text-[#1E293B]"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}