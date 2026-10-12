'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Lock,
  Unlock,
  Users,
  Key,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── Types ───────────────────────────────────────────────────────────────────

interface Role {
  id: string
  name: string
  description: string
  isSystem: boolean
  userCount: number
  permissionCount: number
  permissions: string[]
  createdAt: string
}

const ALL_PERMISSIONS = [
  { category: 'Agents', perms: ['agents:list', 'agents:create', 'agents:edit', 'agents:delete', 'agents:run'] },
  { category: 'Workflows', perms: ['workflows:list', 'workflows:create', 'workflows:edit', 'workflows:delete', 'workflows:run'] },
  { category: 'Documents', perms: ['documents:upload', 'documents:read', 'documents:delete'] },
  { category: 'Knowledge', perms: ['knowledge:query', 'knowledge:manage'] },
  { category: 'Users', perms: ['users:list', 'users:create', 'users:edit', 'users:delete'] },
  { category: 'Roles', perms: ['roles:list', 'roles:create', 'roles:edit', 'roles:delete'] },
  { category: 'Billing', perms: ['billing:read', 'billing:manage'] },
  { category: 'System', perms: ['system:health', 'system:config', 'system:audit'] },
  { category: 'Webhooks', perms: ['webhooks:list', 'webhooks:create', 'webhooks:delete'] },
  { category: 'API Keys', perms: ['apikeys:list', 'apikeys:create', 'apikeys:delete'] },
] as const

const PERM_LABELS: Record<string, string> = {
  'agents:list': 'List Agents',
  'agents:create': 'Create Agents',
  'agents:edit': 'Edit Agents',
  'agents:delete': 'Delete Agents',
  'agents:run': 'Run Agents',
  'workflows:list': 'List Workflows',
  'workflows:create': 'Create Workflows',
  'workflows:edit': 'Edit Workflows',
  'workflows:delete': 'Delete Workflows',
  'workflows:run': 'Run Workflows',
  'documents:upload': 'Upload Documents',
  'documents:read': 'Read Documents',
  'documents:delete': 'Delete Documents',
  'knowledge:query': 'Query Knowledge',
  'knowledge:manage': 'Manage Knowledge',
  'users:list': 'List Users',
  'users:create': 'Create Users',
  'users:edit': 'Edit Users',
  'users:delete': 'Delete Users',
  'roles:list': 'List Roles',
  'roles:create': 'Create Roles',
  'roles:edit': 'Edit Roles',
  'roles:delete': 'Delete Roles',
  'billing:read': 'View Billing',
  'billing:manage': 'Manage Billing',
  'system:health': 'View Health',
  'system:config': 'Configure System',
  'system:audit': 'View Audit Logs',
  'webhooks:list': 'List Webhooks',
  'webhooks:create': 'Create Webhooks',
  'webhooks:delete': 'Delete Webhooks',
  'apikeys:list': 'List API Keys',
  'apikeys:create': 'Create API Keys',
  'apikeys:delete': 'Delete API Keys',
}

// ── Component ───────────────────────────────────────────────────────────────

export default function RoleManagementPanel() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'matrix'>('list')

  // Create / Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
  })
  const [submitting, setSubmitting] = useState(false)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    id: string
    name: string
  }>({ open: false, id: '', name: '' })
  const [deleting, setDeleting] = useState(false)

  // ── Data fetch ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/roles')
      const data = await res.json()
      setRoles(data.data || [])
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

  const resetForm = () => {
    setForm({ name: '', description: '', permissions: [] })
    setEditingId(null)
  }

  const openCreate = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = (role: Role) => {
    setEditingId(role.id)
    setForm({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const isEdit = !!editingId
      const res = await fetch('/api/roles', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...form }),
      })
      if (res.ok) {
        setDialogOpen(false)
        resetForm()
        fetchData()
      }
    } catch {
      // silently handle
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await fetch('/api/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteConfirm.id }),
      })
      setDeleteConfirm({ open: false, id: '', name: '' })
      fetchData()
    } catch {
      // silently handle
    } finally {
      setDeleting(false)
    }
  }

  const togglePermission = (perm: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }))
  }

  const toggleCategoryAll = (perms: readonly string[]) => {
    const allSelected = perms.every((p) => form.permissions.includes(p))
    setForm((prev) => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter((p) => !perms.includes(p as string))
        : [...new Set([...prev.permissions, ...perms])],
    }))
  }

  // ── Stats ──────────────────────────────────────────────────────────────

  const totalRoles = roles.length
  const customRoles = roles.filter((r) => !r.isSystem).length
  const totalPermissions = ALL_PERMISSIONS.reduce((acc, cat) => acc + cat.perms.length, 0)

  // ── Matrix data ────────────────────────────────────────────────────────

  const allPerms = useMemo(
    () => ALL_PERMISSIONS.flatMap((cat) => cat.perms),
    [],
  )

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
        <Skeleton className="h-8 w-56 bg-slate-200" />
        <Skeleton className="h-4 w-80 bg-slate-100" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-slate-100" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl bg-slate-100" />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#1E293B]">Role & Permission Management</h2>
          <p className="text-sm text-[#64748B] mt-1">
            Define roles and granular permissions for access control across the platform
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#003ABC] hover:bg-[#002A99] text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Role
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Roles', value: totalRoles, icon: Shield },
          { label: 'Custom Roles', value: customRoles, icon: Key, color: 'text-purple-500' },
          { label: 'Total Permissions', value: totalPermissions, icon: Lock, color: 'text-amber-500' },
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

      {/* Tabs: List / Matrix */}
      <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'matrix')}>
        <TabsList className="bg-white border border-[#E2E8F0]">
          <TabsTrigger value="list" className="text-[#64748B] data-[state=active]:bg-[#003ABC]/10 data-[state=active]:text-[#003ABC]">
            Role List
          </TabsTrigger>
          <TabsTrigger value="matrix" className="text-[#64748B] data-[state=active]:bg-[#003ABC]/10 data-[state=active]:text-[#003ABC]">
            Permission Matrix
          </TabsTrigger>
        </TabsList>

        {/* ── List View ─────────────────────────────────────────────────── */}
        <TabsContent value="list">
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                    <TableHead className="text-[#64748B] font-medium">Role</TableHead>
                    <TableHead className="text-[#64748B] font-medium">Description</TableHead>
                    <TableHead className="text-[#64748B] font-medium">Permissions</TableHead>
                    <TableHead className="text-[#64748B] font-medium">Users</TableHead>
                    <TableHead className="text-[#64748B] font-medium">Type</TableHead>
                    <TableHead className="text-[#64748B] font-medium text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-[#94A3B8]">
                        No roles found
                      </TableCell>
                    </TableRow>
                  ) : (
                    roles.map((role) => (
                      <TableRow key={role.id} className="border-[#E2E8F0]">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-[#003ABC]/10 flex items-center justify-center">
                              {role.isSystem ? (
                                <Lock className="w-4 h-4 text-[#003ABC]" />
                              ) : (
                                <Unlock className="w-4 h-4 text-[#003ABC]" />
                              )}
                            </div>
                            <span className="text-sm font-medium text-[#1E293B]">{role.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-[#64748B] max-w-[200px] truncate">
                          {role.description}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-[#003ABC]/10 text-[#003ABC] hover:bg-[#003ABC]/10">
                            {role.permissionCount} permissions
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-[#64748B]">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {role.userCount}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              role.isSystem
                                ? 'bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-2 py-0.5'
                                : 'bg-green-100 text-green-700 border-green-200 text-[10px] px-2 py-0.5'
                            }
                          >
                            {role.isSystem ? 'System' : 'Custom'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(role)}
                              className="text-[#003ABC] hover:text-[#002A99] hover:bg-[#003ABC]/5"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {!role.isSystem && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDeleteConfirm({ open: true, id: role.id, name: role.name })
                                }
                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
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
        </TabsContent>

        {/* ── Matrix View ───────────────────────────────────────────────── */}
        <TabsContent value="matrix">
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#E2E8F0] hover:bg-transparent">
                    <TableHead className="text-[#64748B] font-medium sticky left-0 bg-white z-10 min-w-[140px]">
                      Permission
                    </TableHead>
                    {roles.map((role) => (
                      <TableHead key={role.id} className="text-[#64748B] font-medium text-center min-w-[100px]">
                        <span className="text-xs">{role.name}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_PERMISSIONS.map((category) => (
                    <>
                      <TableRow key={category.category} className="border-[#E2E8F0] bg-[#F8FAFC]">
                        <TableCell
                          colSpan={roles.length + 1}
                          className="font-semibold text-[#1E293B] text-xs uppercase tracking-wider py-2"
                        >
                          {category.category}
                        </TableCell>
                      </TableRow>
                      {category.perms.map((perm) => (
                        <TableRow key={perm} className="border-[#E2E8F0]">
                          <TableCell className="text-sm text-[#1E293B] sticky left-0 bg-white z-10">
                            {PERM_LABELS[perm] || perm}
                          </TableCell>
                          {roles.map((role) => {
                            const has = role.permissions.includes(perm)
                            return (
                              <TableCell key={role.id} className="text-center">
                                {has ? (
                                  <Check className="w-4 h-4 text-green-500 mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 text-[#E2E8F0] mx-auto" />
                                )}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#1E293B]">
              {editingId ? 'Edit Role' : 'Create Role'}
            </DialogTitle>
            <DialogDescription className="text-[#64748B]">
              {editingId
                ? 'Modify role details and permission assignments.'
                : 'Define a new custom role with specific permissions.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Role Name</Label>
              <Input
                placeholder="e.g. Content Manager"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="border-[#E2E8F0] focus-visible:ring-[#003ABC]"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-[#1E293B]">Description</Label>
              <Input
                placeholder="Brief description of this role"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="border-[#E2E8F0] focus-visible:ring-[#003ABC]"
              />
            </div>

            <Separator className="bg-[#E2E8F0]" />

            {/* Permissions */}
            <div className="space-y-3">
              <Label className="text-[#1E293B]">Permissions</Label>
              {ALL_PERMISSIONS.map((category) => (
                <div key={category.category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
                      {category.category}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCategoryAll(category.perms)}
                      className="text-xs text-[#003ABC] hover:text-[#002A99] h-6"
                    >
                      {category.perms.every((p) => form.permissions.includes(p)) ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pl-1">
                    {category.perms.map((perm) => (
                      <div key={perm} className="flex items-center gap-2">
                        <Checkbox
                          id={`perm-${perm}`}
                          checked={form.permissions.includes(perm)}
                          onCheckedChange={() => togglePermission(perm)}
                          className="border-[#E2E8F0] data-[state=checked]:bg-[#003ABC] data-[state=checked]:border-[#003ABC]"
                        />
                        <label
                          htmlFor={`perm-${perm}`}
                          className="text-sm text-[#1E293B] cursor-pointer select-none"
                        >
                          {PERM_LABELS[perm] || perm}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-[#94A3B8] pt-1">
                {form.permissions.length} of {allPerms.length} permissions selected
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-[#E2E8F0] text-[#1E293B]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name.trim() || submitting}
              className="bg-[#003ABC] hover:bg-[#002A99] text-white"
            >
              {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ────────────────────────────────────────── */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm((p) => ({ ...p, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1E293B]">Delete Role</AlertDialogTitle>
            <AlertDialogDescription className="text-[#64748B]">
              Are you sure you want to permanently delete &quot;{deleteConfirm.name}&quot;? Users with this role will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#E2E8F0] text-[#1E293B]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? 'Deleting...' : 'Delete Role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}